'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'


// In strict TypeScript build il client tipizzato non accetta correttamente
// .insert()/.update() con il nostro Database manuale → usiamo `db` (as any)
// per le mutazioni; il client tipizzato rimane per .select() e auth.

// ─── GIORNI ───────────────────────────────────────────────────

export async function addDay(
  tripId: string, title: string, date: string | null,
  dateEnd: string | null, position: number
) {
  const supabase = await createServerSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('days')
    .insert({ trip_id: tripId, title, date: date || null, date_end: dateEnd || null, position })
    .select().single()
  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { data }
}

export async function updateDay(
  tripId: string, dayId: string, title: string,
  date: string | null, dateEnd: string | null
) {
  const supabase = await createServerSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error } = await db
    .from('days')
    .update({ title, date: date || null, date_end: dateEnd || null, updated_at: new Date().toISOString() })
    .eq('id', dayId)
  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

export async function deleteDay(tripId: string, dayId: string) {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('days').delete().eq('id', dayId)
  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

// ─── ATTIVITÀ ─────────────────────────────────────────────────

export async function addActivity(
  tripId: string, dayId: string, title: string,
  timeStart: string | null, notes: string | null,
  location: string | null, activityDate: string | null, position: number,
  durationMinutes: number | null = null,
  lat: number | null = null,
  lng: number | null = null,
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('activities')
    .insert({
      trip_id: tripId, day_id: dayId, title,
      time_start: timeStart || null, notes: notes || null,
      location: location || null, activity_date: activityDate || null,
      duration_minutes: durationMinutes || null,
      position, created_by: user?.id ?? null,
      ...(lat != null && lng != null ? { lat, lng } : {}),
    })
    .select().single()
  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { data }
}

// Persiste le coordinate geocodificate per un'attività (una tantum dalla mappa).
// Niente revalidatePath: è un aggiornamento silenzioso che non deve ricaricare la UI.
export async function saveActivityCoords(
  tripId: string, activityId: string, lat: number, lng: number,
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('activities')
    .update({ lat, lng })
    .eq('id', activityId)
    .eq('trip_id', tripId)
}

// Persiste le coordinate città di una tappa (una tantum dalla mappa itinerario).
export async function saveDayCoords(
  tripId: string, dayId: string, lat: number, lng: number,
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('days')
    .update({ lat, lng })
    .eq('id', dayId)
    .eq('trip_id', tripId)
}

export async function updateActivity(
  tripId: string, activityId: string,
  fields: {
    title?: string; notes?: string | null; time_start?: string | null
    location?: string | null; activity_date?: string | null
    duration_minutes?: number | null
  }
) {
  const supabase = await createServerSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Se cambia il titolo o il luogo, azzera le coordinate: la mappa le rigeocodifica
  // con il nuovo valore. Modifiche a orario/note/durata non toccano le coordinate.
  let coordReset: { lat: null; lng: null } | Record<string, never> = {}
  if (fields.title !== undefined || fields.location !== undefined) {
    const { data: cur } = await db
      .from('activities').select('title, location').eq('id', activityId).single()
    const c = cur as { title: string; location: string | null } | null
    const titleChanged = c != null && fields.title    !== undefined && fields.title           !== c.title
    const locChanged   = c != null && fields.location !== undefined && (fields.location ?? '') !== (c.location ?? '')
    if (titleChanged || locChanged) coordReset = { lat: null, lng: null }
  }

  const { error } = await db
    .from('activities')
    .update({ ...fields, ...coordReset, updated_at: new Date().toISOString() })
    .eq('id', activityId)
  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

export async function toggleActivity(tripId: string, activityId: string, currentStatus: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const newStatus = currentStatus === 'done' ? 'todo' : 'done'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error } = await db
    .from('activities')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', activityId)
  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true, newStatus }
}

export async function deleteActivity(tripId: string, activityId: string) {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('activities').delete().eq('id', activityId)
  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

// Sposta un'attività in un altro giorno (drag-and-drop)
export async function moveActivity(
  tripId: string,
  activityId: string,
  newDayId: string,
  newActivityDate: string | null,
) {
  const supabase = await createServerSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error } = await db.from('activities')
    .update({ day_id: newDayId, activity_date: newActivityDate, updated_at: new Date().toISOString() })
    .eq('id', activityId)
  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}
