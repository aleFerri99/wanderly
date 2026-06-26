'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface ProfileSnap {
  avatar_url: string | null
  full_name:  string | null
  username:   string
}

// Percorsi dove la barra NON deve comparire (non autenticati)
const HIDDEN_PREFIXES = ['/auth/', '/join/']

export function BottomBar() {
  const pathname  = usePathname()
  const [profile, setProfile]   = useState<ProfileSnap | null>(null)
  const [visible, setVisible]   = useState(false)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setVisible(false); return }

      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, full_name, username')
        .eq('id', user.id)
        .single()

      setProfile(data as ProfileSnap | null)
      setVisible(true)
    }

    load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setVisible(false); setProfile(null) }
      else load()
    })

    return () => subscription.unsubscribe()
  }, [])

  // Non montata finché non c'è utente, o su pagine public
  if (!visible) return null
  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return null

  const isHome    = pathname === '/dashboard' || pathname === '/'
  const isProfile = pathname.startsWith('/profile')

  const initials = (profile?.full_name || profile?.username || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <nav className="btm-bar">
      <Link href="/dashboard" className={`btm-btn${isHome ? ' btm-active' : ''}`}>
        <span className="btm-icon">🏠</span>
        <span className="btm-label">Viaggi</span>
      </Link>

      <div className="btm-divider" />

      <Link href="/profile" className={`btm-btn${isProfile ? ' btm-active' : ''}`}>
        <span className="btm-avatar">
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="profilo" />
            : initials
          }
        </span>
        <span className="btm-label">Profilo</span>
      </Link>
    </nav>
  )
}
