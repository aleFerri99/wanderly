// Edge Function "review" — porta upsertReview (web) su Supabase.
// Upsert recensione (RLS-safe) + assegna punti (review_vote +10, review_text +10)
// + controlla i badge on-review (critico_severo, forchetta_oro) via service-role.
// Body: { action: 'upsert', tripId, score, content?, activityId?, dayId? }
import { corsHeaders, json } from '../_shared/cors.ts'
import { userClient, adminClient, getUser } from '../_shared/client.ts'

const FOOD_KEYWORDS = [
  'ristoran','trattoria','osteria','pizzeria','pizza','cena','pranzo','colazione','brunch',
  'gelateria','pasticceria','bar ','café','caffè','bakery','bistrot','food','sushi','ramen',
  'burger','kebab','street food','mercato','degustazione','dinner','lunch','breakfast','snack',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function awardPoints(admin: any, tripId: string, userId: string, eventType: string, points: number, ref: string | null) {
  await admin.from('points_log').insert({
    trip_id: tripId, user_id: userId, event_type: eventType, reference_id: ref, points, metadata: null,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkBadgesOnReview(admin: any, userId: string, tripId: string) {
  // Critico Severo: ≥1 recensione con voto < 4 e testo ≥ 100 caratteri
  const { data: severe } = await admin
    .from('reviews').select('content').eq('user_id', userId).eq('trip_id', tripId)
    .lt('score', 4).not('content', 'is', null)
  if (((severe ?? []) as { content: string }[]).some(r => (r.content?.length ?? 0) >= 100)) {
    await admin.from('user_achievements').upsert(
      { user_id: userId, trip_id: tripId, badge_id: 'critico_severo' },
      { onConflict: 'user_id,trip_id,badge_id', ignoreDuplicates: true })
  }

  // Forchetta d'Oro: ≥3 recensioni complete su attività food
  const { data: foodRaw } = await admin
    .from('reviews')
    .select('activity_id, content, activity:activities!activity_id(title, location)')
    .eq('user_id', userId).eq('trip_id', tripId)
    .not('activity_id', 'is', null).not('content', 'is', null)
  type R = { content: string | null; activity: { title: string | null; location: string | null } | null }
  const foodCount = ((foodRaw ?? []) as R[]).filter(r => {
    if (!r.content || r.content.length < 5) return false
    const text = `${r.activity?.title ?? ''} ${r.activity?.location ?? ''}`.toLowerCase()
    return FOOD_KEYWORDS.some(kw => text.includes(kw))
  }).length
  if (foodCount >= 3) {
    await admin.from('user_achievements').upsert(
      { user_id: userId, trip_id: tripId, badge_id: 'forchetta_oro' },
      { onConflict: 'user_id,trip_id,badge_id', ignoreDuplicates: true })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await getUser(req)
    if (!user) return json({ error: 'Non autenticato' }, 401)

    const body = await req.json().catch(() => ({})) as {
      action?: string; tripId?: string; score?: number; content?: string | null
      activityId?: string; dayId?: string
    }
    const { tripId, score, content, activityId, dayId } = body
    if (!tripId || typeof score !== 'number') return json({ error: 'Parametri mancanti' }, 400)
    if (score < 1 || score > 10) return json({ error: 'Voto fuori intervallo (1-10)' }, 400)
    if (!activityId && !dayId) return json({ error: 'activityId o dayId richiesto' }, 400)

    const db = userClient(req)

    // Membership
    const { data: mem } = await db
      .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).maybeSingle()
    if (!mem) return json({ error: 'Accesso negato' }, 403)

    // Upsert recensione (RLS: user_id = self)
    const conflictCol = activityId ? 'user_id,activity_id' : 'user_id,day_id'
    const { error } = await db.from('reviews').upsert({
      user_id: user.id, trip_id: tripId, score, content: content || null,
      activity_id: activityId ?? null, day_id: dayId ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: conflictCol })
    if (error) return json({ error: error.message }, 500)

    // Punti + badge via service-role
    const admin = adminClient()
    const ref = activityId ?? dayId ?? null
    await awardPoints(admin, tripId, user.id, 'review_vote', 10, ref)
    if (content && content.trim().length > 0) {
      await awardPoints(admin, tripId, user.id, 'review_text', 10, ref)
    }
    await checkBadgesOnReview(admin, user.id, tripId)

    return json({ success: true })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
