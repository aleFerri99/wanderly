// ============================================================
// src/app/trip/[id]/timeline/actions.ts
// Server Actions per giorni e attività
// ============================================================
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ─── GIORNI ───────────────────────────────────────────────────

export async function addDay(
  tripId: string,
  title: string,
  date: string | null,
  dateEnd: string | null,
  position: number
) {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('days')
    .insert({
      trip_id: tripId,
      title,
      date: date || null,
      date_end: dateEnd || null,
      position,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { data }
}

export async function updateDay(
  tripId: string,
  dayId: string,
  title: string,
  date: string | null,
  dateEnd: string | null
) {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('days')
    .update({
      title,
      date: date || null,
      date_end: dateEnd || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dayId)

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

export async function deleteDay(tripId: string, dayId: string) {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('days')
    .delete()
    .eq('id', dayId)

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

// ─── ATTIVITÀ ─────────────────────────────────────────────────

export async function addActivity(
  tripId: string,
  dayId: string,
  title: string,
  timeStart: string | null,
  notes: string | null,
  location: string | null,
  activityDate: string | null,
  position: number
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('activities')
    .insert({
      trip_id: tripId,
      day_id: dayId,
      title,
      time_start: timeStart || null,
      notes: notes || null,
      location: location || null,
      activity_date: activityDate || null,
      position,
      created_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { data }
}

export async function updateActivity(
  tripId: string,
  activityId: string,
  fields: {
    title?: string
    notes?: string | null
    time_start?: string | null
    location?: string | null
    activity_date?: string | null
  }
) {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('activities')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', activityId)

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

export async function toggleActivity(tripId: string, activityId: string, currentStatus: string) {
  const supabase = await createServerSupabaseClient()
  const newStatus = currentStatus === 'done' ? 'todo' : 'done'

  const { error } = await supabase
    .from('activities')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', activityId)

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true, newStatus }
}

export async function deleteActivity(tripId: string, activityId: string) {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId)

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}
