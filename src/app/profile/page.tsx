// ============================================================
// src/app/profile/page.tsx  — Modulo E
// Area privata: visualizza e modifica profilo, cambia password,
// elimina account
// ============================================================
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ProfileForm } from './ProfileForm'
import { signOut } from '@/app/auth/actions'
import type { Profile } from '@/types/database'
import './profile.css'

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as Profile | null

  if (!profile) redirect('/auth/login')

  // Badge temporale
  const memberSince = new Date(profile.created_at)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - memberSince.getTime()) / (1000 * 60 * 60 * 24))
  const memberLabel = diffDays < 30
    ? `${diffDays} ${diffDays === 1 ? 'giorno' : 'giorni'}`
    : diffDays < 365
    ? `${Math.floor(diffDays / 30)} ${Math.floor(diffDays / 30) === 1 ? 'mese' : 'mesi'}`
    : `${Math.floor(diffDays / 365)} ${Math.floor(diffDays / 365) === 1 ? 'anno' : 'anni'}`

  const initials = (profile.full_name || profile.username || 'U')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="profile-page">
      {/* Header */}
      <header className="profile-header">
        <Link href="/dashboard" className="back-btn">← Dashboard</Link>
        <span className="header-title">Il mio profilo</span>
        <div style={{ width: 60 }} />
      </header>

      <main className="profile-main">
        {/* Card identità */}
        <div className="identity-card">
          <div className="avatar-circle">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={profile.username} />
              : <span>{initials}</span>
            }
          </div>
          <div className="identity-info">
            <h1 className="identity-name">{profile.full_name || profile.username}</h1>
            <p className="identity-username">@{profile.username}</p>
            <span className="member-badge">🗓 Membro da {memberLabel}</span>
          </div>
        </div>

        {/* Form modifica profilo + cambio password + delete account */}
        <ProfileForm profile={profile} userEmail={user.email ?? ''} />

        {/* Logout */}
        <form action={signOut}>
          <button type="submit" className="logout-btn">Esci dall&apos;account</button>
        </form>
      </main>
    </div>
  )
}
