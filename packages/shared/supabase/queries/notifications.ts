// queries/notifications.ts — CLIENT-SAFE.
// Sondaggio MVP del giorno (mvp_polls), notifiche in-app e token push.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

const todayUtc = () => new Date().toISOString().split('T')[0]

export interface AppNotification {
  id:         string
  trip_id:    string | null
  type:       string
  title:      string
  body:       string | null
  data:       Record<string, unknown> | null
  read_at:    string | null
  created_at: string
}

// ── Sondaggio MVP del giorno ─────────────────────────────────
// Ritorna il poll aperto di oggi per il viaggio (se esiste).
export async function getOpenMvpPoll(
  supabase: SupabaseLike, tripId: string,
): Promise<{ pollDate: string } | null> {
  const { data } = await supabase
    .from('mvp_polls')
    .select('poll_date, status')
    .eq('trip_id', tripId).eq('poll_date', todayUtc()).eq('status', 'open')
    .maybeSingle()
  return data ? { pollDate: (data as { poll_date: string }).poll_date } : null
}

// ── Notifiche in-app ─────────────────────────────────────────
export async function getNotifications(
  supabase: SupabaseLike, limit = 20,
): Promise<AppNotification[]> {
  const { data } = await supabase
    .from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)
  return (data ?? []) as AppNotification[]
}

export async function getUnreadCount(supabase: SupabaseLike): Promise<number> {
  const { count } = await supabase
    .from('notifications').select('*', { count: 'exact', head: true }).is('read_at', null)
  return count ?? 0
}

export async function markNotificationRead(supabase: SupabaseLike, id: string): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
}

// L'ultima notifica MVP non ancora letta per un viaggio (per mostrare la "minaccia").
export async function getLatestPollNotification(
  supabase: SupabaseLike, tripId: string,
): Promise<AppNotification | null> {
  const { data } = await supabase
    .from('notifications').select('*')
    .eq('trip_id', tripId).eq('type', 'mvp_poll').is('read_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return (data ?? null) as AppNotification | null
}

// ── Token push Expo ──────────────────────────────────────────
export async function savePushToken(
  supabase: SupabaseLike, token: string, platform: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('push_tokens')
    .upsert({ user_id: user.id, token, platform, updated_at: new Date().toISOString() }, { onConflict: 'user_id,token' })
}
