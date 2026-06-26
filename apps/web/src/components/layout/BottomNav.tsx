'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import type { ReactElement } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTripContext } from './TripContext'

const ITINERARIO_TABS = ['timeline', 'mappa', 'spese', 'note', 'gruppo']
const AI_TABS         = ['suggerimenti']
const RANK_TABS       = ['classifica']

interface NavItem {
  id:       string
  label:    string
  icon:     () => ReactElement   // icona sempre outline — il pill indicator differenzia l'attivo
  href:     (tripId: string) => string
  alwaysOn: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'home', label: 'Viaggi', alwaysOn: true,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
          stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
    href: () => '/dashboard',
  },
  {
    id: 'ai', label: 'AI Hub', alwaysOn: false,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"
          stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
    href: (id) => id ? `/trip/${id}?tab=suggerimenti` : '/dashboard',
  },
  {
    id: 'classifica', label: 'Classifica', alwaysOn: false,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
    href: (id) => id ? `/trip/${id}?tab=classifica` : '/dashboard',
  },
  {
    id: 'profilo', label: 'Profilo', alwaysOn: true,
    icon: () => (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    href: () => '/profile',
  },
]

function BottomNavInner() {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const { tripId }   = useTripContext()

  // Non mostrare: auth, join, import, homepage, profilo
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/import') ||
    pathname.startsWith('/profile') ||
    pathname === '/dashboard' ||
    pathname === '/'
  ) return null

  const currentTab = searchParams.get('tab') ?? 'timeline'
  const inTrip     = pathname.startsWith('/trip/')
  const inProfile  = pathname.startsWith('/profile')

  function getActiveId(): string {
    if (inProfile)                             return 'profilo'
    if (!inTrip)                               return 'home'
    if (ITINERARIO_TABS.includes(currentTab))  return 'home'
    if (AI_TABS.includes(currentTab))          return 'ai'
    if (RANK_TABS.includes(currentTab))        return 'classifica'
    return 'home'
  }

  const activeId = getActiveId()

  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      <div className="bn-inner">
        {NAV_ITEMS.map((item) => {
          const isActive   = item.id === activeId
          const isDisabled = !item.alwaysOn && !inTrip

          return (
            <Link
              key={item.id}
              href={isDisabled ? '#' : item.href(tripId)}
              className={`bn-item${isActive ? ' bn-active' : ''}${isDisabled ? ' bn-disabled' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
            >
              <span className="bn-indicator">{item.icon()}</span>
              <span className="bn-label">{item.label}</span>
            </Link>
          )
        })}
      </div>

      <style jsx>{`
        /* Full-width per background + border, block per centrare bn-inner facilmente */
        .bottom-nav {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 200;
          background: var(--md-surface, #FAFAFA);
          border-top: 1px solid var(--md-outline-variant, #D4D4D8);
          padding-bottom: env(safe-area-inset-bottom);
        }

        /* Centrato con max-width — icone distribuite uniformemente su qualsiasi schermo */
        .bn-inner {
          max-width: 600px;
          margin: 0 auto;
          height: var(--bottom-nav-h, 80px);
          display: flex;
          align-items: center;
          padding: 0 8px;
        }

        /* Ogni tab occupa 1/4 */
        .bn-item {
          flex: 1;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 3px; padding: 8px 0 4px;
          text-decoration: none;
          color: var(--md-on-surface-variant, #52525B);
          transition: color 0.2s;
          min-width: 0;
        }
        .bn-item:hover:not(.bn-disabled) { color: var(--md-primary, #7C3AED); }

        /* Indicator pill M3 — unico differenziatore visivo per lo stato attivo */
        .bn-indicator {
          width: 64px; height: 32px;
          border-radius: var(--md-radius-full);
          display: flex; align-items: center; justify-content: center;
          transition: background 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .bn-active .bn-indicator { background: var(--md-primary-container, #EDE9FE); }
        .bn-active { color: var(--md-primary, #7C3AED); }

        .bn-label { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.01em; white-space: nowrap; }
        .bn-active .bn-label { font-weight: 700; }

        .bn-disabled { opacity: 0.35; pointer-events: none; }
      `}</style>
    </nav>
  )
}

export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  )
}
