'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function upsertReview(
  tripId: string,
  score: number,
  content: string | null,
  activityId?: string,
  dayId?: string
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const record = {
    user_id:     user.id,
    trip_id:     tripId,
    score,
    content:     content || null,
    activity_id: activityId ?? null,
    day_id:      dayId ?? null,
    updated_at:  new Date().toISOString(),
  }

  const conflictCol = activityId ? 'user_id,activity_id' : 'user_id,day_id'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('reviews')
    .upsert(record, { onConflict: conflictCol })

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

export async function deleteReview(tripId: string, reviewId: string) {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId)
  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}
