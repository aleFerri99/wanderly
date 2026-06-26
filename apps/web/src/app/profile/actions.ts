// ============================================================
// src/app/profile/actions.ts  — Modulo E
// Server Actions per la gestione del profilo utente
// ============================================================
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateMyTravelerProfile } from '@/app/trip/[id]/psicologo/actions'

// ─── AGGIORNA PROFILO ─────────────────────────────────────────
export async function updateProfile(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const languages       = formData.getAll('languages')       as string[]
  const travelInterests = formData.getAll('travelInterests') as string[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error } = await db
    .from('profiles')
    .update({
      full_name:        formData.get('fullName')    as string || null,
      nationality:      formData.get('nationality') as string || null,
      birth_date:       (formData.get('birthDate') as string)?.trim() || null,
      gender:           formData.get('gender')      as string || null,
      languages,
      travel_interests: travelInterests,
      trip_notes:       (formData.get('tripNotes') as string)?.trim() || null,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/profile')

  // Rigenera i profili psicologo per tutti i viaggi dell'utente in background
  // (after() gira dopo la risposta — non blocca il salvataggio)
  after(async () => {
    const { data: memberships } = await db
      .from('trip_members')
      .select('trip_id')
      .eq('user_id', user.id)
    if (memberships?.length) {
      await Promise.all(
        (memberships as { trip_id: string }[]).map(({ trip_id }) =>
          generateMyTravelerProfile(trip_id).catch(() => {})
        )
      )
    }
  })

  return { success: true }
}

// ─── CAMBIA PASSWORD ──────────────────────────────────────────
export async function changePassword(formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const newPassword     = formData.get('newPassword')     as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (newPassword !== confirmPassword) {
    return { error: 'Le password non coincidono.' }
  }
  if (newPassword.length < 8) {
    return { error: 'La password deve essere di almeno 8 caratteri.' }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }
  return { success: true }
}

// ─── ELIMINA ACCOUNT ──────────────────────────────────────────
export async function deleteAccount() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('delete_own_account')
  if (error) return { error: error.message }

  redirect('/auth/login')
}
