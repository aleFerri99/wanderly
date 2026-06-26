'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTripContext } from './TripContext'

export function TopAppBar() {
  const pathname    = usePathname()
  const router      = useRouter()
  const { tripId, tripName } = useTripContext()
  const [scrolled, setScrolled]  = useState(false)

  // Rimpicciolisce al scroll (M3 "scroll behavior")
  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const inTrip    = pathname.startsWith('/trip/')
  const inProfile = pathname.startsWith('/profile')
  const inImport  = pathname.startsWith('/import')
  const inAuth    = pathname.startsWith('/auth')

  // Non mostrare nelle pagine di autenticazione
  if (inAuth) return null

  return (
    <header className={`tab-bar${scrolled ? ' tab-bar-scrolled' : ''}`}>
      {/* Leading */}
      <div className="tab-leading">
        {inTrip || inProfile || inImport ? (
          <button
            className="tab-icon-btn"
            aria-label="Indietro"
            onClick={() => {
              // router.back() usa la cronologia del browser:
              // - da AI Hub → torna alla tab precedente del viaggio
              // - da Classifica → torna alla tab precedente
              // - dal Profilo → torna alla pagina del viaggio
              // Fallback a /dashboard se non c'è storia (link diretto)
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back()
              } else {
                router.push('/dashboard')
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : (
          /* Dashboard: nessun pulsante — il titolo "✈️ Wanderly" al centro è sufficiente */
          <div style={{ width: 40 }} />
        )}
      </div>

      {/* Center title */}
      <div className="tab-title">
        {inTrip && tripName
          ? <span className="tab-title-trip">{tripName}</span>
          : inProfile
          ? <span>Il mio profilo</span>
          : inImport
          ? <span>Importa itinerario</span>
          : <span className="tab-title-brand">✈️ Wanderly</span>
        }
      </div>

      {/* Trailing */}
      <div className="tab-trailing">
        {inTrip && tripId && (
          <Link href={`/trip/${tripId}/export`} className="tab-icon-btn" aria-label="Esporta itinerario">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        )}
        {!inTrip && !inProfile && (
          <Link href="/profile" className="tab-icon-btn" aria-label="Profilo">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        )}
      </div>

      <style jsx>{`
        .tab-bar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          height: var(--top-app-bar-h, 56px);
          background: var(--md-surface, #FAFAFA);
          display: flex; align-items: center;
          padding: 0 4px;
          transition: box-shadow 0.25s;
        }
        .tab-bar-scrolled {
          box-shadow: var(--md-elevation-2, 0 2px 8px rgba(124,58,237,.12));
        }
        .tab-leading, .tab-trailing {
          width: 56px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .tab-title {
          flex: 1; text-align: center;
          font-size: 1rem; font-weight: 600; color: var(--md-on-surface, #18181B);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          padding: 0 4px;
        }
        .tab-title-trip {
          font-size: 0.9375rem; font-weight: 700; color: var(--md-on-surface, #18181B);
        }
        .tab-title-brand {
          font-size: 1.0625rem; font-weight: 700; color: var(--md-primary, #7C3AED);
          letter-spacing: -0.01em;
        }
        .tab-icon-btn {
          width: 40px; height: 40px; border-radius: var(--md-radius-full);
          border: none; background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: var(--md-on-surface-variant, #52525B);
          transition: background 0.15s;
          text-decoration: none;
        }
        .tab-icon-btn:hover { background: var(--md-surface-container-low, #F4F4F5); }
        .tab-logo {
          width: 40px; height: 40px; border-radius: var(--md-radius-full);
          display: flex; align-items: center; justify-content: center;
          color: var(--md-primary, #7C3AED); text-decoration: none;
          transition: background 0.15s;
        }
        .tab-logo:hover { background: var(--md-primary-container, #EDE9FE); }
      `}</style>
    </header>
  )
}
