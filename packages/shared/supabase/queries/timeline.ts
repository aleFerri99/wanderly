// ============================================================
// queries/timeline.ts — CLIENT-SAFE (web + mobile).
// CRUD timeline con client Supabase iniettato. La RLS garantisce
// che solo i membri del viaggio possano leggere/scrivere.
// (Le versioni web in app/.../timeline/actions.ts aggiungono solo
//  revalidatePath: possono diventare thin wrapper di queste.)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { DayWithActivities, Activity } from '../../types/database'
import { geocodeDestination } from '../weather'

// Geocodifica (Open-Meteo, gratis) il titolo-città delle tappe senza coordinate
// e le salva su days.lat/lng. Best-effort; ritorna i days aggiornati (per i km/mappa).
export async function backfillDayCoords(
  supabase: SupabaseLike, days: DayWithActivities[],
): Promise<DayWithActivities[]> {
  const missing = days.filter(d => (d.lat == null || d.lng == null) && d.title?.trim())
  if (!missing.length) return days
  const coords = new Map<string, { lat: number; lng: number }>()
  await Promise.all(missing.map(async d => {
    const c = await geocodeDestination(d.title)
    if (c) { coords.set(d.id, c); await supabase.from('days').update({ lat: c.lat, lng: c.lng }).eq('id', d.id) }
  }))
  if (coords.size === 0) return days
  return days.map(d => coords.has(d.id) ? { ...d, lat: coords.get(d.id)!.lat, lng: coords.get(d.id)!.lng } : d)
}

// Ordina le attività di un giorno: per orario, poi per posizione
function sortActivities(acts: Activity[]): Activity[] {
  return acts.slice().sort((a, b) => {
    if (a.time_start && b.time_start) return a.time_start.localeCompare(b.time_start)
    if (a.time_start) return -1
    if (b.time_start) return 1
    return a.position - b.position
  })
}

export async function getTripDays(
  supabase: SupabaseLike,
  tripId:   string,
): Promise<DayWithActivities[]> {
  const { data } = await supabase
    .from('days')
    .select('*, activities(*)')
    .eq('trip_id', tripId)
    .order('position', { ascending: true })

  const days = (data ?? []) as DayWithActivities[]
  return days
    .slice()
    .sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date)
      return a.position - b.position
    })
    .map(d => ({ ...d, activities: sortActivities(d.activities ?? []) }))
}

// ── Tappe (days) ──────────────────────────────────────────────
export async function addDay(
  supabase: SupabaseLike,
  params: { tripId: string; title: string; date?: string | null; dateEnd?: string | null; position: number; lat?: number | null; lng?: number | null },
): Promise<{ error?: string }> {
  const { error } = await supabase.from('days').insert({
    trip_id:  params.tripId,
    title:    params.title.trim(),
    date:     params.date || null,
    date_end: params.dateEnd || null,
    position: params.position,
    lat:      params.lat ?? null,
    lng:      params.lng ?? null,
  })
  return { error: error?.message }
}

export async function updateDay(
  supabase: SupabaseLike,
  dayId: string,
  patch: { title?: string; date?: string | null; dateEnd?: string | null; lat?: number | null; lng?: number | null },
): Promise<{ error?: string }> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title   !== undefined) update.title    = patch.title.trim()
  if (patch.date    !== undefined) update.date     = patch.date || null
  if (patch.dateEnd !== undefined) update.date_end = patch.dateEnd || null
  if (patch.lat     !== undefined) update.lat      = patch.lat
  if (patch.lng     !== undefined) update.lng      = patch.lng
  const { error } = await supabase.from('days').update(update).eq('id', dayId)
  return { error: error?.message }
}

export async function deleteDay(supabase: SupabaseLike, dayId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('days').delete().eq('id', dayId)
  return { error: error?.message }
}

export async function addActivity(
  supabase: SupabaseLike,
  params: {
    tripId: string; dayId: string; title: string
    timeStart?: string | null; notes?: string | null
    location?: string | null; activityDate?: string | null
    lat?: number | null; lng?: number | null
    position: number
  },
): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('activities').insert({
    trip_id:       params.tripId,
    day_id:        params.dayId,
    title:         params.title.trim(),
    time_start:    params.timeStart || null,
    notes:         params.notes || null,
    location:      params.location || null,
    activity_date: params.activityDate || null,
    lat:           params.lat ?? null,
    lng:           params.lng ?? null,
    position:      params.position,
    created_by:    user?.id ?? null,
  })
  return { error: error?.message }
}

export async function toggleActivity(
  supabase: SupabaseLike,
  activityId: string,
  currentStatus: 'todo' | 'done',
): Promise<{ error?: string }> {
  const next = currentStatus === 'done' ? 'todo' : 'done'
  const { error } = await supabase
    .from('activities')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', activityId)
  return { error: error?.message }
}

export async function updateActivity(
  supabase: SupabaseLike,
  activityId: string,
  patch: {
    title?:            string
    timeStart?:        string | null
    notes?:            string | null
    location?:         string | null
    durationMinutes?:  number | null
    lat?:              number | null
    lng?:              number | null
  },
): Promise<{ error?: string }> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title           !== undefined) update.title            = patch.title.trim()
  if (patch.timeStart       !== undefined) update.time_start       = patch.timeStart || null
  if (patch.notes           !== undefined) update.notes            = patch.notes || null
  if (patch.location        !== undefined) update.location         = patch.location || null
  if (patch.durationMinutes !== undefined) update.duration_minutes = patch.durationMinutes
  if (patch.lat             !== undefined) update.lat              = patch.lat
  if (patch.lng             !== undefined) update.lng              = patch.lng
  const { error } = await supabase.from('activities').update(update).eq('id', activityId)
  return { error: error?.message }
}

export async function deleteActivity(
  supabase: SupabaseLike,
  activityId: string,
): Promise<{ error?: string }> {
  const { error } = await supabase.from('activities').delete().eq('id', activityId)
  return { error: error?.message }
}

// Smart scheduling AI: assegna orari ottimali alle attività senza orario di una
// giornata, via Edge Function "schedule" (Groq + fallback matematico).
export async function scheduleDay(
  supabase: SupabaseLike,
  params: { tripId: string; dayId: string; dayTitle: string; targetDate: string | null },
): Promise<{ scheduled?: number; summary?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('schedule', { body: params })
  if (error) {
    let code: string | undefined
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
      code = ctx?.json ? (await ctx.json())?.error : undefined
    } catch { /* non-JSON */ }
    return { error: code ?? (error as { message?: string }).message }
  }
  if (data?.error) return { error: data.error }
  return { scheduled: data?.scheduled, summary: data?.summary }
}

// Sposta un'attività in un'altra tappa (aggiorna day_id + activity_date).
export async function moveActivity(
  supabase: SupabaseLike,
  activityId: string,
  newDayId: string,
  newActivityDate: string | null,
): Promise<{ error?: string }> {
  const { error } = await supabase.from('activities')
    .update({ day_id: newDayId, activity_date: newActivityDate, updated_at: new Date().toISOString() })
    .eq('id', activityId)
  return { error: error?.message }
}
