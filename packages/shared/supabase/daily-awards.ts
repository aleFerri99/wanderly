// ============================================================
// daily-awards.ts  — Logiche giornaliere J.8 (Gamification V3)
// Chiamato dal cron /api/cron/daily-mvp alle 22:00.
// Usa service role: bypassa RLS per leggere/scrivere su tutti i trip.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { awardCustomPoints } from './gamification'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any

function getSvc(): Svc {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── J.8a: Miglior/Peggior attività di ieri ───────────────────
// Calcola la media voti per ogni attività svolta ieri (status='done')
// che ha almeno un voto. Premia il proponente (+20 / -20).
// Idempotente: controlla il points_log prima di applicare.
export async function applyDailyActivityAwards(
  tripId:    string,
  yesterday: string,   // YYYY-MM-DD
): Promise<string> {
  const svc = getSvc()

  // Guard idempotenza: questi eventi esistono già per ieri?
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const { count: alreadyDone } = await svc
    .from('points_log')
    .select('*', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .in('event_type', ['best_activity', 'worst_activity'])
    .gte('created_at', todayStart.toISOString())

  if ((alreadyDone ?? 0) > 0) return 'già calcolato oggi'

  // Carica attività di ieri con almeno un voto
  // created_by = proposed_by (J.7: campo già esistente, sempre popolato)
  const { data: activitiesRaw } = await svc
    .from('activities')
    .select('id, created_by')
    .eq('trip_id', tripId)
    .eq('activity_date', yesterday)
    .eq('status', 'done')
    .not('created_by', 'is', null)

  if (!activitiesRaw?.length) return 'nessuna attività ieri'

  const activityIds = (activitiesRaw as { id: string; created_by: string }[]).map(a => a.id)
  const creatorMap  = new Map(
    (activitiesRaw as { id: string; created_by: string }[]).map(a => [a.id, a.created_by])
  )

  // Carica le recensioni per quelle attività
  const { data: reviewsRaw } = await svc
    .from('reviews')
    .select('activity_id, score')
    .in('activity_id', activityIds)
    .not('score', 'is', null)

  type ReviewRow = { activity_id: string; score: number }
  const reviews = (reviewsRaw ?? []) as ReviewRow[]

  // Raggruppa score per attività e calcola media
  const scoresByActivity = new Map<string, number[]>()
  for (const r of reviews) {
    if (!scoresByActivity.has(r.activity_id)) scoresByActivity.set(r.activity_id, [])
    scoresByActivity.get(r.activity_id)!.push(r.score)
  }

  type Scored = { actId: string; proposer: string; avg: number }
  const scored: Scored[] = []
  for (const [actId, scores] of scoresByActivity) {
    if (!scores.length) continue
    const proposer = creatorMap.get(actId)
    if (!proposer) continue
    scored.push({ actId, proposer, avg: scores.reduce((s, n) => s + n, 0) / scores.length })
  }

  if (scored.length < 2) return 'meno di 2 attività votate (skip)'

  // Ordina: primo = migliore, ultimo = peggiore
  scored.sort((a, b) => b.avg - a.avg)
  const best  = scored[0]
  const worst = scored[scored.length - 1]

  const ops: Promise<void>[] = []

  // +20 al proponente dell'attività migliore
  ops.push(awardCustomPoints(tripId, best.proposer, 'best_activity', 20, {
    activity_id: best.actId, avg_score: best.avg,
  }))

  // -20 al proponente dell'attività peggiore (solo se è persona diversa)
  if (worst.proposer !== best.proposer || worst.actId !== best.actId) {
    ops.push(awardCustomPoints(tripId, worst.proposer, 'worst_activity', -20, {
      activity_id: worst.actId, avg_score: worst.avg,
    }))
  }

  await Promise.all(ops)

  return `best=${best.proposer.slice(0, 8)} avg=${best.avg.toFixed(1)} | worst=${worst.proposer.slice(0, 8)} avg=${worst.avg.toFixed(1)}`
}

// ── J.8b: Malus inattività -30 ────────────────────────────────
// Se un membro non ha proposto attività nelle ultime 48h applica -30.
// Idempotente per design: controlla points_log prima di applicare.
export async function applyInactivityMalus(tripId: string): Promise<string> {
  const svc = getSvc()

  // Carica tutti i membri del viaggio
  const { data: membersRaw } = await svc
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)

  const members = (membersRaw ?? []) as { user_id: string }[]
  if (!members.length) return 'nessun membro'

  const todayStart  = new Date(); todayStart.setHours(0, 0, 0, 0)
  const cutoff48h   = new Date(Date.now() - 48 * 60 * 60 * 1000)
  let applied = 0

  for (const { user_id } of members) {
    // 1. Malus già applicato oggi per questo membro?
    const { count: alreadyToday } = await svc
      .from('points_log')
      .select('*', { count: 'exact', head: true })
      .eq('trip_id', tripId)
      .eq('user_id', user_id)
      .eq('event_type', 'inattivita')
      .gte('created_at', todayStart.toISOString())

    if ((alreadyToday ?? 0) > 0) continue

    // 2. Ha proposto attività nelle ultime 48h?
    const { count: recentActivity } = await svc
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('trip_id', tripId)
      .eq('created_by', user_id)
      .gte('created_at', cutoff48h.toISOString())

    if ((recentActivity ?? 0) > 0) continue

    // 3. Applica -30
    await awardCustomPoints(tripId, user_id, 'inattivita', -30)
    applied++
  }

  return applied > 0 ? `malus inattività applicato a ${applied} membri` : 'tutti attivi'
}
