// queries/gamification.ts — CLIENT-SAFE. Letture classifica + voto MVP +
// wrapper delle RPC (bagno/sprint). Niente service role: il DB fa il resto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface LeaderEntry {
  userId:   string
  name:     string
  username: string
  points:   number
  rank:     number
}

export async function getLeaderboard(supabase: SupabaseLike, tripId: string): Promise<LeaderEntry[]> {
  const { data: lb } = await supabase
    .from('trip_leaderboard').select('user_id, total_points').eq('trip_id', tripId)
  const totals = new Map<string, number>()
  for (const r of (lb ?? []) as { user_id: string; total_points: number }[]) {
    totals.set(r.user_id, Number(r.total_points))
  }

  const { data: mems } = await supabase.from('trip_members').select('user_id').eq('trip_id', tripId)
  for (const m of (mems ?? []) as { user_id: string }[]) {
    if (!totals.has(m.user_id)) totals.set(m.user_id, 0)
  }

  const ids = [...totals.keys()]
  const { data: profs } = ids.length
    ? await supabase.from('profiles').select('id, username, full_name').in('id', ids)
    : { data: [] }
  type P = { id: string; username: string; full_name: string | null }
  const pmap = new Map<string, P>(((profs ?? []) as P[]).map(p => [p.id, p]))

  return [...totals.entries()]
    .map(([userId, points]) => ({ userId, points }))
    .sort((a, b) => b.points - a.points)
    .map((e, i) => {
      const p = pmap.get(e.userId)
      return { userId: e.userId, points: e.points, rank: i + 1, name: p?.full_name || p?.username || e.userId.slice(0, 6), username: p?.username ?? '' }
    })
}

export async function getBathroomToday(supabase: SupabaseLike, tripId: string): Promise<Record<string, number>> {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('points_log').select('user_id')
    .eq('trip_id', tripId).eq('event_type', 'bathroom').gte('created_at', start.toISOString())
  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as { user_id: string }[]) counts[r.user_id] = (counts[r.user_id] ?? 0) + 1
  return counts
}

export async function getTodaySprint(supabase: SupabaseLike, tripId: string): Promise<{ winnerId: string | null }> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('daily_sprints').select('winner_id').eq('trip_id', tripId).eq('sprint_date', today).maybeSingle()
  return { winnerId: (data as { winner_id: string } | null)?.winner_id ?? null }
}

export async function getVoteSummary(
  supabase: SupabaseLike, tripId: string, userId: string,
): Promise<{ votedFor: string | null; counts: Record<string, number> }> {
  const today = new Date().toISOString().split('T')[0]
  const { data: all } = await supabase
    .from('daily_votes').select('voter_id, voted_for').eq('trip_id', tripId).eq('vote_date', today)
  const rows = (all ?? []) as { voter_id: string; voted_for: string }[]
  const counts: Record<string, number> = {}
  let votedFor: string | null = null
  for (const v of rows) {
    counts[v.voted_for] = (counts[v.voted_for] ?? 0) + 1
    if (v.voter_id === userId) votedFor = v.voted_for
  }
  return { votedFor, counts }
}

export async function castVote(
  supabase: SupabaseLike, tripId: string, votedFor: string,
): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  if (votedFor === user.id) return { error: 'Non puoi votare te stesso' }
  const today = new Date().toISOString().split('T')[0]
  await supabase.from('daily_votes').delete()
    .eq('trip_id', tripId).eq('voter_id', user.id).eq('vote_date', today)
  const { error } = await supabase.from('daily_votes')
    .insert({ trip_id: tripId, voter_id: user.id, voted_for: votedFor, vote_date: today })
  return { error: error?.message }
}

// ── Wrapper RPC (SECURITY DEFINER) ────────────────────────────
export async function awardBathroom(
  supabase: SupabaseLike, tripId: string, target: string,
): Promise<'ok' | 'max' | 'cooldown' | 'denied' | 'error'> {
  const { data, error } = await supabase.rpc('award_bathroom', { p_trip_id: tripId, p_target: target })
  if (error) return 'error'
  return (data ?? 'error') as 'ok' | 'max' | 'cooldown' | 'denied'
}

export async function claimSprint(
  supabase: SupabaseLike, tripId: string,
): Promise<{ winnerId: string | null; awarded: boolean }> {
  const { data, error } = await supabase.rpc('claim_morning_sprint', { p_trip_id: tripId })
  if (error) return { winnerId: null, awarded: false }
  const res = data as { winner_id: string | null; awarded: boolean }
  return { winnerId: res.winner_id, awarded: res.awarded }
}

// Applica i bonus di fine viaggio (±50) + badge di fine viaggio (Edge, service-role).
// No-op se il viaggio non è ancora finito.
export async function applyTripEndBonuses(
  supabase: SupabaseLike, tripId: string, tripEndDate: string | null,
): Promise<{ applied?: boolean }> {
  const { data } = await supabase.functions.invoke('trip-end', { body: { action: 'trip-end', tripId, tripEndDate } })
  return { applied: data?.applied ?? false }
}

// Verifica i badge da recensione (critico severo / forchetta d'oro) per l'utente.
export async function checkReviewBadges(supabase: SupabaseLike, tripId: string): Promise<void> {
  try { await supabase.functions.invoke('trip-end', { body: { action: 'on-review', tripId } }) } catch { /* non-blocking */ }
}

// Badge di tutti i membri del viaggio: { userId → [badgeId] } (RLS: membri).
export async function getTripBadges(supabase: SupabaseLike, tripId: string): Promise<Record<string, string[]>> {
  const { data } = await supabase
    .from('user_achievements').select('user_id, badge_id').eq('trip_id', tripId)
  const out: Record<string, string[]> = {}
  for (const r of (data ?? []) as { user_id: string; badge_id: string }[]) {
    (out[r.user_id] ??= []).push(r.badge_id)
  }
  return out
}
