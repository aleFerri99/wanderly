// queries/travelerProfiles.ts — CLIENT-SAFE.
// Legge i profili viaggiatore del gruppo e (ri)genera il PROPRIO profilo
// invocando la Edge Function "psicologo".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { TravelerProfile } from '../../types/database'

export interface TravelerProfileWithName extends TravelerProfile {
  name:   string
  isMine: boolean
}

export async function getTravelerProfiles(
  supabase: SupabaseLike, tripId: string, myUserId: string | null,
): Promise<TravelerProfileWithName[]> {
  const { data: tp } = await supabase
    .from('traveler_profiles').select('*').eq('trip_id', tripId)
  const rows = (tp ?? []) as TravelerProfile[]
  if (!rows.length) return []

  const ids = rows.map(r => r.user_id)
  const { data: profs } = await supabase
    .from('profiles').select('id, username, full_name').in('id', ids)
  type P = { id: string; username: string; full_name: string | null }
  const pmap = new Map<string, P>(((profs ?? []) as P[]).map(p => [p.id, p]))

  return rows.map(r => {
    const p = pmap.get(r.user_id)
    return {
      ...r,
      name:   p?.full_name || p?.username || r.user_id.slice(0, 6),
      isMine: r.user_id === myUserId,
    }
  })
}

// Genera i profili per TUTTI i membri (Edge, service-role).
export async function generateAllProfiles(
  supabase: SupabaseLike, tripId: string,
): Promise<{ generated?: number; errors?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('psicologo', { body: { action: 'all', tripId } })
  if (error) return { error: (error as { message?: string }).message }
  if (data?.error) return { error: data.error }
  return { generated: data?.generated, errors: data?.errors }
}

export async function generateMyProfile(
  supabase: SupabaseLike, tripId: string,
): Promise<{ success?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('psicologo', { body: { tripId } })
  if (error) {
    let code: string | undefined
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
      const payload = ctx?.json ? await ctx.json() : null
      code = payload?.error
    } catch { /* body non-JSON */ }
    return { error: code ?? (error as { message?: string }).message }
  }
  if (data?.error) return { error: data.error }
  return { success: true }
}
