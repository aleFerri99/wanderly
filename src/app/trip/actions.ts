// ============================================================
// src/app/trip/actions.ts
// Server Actions per creazione e gestione viaggi
// ============================================================
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ─── CREA VIAGGIO ─────────────────────────────────────────────
export async function createTrip(formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const name = formData.get('name') as string
  const destination = formData.get('destination') as string
  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string

  const { data: trip, error } = await supabase
    .from('trips')
    .insert({
      name,
      destination: destination || null,
      start_date: startDate || null,
      end_date: endDate || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  redirect(`/trip/${trip.id}`)
}

// ─── UNISCITI TRAMITE CODICE ──────────────────────────────────
export async function joinTrip(formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const inviteCode = (formData.get('inviteCode') as string).trim().toUpperCase()

  const { data: tripId, error } = await supabase.rpc('join_trip_by_code', {
    p_invite_code: inviteCode,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  redirect(`/trip/${tripId}`)
}

// ─── AGGIORNA VIAGGIO ─────────────────────────────────────────
export async function updateTrip(tripId: string, formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('trips')
    .update({
      name: formData.get('name') as string,
      destination: formData.get('destination') as string | null,
      start_date: formData.get('startDate') as string | null,
      end_date: formData.get('endDate') as string | null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tripId)

  if (error) return { error: error.message }

  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

// ─── RIMUOVI MEMBRO ───────────────────────────────────────────
export async function removeMember(tripId: string, userId: string) {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', userId)

  if (error) return { error: error.message }

  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

// ─── ABBANDONA VIAGGIO ────────────────────────────────────────
export async function leaveTrip(tripId: string) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', user.id)

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
