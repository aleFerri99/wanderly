// ============================================================
// src/lib/mvp.ts
// Logica di risoluzione sondaggio MVP — condivisa tra:
//   - /api/cron/daily-mvp (22:00 forzato, with malus)
//   - castDailyVote (early-close quando tutti hanno votato, no malus)
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { POINTS } from './gamification'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Risolve il sondaggio MVP per un trip+giorno.
 * @param withMalus  true → applica -20 ai non-votanti (solo cron alle 22:00)
 * @returns stringa descrittiva del risultato
 */
export async function resolveMvpForTrip(
  tripId:    string,
  voteDate:  string,
  withMalus: boolean,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any

  // ── Idempotenza: già risolto? ────────────────────────────
  const { data: existing } = await db
    .from('mvp_results')
    .select('id')
    .eq('trip_id', tripId)
    .eq('vote_date', voteDate)
    .maybeSingle()

  if (existing) return 'già risolto'

  // ── Carica membri e voti ─────────────────────────────────
  const { data: membersRaw } = await db
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)

  const { data: votesRaw } = await db
    .from('daily_votes')
    .select('voter_id, voted_for')
    .eq('trip_id', tripId)
    .eq('vote_date', voteDate)

  const members  = (membersRaw ?? []) as { user_id: string }[]
  const votes    = (votesRaw  ?? []) as { voter_id: string; voted_for: string }[]

  if (members.length < 2) {
    // Meno di 2 membri: sondaggio non applicabile
    await db.from('mvp_results').insert({ trip_id: tripId, vote_date: voteDate, winner_ids: [], points_each: 0 })
    return 'skip (<2 membri)'
  }

  // ── Malus: -20 a chi non ha votato (solo cron 22:00) ─────
  if (withMalus) {
    const voterIds = new Set(votes.map(v => v.voter_id))
    const nonVoters = members.filter(m => !voterIds.has(m.user_id))

    for (const nv of nonVoters) {
      await db.from('points_log').insert({
        trip_id:    tripId,
        user_id:    nv.user_id,
        event_type: 'mvp_no_vote',
        points:     POINTS.mvp_no_vote,     // -20
        reference_id: null,
        metadata:   { vote_date: voteDate },
      })
    }
  }

  // ── Calcola vincitore(i) ─────────────────────────────────
  if (votes.length === 0) {
    // Nessun voto: segna chiuso senza assegnare punti
    await db.from('mvp_results').insert({ trip_id: tripId, vote_date: voteDate, winner_ids: [], points_each: 0 })
    return `0 voti, ${withMalus ? members.length + ' malus' : 'no malus'}`
  }

  const voteCounts = new Map<string, number>()
  for (const v of votes) {
    voteCounts.set(v.voted_for, (voteCounts.get(v.voted_for) ?? 0) + 1)
  }

  const maxVotes    = Math.max(...voteCounts.values())
  const winners     = [...voteCounts.entries()]
    .filter(([, count]) => count === maxVotes)
    .map(([uid]) => uid)

  // In caso di pareggio: +20 a ciascun pari merito; altrimenti +50 al vincitore
  const isTie        = winners.length > 1
  const pointsEach   = isTie ? POINTS.mvp_tie_winner : POINTS.mvp_winner   // 20 o 50
  const eventType    = isTie ? 'mvp_tie_winner' : 'mvp_winner'

  for (const uid of winners) {
    await db.from('points_log').insert({
      trip_id:     tripId,
      user_id:     uid,
      event_type:  eventType,
      points:      pointsEach,
      reference_id: null,
      metadata:    { vote_date: voteDate, votes_received: maxVotes, is_tie: isTie },
    })
  }

  // ── Segna come risolto ───────────────────────────────────
  await db.from('mvp_results').insert({
    trip_id:     tripId,
    vote_date:   voteDate,
    winner_ids:  winners,
    points_each: pointsEach,
  })

  return isTie
    ? `pareggio ${winners.length} vincitori (+${pointsEach} ciascuno)`
    : `vincitore unico +${pointsEach}`
}
