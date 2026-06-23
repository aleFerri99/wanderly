// ============================================================
// src/app/profile/actions.ts  — Modulo E
// Server Actions per la gestione del profilo utente
// ============================================================
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ─── AGGIORNA PROFILO ─────────────────────────────────────────
export async function updateProfile(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const languages       = formData.getAll('languages')       as string[]
  const travelInterests = formData.getAll('travelInterests') as string[]

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name:        formData.get('fullName')    as string || null,
      nationality:      formData.get('nationality') as string || null,
      birth_date:       formData.get('birthDate')   as string || null,
      gender:           formData.get('gender')      as string || null,
      languages,
      travel_interests: travelInterests,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/profile')
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
