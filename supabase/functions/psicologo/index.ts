// Edge Function "psicologo" — porta generateMyTravelerProfile (web) su Supabase.
// L'utente genera il PROPRIO profilo viaggiatore: legge la sua riga profiles,
// esegue l'agente Groq, fa upsert in traveler_profiles. Tutto via client
// user-scoped (RLS) — nessun service-role (ognuno scrive solo il proprio profilo).
// Body: { tripId: string }
import { corsHeaders, json } from '../_shared/cors.ts'
import { userClient, adminClient, getUser } from '../_shared/client.ts'
import { runPsicologoAgent, type TravelerProfileOutput } from '../_shared/agents.ts'

type ProfileRow = {
  full_name: string | null; nationality: string | null; birth_date: string | null
  gender: string | null; languages: string[] | null
  travel_interests: string[] | null; trip_notes: string | null
}
function buildUpsert(userId: string, tripId: string, r: TravelerProfileOutput) {
  return {
    user_id: userId, trip_id: tripId,
    adventure_level: r.adventure_level, cultural_interest: r.cultural_interest, food_focus: r.food_focus,
    personality_tags: r.personality_tags, raw_analysis: r.raw_analysis,
    pace_preference: r.pace_preference, social_openness: r.social_openness, novelty_seeking: r.novelty_seeking,
    mobility_level: r.mobility_level, travel_style: r.travel_style, language_comfort: r.language_comfort,
    pace_note: r.pace_note, generated_at: new Date().toISOString(),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await getUser(req)
    if (!user) return json({ error: 'Non autenticato' }, 401)

    const { tripId, action } = await req.json().catch(() => ({})) as { tripId?: string; action?: string }
    if (!tripId) return json({ error: 'tripId mancante' }, 400)

    const db = userClient(req)

    // Membership
    const { data: mem } = await db
      .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).maybeSingle()
    if (!mem) return json({ error: 'Accesso negato' }, 403)

    // ── Azione 'all': genera i profili per TUTTI i membri (service-role) ──
    if (action === 'all') {
      const admin = adminClient()
      const { data: membersRaw } = await admin
        .from('trip_members')
        .select('user_id, profile:profiles(id, full_name, nationality, birth_date, gender, languages, travel_interests, trip_notes)')
        .eq('trip_id', tripId)
      type MemberRow = { user_id: string; profile: ProfileRow | null }
      const members = (membersRaw ?? []) as MemberRow[]
      let generated = 0, errors = 0
      // a blocchi di 3 per non saturare Groq
      for (let i = 0; i < members.length; i += 3) {
        await Promise.all(members.slice(i, i + 3).map(async m => {
          if (!m.profile) { errors++; return }
          try {
            const r = await runPsicologoAgent({
              full_name: m.profile.full_name, nationality: m.profile.nationality, birth_date: m.profile.birth_date,
              gender: m.profile.gender, languages: m.profile.languages ?? [],
              travel_interests: m.profile.travel_interests ?? [], trip_notes: m.profile.trip_notes ?? null,
            })
            await admin.from('traveler_profiles').upsert(buildUpsert(m.user_id, tripId, r), { onConflict: 'user_id,trip_id' })
            generated++
          } catch { errors++ }
        }))
      }
      return json({ success: true, generated, errors })
    }

    // Profilo completo dell'utente
    const { data: profileRaw } = await db.from('profiles').select('*').eq('id', user.id).single()
    const me = profileRaw as {
      full_name: string | null; nationality: string | null; birth_date: string | null
      gender: string | null; languages: string[] | null
      travel_interests: string[] | null; trip_notes: string | null
    } | null
    if (!me) return json({ error: 'Profilo utente non trovato' }, 404)

    const result = await runPsicologoAgent({
      full_name:        me.full_name,
      nationality:      me.nationality,
      birth_date:       me.birth_date,
      gender:           me.gender,
      languages:        me.languages ?? [],
      travel_interests: me.travel_interests ?? [],
      trip_notes:       me.trip_notes ?? null,
    })

    const { error } = await db.from('traveler_profiles').upsert({
      user_id:           user.id,
      trip_id:           tripId,
      adventure_level:   result.adventure_level,
      cultural_interest: result.cultural_interest,
      food_focus:        result.food_focus,
      personality_tags:  result.personality_tags,
      raw_analysis:      result.raw_analysis,
      pace_preference:   result.pace_preference,
      social_openness:   result.social_openness,
      novelty_seeking:   result.novelty_seeking,
      mobility_level:    result.mobility_level,
      travel_style:      result.travel_style,
      language_comfort:  result.language_comfort,
      pace_note:         result.pace_note,
      generated_at:      new Date().toISOString(),
    }, { onConflict: 'user_id,trip_id' })

    if (error) return json({ error: error.message }, 500)
    return json({ success: true, profile: result })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
