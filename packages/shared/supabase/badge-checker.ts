// ============================================================
// badge-checker.ts — logica di valutazione badge
// Usa service role: legge tutti i dati del trip senza RLS
// Ogni check è una singola query mirata (no full-table scan)
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { FOOD_KEYWORDS } from '../badges'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Salva il badge se non già presente (ON CONFLICT DO NOTHING = idempotente)
async function awardBadge(userId: string, tripId: string, badgeId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any
  await db.from('user_achievements').upsert(
    { user_id: userId, trip_id: tripId, badge_id: badgeId },
    { onConflict: 'user_id,trip_id,badge_id', ignoreDuplicates: true }
  )
}

// ── "Critico Severo" ─────────────────────────────────────────
// Almeno 1 recensione con voto < 4 e testo >= 100 caratteri
export async function checkCriticoSevero(userId: string, tripId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any
  const { data } = await db
    .from('reviews')
    .select('content')
    .eq('user_id', userId)
    .eq('trip_id', tripId)
    .lt('score', 4)
    .not('content', 'is', null)

  const qualifies = ((data ?? []) as { content: string }[])
    .some(r => (r.content?.length ?? 0) >= 100)

  if (qualifies) await awardBadge(userId, tripId, 'critico_severo')
}

// ── "Forchetta d'Oro" ────────────────────────────────────────
// Almeno 3 recensioni complete su attività food (keyword matching)
export async function checkForchetaDOro(userId: string, tripId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any

  // Carica le recensioni con il titolo/location dell'attività collegata
  const { data } = await db
    .from('reviews')
    .select('activity_id, content, activity:activities!activity_id(title, location)')
    .eq('user_id', userId)
    .eq('trip_id', tripId)
    .not('activity_id', 'is', null)
    .not('content', 'is', null)

  type ReviewRow = {
    activity_id: string
    content: string | null
    activity: { title: string | null; location: string | null } | null
  }

  const foodReviews = ((data ?? []) as ReviewRow[]).filter(r => {
    if (!r.content || r.content.length < 5) return false
    const text = `${r.activity?.title ?? ''} ${r.activity?.location ?? ''}`.toLowerCase()
    return FOOD_KEYWORDS.some(kw => text.includes(kw))
  })

  if (foodReviews.length >= 3) await awardBadge(userId, tripId, 'forchetta_oro')
}

// ── "Intasatore di Bagni" (solo fine viaggio) ────────────────
// Media bagni > 1/giorno per tutta la durata del viaggio
export async function checkIntasatoreBagni(userId: string, tripId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any

  const [{ count: bathroomCount }, { data: tripRaw }] = await Promise.all([
    db.from('points_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('trip_id', tripId)
      .eq('event_type', 'bathroom'),
    db.from('trips').select('start_date, end_date').eq('id', tripId).single(),
  ])

  const trip = tripRaw as { start_date: string | null; end_date: string | null } | null
  if (!trip?.start_date || !trip?.end_date) return

  const days = Math.max(1, Math.ceil(
    (new Date(trip.end_date + 'T00:00:00').getTime() - new Date(trip.start_date + 'T00:00:00').getTime())
    / 86400000
  ) + 1)

  if ((bathroomCount ?? 0) > days) {
    await awardBadge(userId, tripId, 'intasatore_bagni')
  }
}

// ── "MVP del Viaggio" (solo fine viaggio) ────────────────────
// Utente che ha vinto più MVP giornalieri
export async function checkMvpDelViaggio(tripId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any

  const { data: mvpLogs } = await db
    .from('points_log')
    .select('user_id')
    .eq('trip_id', tripId)
    .in('event_type', ['mvp_winner', 'mvp_tie_winner'])

  if (!mvpLogs?.length) return

  // Conta vittorie per user
  const counts = new Map<string, number>()
  for (const log of mvpLogs as { user_id: string }[]) {
    counts.set(log.user_id, (counts.get(log.user_id) ?? 0) + 1)
  }

  const maxCount  = Math.max(...counts.values())
  const topUsers  = [...counts.entries()].filter(([, c]) => c === maxCount).map(([uid]) => uid)

  for (const uid of topUsers) {
    await awardBadge(uid, tripId, 'mvp_del_viaggio')
  }
}

// ── Punto di ingresso: check on review ───────────────────────
export async function checkBadgesOnReview(userId: string, tripId: string) {
  await Promise.all([
    checkCriticoSevero(userId, tripId),
    checkForchetaDOro(userId, tripId),
  ])
}

// ── Punto di ingresso: check on trip end ─────────────────────
export async function checkBadgesOnTripEnd(tripId: string, memberIds: string[]) {
  await Promise.all([
    ...memberIds.map(uid => checkIntasatoreBagni(uid, tripId)),
    checkMvpDelViaggio(tripId),
  ])
}

// ── Leggi badge di tutti i membri di un viaggio ──────────────
export async function getAchievementsForTrip(
  tripId: string
): Promise<Record<string, string[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any
  const { data } = await db
    .from('user_achievements')
    .select('user_id, badge_id')
    .eq('trip_id', tripId)

  const result: Record<string, string[]> = {}
  for (const row of (data ?? []) as { user_id: string; badge_id: string }[]) {
    if (!result[row.user_id]) result[row.user_id] = []
    result[row.user_id].push(row.badge_id)
  }
  return result
}
