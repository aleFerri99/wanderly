// ============================================================
// src/app/join/[code]/page.tsx
// Landing page per link di invito: /join/AB3F9C2D
// Fa il join automaticamente se loggato, altrimenti manda al login
// ============================================================
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ code: string }>
}

export default async function JoinPage({ params }: Props) {
  const { code } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Non autenticato: manda al login con redirect al join
  if (!user) {
    redirect(`/auth/login?redirectTo=/join/${code}`)
  }

  // Prova il join
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tripId, error } = await (supabase as any).rpc('join_trip_by_code', {
    p_invite_code: code.toUpperCase(),
  })

  if (error || !tripId) {
    // Codice non valido: torna alla dashboard con errore
    redirect('/dashboard?error=invalid-code')
  }

  // Successo: vai al viaggio
  redirect(`/trip/${tripId}`)
}
