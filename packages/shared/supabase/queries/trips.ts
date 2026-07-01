// ============================================================
// queries/trips.ts — CLIENT-SAFE (web + mobile).
// Riceve un client Supabase già autenticato → nessun segreto.
// Richiede la policy "trip_members_select_comembers" (migration 028)
// per leggere i co-membri senza service role.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { Trip } from '../../types/database'
import { fetchDestinationImage } from './images'

export interface TripMemberSnap {
  id:        string
  user_id:   string
  full_name: string | null
  username:  string
}

export interface TripWithMembers extends Trip {
  members:     TripMemberSnap[]
  memberCount: number
}

export async function getUserTrips(
  supabase: SupabaseLike,
  userId:   string,
): Promise<TripWithMembers[]> {
  // 1. ID dei viaggi a cui appartengo (RLS: le mie righe)
  const { data: memberships } = await supabase
    .from('trip_members').select('trip_id').eq('user_id', userId)
  const tripIds = ((memberships ?? []) as { trip_id: string }[]).map(m => m.trip_id)
  if (tripIds.length === 0) return []

  // 2. Dettagli viaggi (RLS: i miei viaggi)
  const { data: tripsRaw } = await supabase
    .from('trips').select('*').in('id', tripIds)
    .order('created_at', { ascending: false })

  // 3. Tutti i membri dei miei viaggi (policy co-membri)
  const { data: membersRaw } = await supabase
    .from('trip_members').select('id, trip_id, user_id').in('trip_id', tripIds)
  const members = (membersRaw ?? []) as { id: string; trip_id: string; user_id: string }[]

  // 4. Profili dei membri
  const memberIds = [...new Set(members.map(m => m.user_id))]
  const { data: profilesRaw } = memberIds.length
    ? await supabase.from('profiles').select('id, username, full_name').in('id', memberIds)
    : { data: [] }
  type ProfRow = { id: string; username: string; full_name: string | null }
  const profMap = new Map<string, ProfRow>(((profilesRaw ?? []) as ProfRow[]).map(p => [p.id, p]))

  // 5. Assembla
  const byTrip = new Map<string, TripMemberSnap[]>()
  for (const m of members) {
    if (!byTrip.has(m.trip_id)) byTrip.set(m.trip_id, [])
    const p = profMap.get(m.user_id)
    byTrip.get(m.trip_id)!.push({
      id: m.id, user_id: m.user_id,
      full_name: p?.full_name ?? null,
      username:  p?.username ?? m.user_id.slice(0, 8),
    })
  }

  return ((tripsRaw ?? []) as Trip[]).map(t => ({
    ...t,
    members:     byTrip.get(t.id) ?? [],
    memberCount: byTrip.get(t.id)?.length ?? 0,
  }))
}

// ── Crea / unisciti a un viaggio ──────────────────────────────
// La insert su `trips` fa scattare i trigger DB che generano invite_code
// e aggiungono il creatore come owner in trip_members.
export async function createTrip(
  supabase: SupabaseLike,
  params: { name: string; destination?: string | null; startDate?: string | null; endDate?: string | null },
): Promise<{ tripId?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { data, error } = await supabase.from('trips').insert({
    name:        params.name.trim(),
    destination: params.destination?.trim() || null,
    start_date:  params.startDate || null,
    end_date:    params.endDate || null,
    created_by:  user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  const tripId = (data as { id: string }).id
  // Valigia personale (best-effort, non blocca)
  supabase.functions.invoke('packing', { body: { tripId } }).catch(() => {})
  return { tripId }
}

// Unisciti tramite codice invito (RPC join_trip_by_code → ritorna trip_id).
export async function joinTrip(
  supabase: SupabaseLike, inviteCode: string,
): Promise<{ tripId?: string; error?: string }> {
  const code = inviteCode.trim().toUpperCase()
  if (!code) return { error: 'Inserisci un codice' }
  const { data, error } = await supabase.rpc('join_trip_by_code', { p_invite_code: code })
  if (error) return { error: error.message }
  if (!data) return { error: 'Codice non valido' }
  const tripId = data as string
  supabase.functions.invoke('packing', { body: { tripId } }).catch(() => {})
  return { tripId }
}

// True se l'URL della copertina arriva da Wikipedia/Wikimedia (fallback keyless).
const isWikiCover = (url?: string | null) => !!url && /wikimedia|wikipedia/i.test(url)

// Backfill copertine: scarica una foto e la salva su trips.cover_url.
// Riguarda i viaggi senza cover, e — se è disponibile la chiave Unsplash —
// anche quelli la cui cover proviene da Wikipedia (così viene "promossa" a Unsplash).
// Ritorna i viaggi aggiornati.
export async function backfillTripCovers(
  supabase: SupabaseLike, trips: TripWithMembers[], unsplashKey?: string | null,
): Promise<TripWithMembers[]> {
  const targets = trips.filter(t =>
    t.destination?.trim() && (!t.cover_url || (unsplashKey && isWikiCover(t.cover_url))),
  )
  if (!targets.length) return trips
  const map = new Map<string, string>()
  await Promise.all(targets.map(async t => {
    const url = await fetchDestinationImage(t.destination!, unsplashKey)
    if (url && url !== t.cover_url) { map.set(t.id, url); await supabase.from('trips').update({ cover_url: url }).eq('id', t.id) }
  }))
  if (!map.size) return trips
  return trips.map(t => map.has(t.id) ? { ...t, cover_url: map.get(t.id)! } : t)
}

// Aggiorna la copertina di un singolo viaggio: scarica solo se manca, oppure se
// la cover è di Wikipedia e ora abbiamo la chiave Unsplash. Ritorna l'URL finale.
export async function refreshTripCover(
  supabase: SupabaseLike,
  tripId: string,
  destination: string | null | undefined,
  currentCover: string | null | undefined,
  unsplashKey?: string | null,
): Promise<string | null> {
  const dest = destination?.trim()
  if (!dest) return currentCover ?? null
  const needs = !currentCover || (!!unsplashKey && isWikiCover(currentCover))
  if (!needs) return currentCover ?? null
  const url = await fetchDestinationImage(dest, unsplashKey)
  if (url && url !== currentCover) {
    await supabase.from('trips').update({ cover_url: url }).eq('id', tripId)
    return url
  }
  return currentCover ?? null
}

// ── Gestione viaggio (modifica / elimina / esci / rimuovi membro) ──
export async function updateTrip(
  supabase: SupabaseLike,
  tripId: string,
  patch: { name?: string; destination?: string | null; startDate?: string | null; endDate?: string | null },
): Promise<{ error?: string }> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name        !== undefined) update.name        = patch.name.trim()
  if (patch.destination !== undefined) update.destination = patch.destination?.trim() || null
  if (patch.startDate   !== undefined) update.start_date  = patch.startDate || null
  if (patch.endDate     !== undefined) update.end_date    = patch.endDate || null
  const { error } = await supabase.from('trips').update(update).eq('id', tripId)
  return { error: error?.message }
}

// Elimina il viaggio (solo owner; la cascade elimina giorni/attività/spese/ecc.).
export async function deleteTrip(supabase: SupabaseLike, tripId: string): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { data: mem } = await supabase
    .from('trip_members').select('role').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem || (mem as { role: string }).role !== 'owner') return { error: 'Solo il proprietario può eliminare il viaggio' }
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  return { error: error?.message }
}

// Esci dal viaggio (elimina la propria membership).
export async function leaveTrip(supabase: SupabaseLike, tripId: string): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { error } = await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', user.id)
  return { error: error?.message }
}

// Rimuovi un membro (lato owner; RLS lo consente).
export async function removeMember(supabase: SupabaseLike, tripId: string, userId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId)
  return { error: error?.message }
}

// ── Gruppo del viaggio: membri con ruolo + codice invito ──────
export interface GroupMember {
  id:         string
  full_name:  string | null
  username:   string
  avatar_url: string | null
  role:       'owner' | 'editor' | 'viewer'
}

export async function getTripGroup(
  supabase: SupabaseLike,
  tripId:   string,
): Promise<{ inviteCode: string | null; members: GroupMember[] }> {
  const { data: trip } = await supabase
    .from('trips').select('invite_code').eq('id', tripId).single()

  const { data: rows } = await supabase
    .from('trip_members').select('user_id, role').eq('trip_id', tripId)
  const memberRows = (rows ?? []) as { user_id: string; role: GroupMember['role'] }[]

  const ids = memberRows.map(m => m.user_id)
  const { data: profs } = ids.length
    ? await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', ids)
    : { data: [] }
  type ProfRow = { id: string; username: string; full_name: string | null; avatar_url: string | null }
  const profMap = new Map<string, ProfRow>(((profs ?? []) as ProfRow[]).map(p => [p.id, p]))

  const roleRank = { owner: 0, editor: 1, viewer: 2 }
  const members: GroupMember[] = memberRows.map(m => {
    const p = profMap.get(m.user_id)
    return {
      id: m.user_id,
      full_name:  p?.full_name ?? null,
      username:   p?.username ?? m.user_id.slice(0, 8),
      avatar_url: p?.avatar_url ?? null,
      role:       m.role,
    }
  }).sort((a, b) => roleRank[a.role] - roleRank[b.role])

  return {
    inviteCode: (trip as { invite_code: string } | null)?.invite_code ?? null,
    members,
  }
}
