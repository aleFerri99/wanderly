'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { runPsicologoAgent, type TravelerProfileOutput } from '@repo/shared/supabase/agents'
import type { Profile, TravelerProfile } from '@repo/shared/types/database'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type { TravelerProfileOutput }

export interface TravelerProfileWithMember extends TravelerProfile {
  profile: Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>
}

export async function getTravelerProfiles(tripId: string): Promise<TravelerProfileWithMember[]> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return []

  // Carica i profili traveler senza join ambigua
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tpRaw } = await (supabase as any)
    .from('traveler_profiles')
    .select('*')
    .eq('trip_id', tripId)

  if (!tpRaw?.length) return []

  // Query diretta su profiles per gli user_id trovati
  const userIds = (tpRaw as { user_id: string }[]).map(r => r.user_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profilesRaw } = await (supabase as any)
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .in('id', userIds)

  type ProfileSnap = Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>
  const pMap = new Map<string, ProfileSnap>(
    ((profilesRaw ?? []) as ProfileSnap[]).map(p => [p.id, p])
  )

  return (tpRaw as TravelerProfile[]).map(tp => ({
    ...tp,
    profile: pMap.get(tp.user_id) ?? {
      id: tp.user_id, username: tp.user_id.slice(0, 8), full_name: null, avatar_url: null,
    },
  })) as TravelerProfileWithMember[]
}

export async function generateMyTravelerProfile(
  tripId: string
): Promise<{ success?: boolean; error?: string; profile?: TravelerProfileOutput }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { error: 'Accesso negato' }

  // Carica profilo completo (interessi, nazionalità, ecc.)
  const { data: profileRaw } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  const myProfile = profileRaw as Profile | null
  if (!myProfile) return { error: 'Profilo utente non trovato' }

  // Agente Psicologo
  const result = await runPsicologoAgent({
    full_name:        myProfile.full_name,
    nationality:      myProfile.nationality,
    birth_date:       myProfile.birth_date,
    gender:           myProfile.gender,
    languages:        myProfile.languages ?? [],
    travel_interests: myProfile.travel_interests ?? [],
    trip_notes:       myProfile.trip_notes ?? null,
  })

  // UPSERT — sovrascrive se già esiste per (user_id, trip_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
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

  if (error) return { error: error.message }
  return { success: true, profile: result }
}

// ── Genera profili per tutti i membri del viaggio ─────────────
// Usato da refreshTripSuggestions per aggiornare automaticamente
// i profili di tutti i membri quando si aggiornano i suggerimenti.
// Usa service role per poter scrivere profili per conto di altri utenti.
export async function generateAllTravelerProfiles(
  tripId: string
): Promise<{ generated: number; errors: number }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { generated: 0, errors: 0 }

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { generated: 0, errors: 0 }

  // Service role: legge profili di tutti i membri e scrive traveler_profiles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = getServiceClient() as any

  // Carica tutti i membri con i loro profili completi
  const { data: membersRaw } = await svc
    .from('trip_members')
    .select('user_id, profile:profiles(id, full_name, nationality, birth_date, gender, languages, travel_interests, trip_notes)')
    .eq('trip_id', tripId)

  type MemberRow = {
    user_id: string
    profile: {
      id: string; full_name: string | null; nationality: string | null
      birth_date: string | null; gender: string | null
      languages: string[]; travel_interests: string[]
      trip_notes: string | null
    } | null
  }

  const members = (membersRaw ?? []) as MemberRow[]
  let generated = 0
  let errors = 0

  // Genera profili in parallelo (max 3 alla volta per non saturare la Groq API)
  const chunks: MemberRow[][] = []
  for (let i = 0; i < members.length; i += 3) chunks.push(members.slice(i, i + 3))

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (m) => {
      if (!m.profile) { errors++; return }
      try {
        const result = await runPsicologoAgent({
          full_name:        m.profile.full_name,
          nationality:      m.profile.nationality,
          birth_date:       m.profile.birth_date,
          gender:           m.profile.gender,
          languages:        m.profile.languages ?? [],
          travel_interests: m.profile.travel_interests ?? [],
          trip_notes:       m.profile.trip_notes ?? null,
        })
        await svc.from('traveler_profiles').upsert({
          user_id:           m.user_id,
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
        generated++
      } catch {
        errors++
      }
    }))
  }

  return { generated, errors }
}
