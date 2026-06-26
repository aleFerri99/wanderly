// ============================================================
// src/app/trip/actions.ts
// Server Actions per creazione e gestione viaggi
// ============================================================
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { seedPackingForUser } from '@repo/shared/supabase/packing'

// ─── CREA VIAGGIO ─────────────────────────────────────────────
export async function createTrip(formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const name = formData.get('name') as string
  const destination = formData.get('destination') as string
  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tripRaw, error } = await (supabase as any)
    .from('trips')
    .insert({
      name,
      destination: destination || null,
      cover_url:   null,
      start_date: startDate || null,
      end_date: endDate || null,
      created_by: user.id,
    })
    .select()
    .single()
  const trip = tripRaw as { id: string } | null

  if (error) return { error: (error as { message: string }).message }
  if (!trip) return { error: 'Errore creazione viaggio' }

  // Genera la packing list AI per il creatore in background (non blocca il redirect)
  const tripId = trip.id
  const creatorId = user.id
  after(async () => { await seedPackingForUser(tripId, creatorId).catch(() => {}) })

  revalidatePath('/dashboard')
  redirect(`/trip/${trip.id}`)
}

// ─── UNISCITI TRAMITE CODICE ──────────────────────────────────
export async function joinTrip(formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const inviteCode = (formData.get('inviteCode') as string).trim().toUpperCase()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tripId, error } = await (supabase as any).rpc('join_trip_by_code', {
    p_invite_code: inviteCode,
  })

  if (error) return { error: error.message }

  // Clona la packing list per il nuovo viaggiatore in background
  const joinedTripId = tripId as string
  const joinerId = user.id
  after(async () => { await seedPackingForUser(joinedTripId, joinerId).catch(() => {}) })

  revalidatePath('/dashboard')
  redirect(`/trip/${tripId}`)
}

// ─── AGGIORNA VIAGGIO ─────────────────────────────────────────
export async function updateTrip(tripId: string, formData: FormData) {
  const supabase = await createServerSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error } = await db
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

// ─── ELIMINA VIAGGIO (solo owner) ────────────────────────────
export async function deleteTrip(tripId: string) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Verifica che l'utente sia l'owner
  const { data: membership } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .single()

  if (!membership || (membership as { role: string }).role !== 'owner') {
    return { error: 'Solo il proprietario può eliminare il viaggio' }
  }

  // La cascade delete su trips elimina automaticamente:
  // trip_members, days, activities, expenses, notes, reviews, trip_suggestions, ecc.
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  redirect('/dashboard')
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
