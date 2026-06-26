// ============================================================
// src/app/auth/actions.ts
// Server Actions per registrazione, login, logout
// ============================================================
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ─── REGISTRAZIONE ────────────────────────────────────────────
export async function signUp(formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const email           = formData.get('email')              as string
  const password        = formData.get('password')           as string
  const fullName        = formData.get('fullName')           as string
  const username        = formData.get('username')           as string
  const birthYear       = (formData.get('birthDate') as string)?.trim() || null
  const nationality     = formData.get('nationality')        as string
  const gender          = formData.get('gender')             as string
  const languages       = formData.getAll('languages')       as string[]
  const travelInterests = formData.getAll('travelInterests') as string[]

  const { data: existing } = await supabase
    .from('profiles').select('id').eq('username', username).single()
  if (existing) return { error: 'Username già in uso. Scegline un altro.' }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name:        fullName,
        username,
        birth_date:       birthYear,   // salva solo l'anno: "1995"
        nationality:      nationality     || null,
        gender:           gender          || null,
        languages,
        travel_interests: travelInterests,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error) return { error: error.message }
  return { success: "Controlla la tua email per confermare l'account." }
}

// ─── LOGIN EMAIL/PASSWORD ──────────────────────────────────────
export async function signIn(formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Email o password non corretti.' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// ─── LOGIN CON GOOGLE ─────────────────────────────────────────
export async function signInWithGoogle() {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error || !data.url) redirect('/auth/login?error=oauth')
  redirect(data.url)
}

// ─── LOGOUT ───────────────────────────────────────────────────
export async function signOut() {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/auth/login')
}

// ─── RESET PASSWORD ───────────────────────────────────────────
export async function resetPassword(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const email = formData.get('email') as string

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password`,
  })

  if (error) return { error: error.message }
  return { success: 'Email inviata. Controlla la tua casella.' }
}

// ─── AGGIORNA PASSWORD (dopo aver cliccato il link email) ─────
export async function updatePassword(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const password = formData.get('password') as string

  const { error } = await supabase.auth.updateUser({ password })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
