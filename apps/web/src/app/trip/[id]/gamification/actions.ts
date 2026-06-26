'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { awardPoints, BATHROOM_DAILY_MAX, BATHROOM_COOLDOWN_SECONDS, POINTS } from '@repo/shared/supabase/gamification'
import { resolveMvpForTrip } from '@repo/shared/supabase/mvp'
import { applyExpenseBonusesForTrip } from '@repo/shared/supabase/trip-end'
import { getAchievementsForTrip, checkBadgesOnTripEnd } from '@repo/shared/supabase/badge-checker'
import type { Profile } from '@repo/shared/types/database'

export interface LeaderboardEntry {
  user_id:      string
  total_points: number
  rank:         number
  profile:      Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>
}

export async function getLeaderboard(tripId: string): Promise<LeaderboardEntry[]> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return []

  // Somma punti AGGREGATA lato DB tramite la vista trip_leaderboard
  // (evita di scaricare tutte le righe di points_log: torna 1 riga per utente con punti)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lbRaw } = await (supabase as any)
    .from('trip_leaderboard')
    .select('user_id, total_points')
    .eq('trip_id', tripId)

  const totals = new Map<string, number>()
  for (const r of (lbRaw ?? []) as { user_id: string; total_points: number }[]) {
    totals.set(r.user_id, Number(r.total_points))
  }

  // Carica tutti i membri del viaggio (per includere anche chi ha 0 punti)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membersRaw } = await (supabase as any)
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)

  const memberIds = ((membersRaw ?? []) as { user_id: string }[]).map(m => m.user_id)

  // Aggiungi 0 punti per i membri senza log
  for (const uid of memberIds) {
    if (!totals.has(uid)) totals.set(uid, 0)
  }

  // Query diretta sui profili per ID — evita join ambigue con foreign key hint
  const allUserIds = [...totals.keys()]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profilesRaw } = await (supabase as any)
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .in('id', allUserIds)

  type ProfileRow = Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>
  const profileMap = new Map<string, ProfileRow>(
    ((profilesRaw ?? []) as ProfileRow[]).map(p => [p.id, p])
  )

  return [...totals.entries()]
    .map(([userId, points]) => ({ user_id: userId, total_points: points }))
    .sort((a, b) => b.total_points - a.total_points)
    .map((e, i) => ({
      ...e,
      rank:    i + 1,
      profile: profileMap.get(e.user_id) ?? {
        id: e.user_id, username: e.user_id.slice(0, 8), full_name: null, avatar_url: null,
      },
    }))
}

export async function getDailyVoteSummary(tripId: string): Promise<{
  voted_for:   string | null
  vote_counts: { user_id: string; count: number }[]
}> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { voted_for: null, vote_counts: [] }

  const today = new Date().toISOString().split('T')[0]

  const [{ data: myVote }, { data: allVotesRaw }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('daily_votes').select('voted_for')
      .eq('trip_id', tripId).eq('voter_id', user.id).eq('vote_date', today)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('daily_votes').select('voted_for')
      .eq('trip_id', tripId).eq('vote_date', today),
  ])

  const votes = (allVotesRaw ?? []) as { voted_for: string }[]
  const countMap = new Map<string, number>()
  for (const v of votes) countMap.set(v.voted_for, (countMap.get(v.voted_for) ?? 0) + 1)

  return {
    voted_for:   (myVote as { voted_for: string } | null)?.voted_for ?? null,
    vote_counts: [...countMap.entries()].map(([user_id, count]) => ({ user_id, count })),
  }
}

export async function castDailyVote(
  tripId: string,
  votedForId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  if (votedForId === user.id) return { error: 'Non puoi votare te stesso' }

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { error: 'Accesso negato' }

  const today = new Date().toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Elimina voto di oggi se già espresso (permette di cambiare idea)
  await db.from('daily_votes').delete()
    .eq('trip_id', tripId).eq('voter_id', user.id).eq('vote_date', today)

  const { data: voteData, error } = await db.from('daily_votes')
    .insert({ trip_id: tripId, voter_id: user.id, voted_for: votedForId, vote_date: today })
    .select('id').single()

  if (error) return { error: error.message }

  // ── Early-close: se tutti i membri hanno votato, risolvi subito ──
  // (senza malus — solo il cron delle 22:00 applica il -20)
  const { count: memberCount } = await supabase
    .from('trip_members').select('*', { count: 'exact', head: true }).eq('trip_id', tripId)

  const { count: voteCount } = await db
    .from('daily_votes').select('*', { count: 'exact', head: true })
    .eq('trip_id', tripId).eq('vote_date', today)

  const totalVoters = (memberCount ?? 0) - 1  // ciascuno vota tranne sé stesso (min)
  if ((voteCount ?? 0) >= totalVoters && totalVoters > 0) {
    await resolveMvpForTrip(tripId, today, false /* no malus in early-close */)
  }

  return { success: true }
}

// ── Pulsante Bagno (+10, max 6/giorno, cooldown 30s) ────────────
export async function awardBathroom(
  tripId:       string,
  targetUserId: string,
): Promise<{ success?: boolean; error?: string; cooldown?: boolean; maxReached?: boolean }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { error: 'Accesso negato' }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── 1. Limite giornaliero: max 6 bagni per target ────────
  const { count: dailyCount } = await db
    .from('points_log')
    .select('*', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .eq('user_id', targetUserId)
    .eq('event_type', 'bathroom')
    .gte('created_at', todayStart.toISOString())

  if ((dailyCount ?? 0) >= BATHROOM_DAILY_MAX) {
    return { maxReached: true, error: `Massimo ${BATHROOM_DAILY_MAX} bagni al giorno raggiunti!` }
  }

  // ── 2. Cooldown 30s anti-spam ─────────────────────────────
  const cooldownThreshold = new Date(Date.now() - BATHROOM_COOLDOWN_SECONDS * 1000).toISOString()
  const { data: recentClick } = await db
    .from('points_log')
    .select('created_at')
    .eq('trip_id', tripId)
    .eq('user_id', targetUserId)
    .eq('event_type', 'bathroom')
    .gte('created_at', cooldownThreshold)
    .limit(1)
    .maybeSingle()

  if (recentClick) {
    return { cooldown: true, error: `Aspetta ${BATHROOM_COOLDOWN_SECONDS}s prima di cliccare di nuovo!` }
  }

  // ── 3. Assegna i punti ────────────────────────────────────
  await awardPoints(tripId, targetUserId, 'bathroom')
  return { success: true }
}

// ── Leggi badge di tutti i membri per la classifica ──────────────
export async function loadTripAchievements(
  tripId: string
): Promise<Record<string, string[]>> {
  return getAchievementsForTrip(tripId)
}

// ── Gara mattutina Speedy (J.9) ──────────────────────────────────
// Attivo dalle 06:00. Il primo membro che preme vince +20.
// Idempotenza garantita dal UNIQUE(trip_id, sprint_date) su daily_sprints.
export async function claimMorningSprint(
  tripId: string
): Promise<{ success?: boolean; error?: string; alreadyClaimed?: boolean; winnerId?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { error: 'Accesso negato' }

  // Sprint disponibile solo dalle 06:00
  const now = new Date()
  if (now.getHours() < 6) return { error: 'La gara parte alle 06:00!' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const today = now.toISOString().split('T')[0]

  // INSERT atomico: ON CONFLICT → qualcun altro ha già vinto oggi
  const { data: sprint, error } = await db
    .from('daily_sprints')
    .insert({ trip_id: tripId, winner_id: user.id, sprint_date: today })
    .select('id, winner_id')
    .single()

  if (error) {
    // Codice 23505 = unique_violation → già reclamato da qualcun altro
    if (error.code === '23505') {
      const { data: existing } = await db
        .from('daily_sprints').select('winner_id')
        .eq('trip_id', tripId).eq('sprint_date', today).single()
      return { alreadyClaimed: true, winnerId: existing?.winner_id }
    }
    return { error: error.message }
  }

  // Primo a premere → +20 punti
  await awardPoints(tripId, user.id, 'morning_sprint')
  return { success: true, winnerId: sprint.winner_id }
}

// ── Stato sprint di oggi ──────────────────────────────────────────
export async function getTodaySprint(
  tripId: string
): Promise<{ winnerId: string | null }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { winnerId: null }

  const today = new Date().toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('daily_sprints').select('winner_id')
    .eq('trip_id', tripId).eq('sprint_date', today)
    .maybeSingle()

  return { winnerId: (data as { winner_id: string } | null)?.winner_id ?? null }
}

// ── Bonus fine viaggio (lazy, chiamato dalla classifica) ─────────
export async function checkAndApplyTripEndBonuses(
  tripId:    string,
  tripEndDate: string | null,
): Promise<{ applied: boolean }> {
  if (!tripEndDate) return { applied: false }

  const today = new Date().toISOString().split('T')[0]
  if (tripEndDate >= today) return { applied: false }  // viaggio non ancora finito

  const result = await applyExpenseBonusesForTrip(tripId)
  const applied = result !== 'già applicati' && result !== 'skip (no dati)'

  // Check badge di fine viaggio (non-blocking)
  if (applied) {
    const { data: membersRaw } = await (await import('@/lib/supabase/server').then(m => m.createServerSupabaseClient()))
      .from('trip_members').select('user_id').eq('trip_id', tripId)
    const memberIds = ((membersRaw ?? []) as { user_id: string }[]).map(m => m.user_id)
    checkBadgesOnTripEnd(tripId, memberIds).catch(() => {})
  }

  return { applied }
}
