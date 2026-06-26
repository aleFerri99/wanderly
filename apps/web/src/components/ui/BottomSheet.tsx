'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  isOpen:    boolean
  onClose:   () => void
  title?:    string
  children:  React.ReactNode
  /** Se true: backdrop non chiude, nessun pulsante ✕ — l'utente DEVE completare l'azione */
  blocking?: boolean
}

export function BottomSheet({ isOpen, onClose, title, children, blocking = false }: Props) {
  // mounted: garantisce che server e primo render client siano identici (entrambi null).
  // Il portal viene creato solo dopo l'idratazione, evitando il mismatch SSR/CSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Blocca lo scroll del body quando il panel è aperto
  useEffect(() => {
    if (!mounted) return
    if (isOpen) document.body.style.overflow = 'hidden'
    else        document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen, mounted])

  // Non renderizzare nulla finché non siamo client-side (stessa output del server → no mismatch)
  if (!mounted) return null

  return createPortal(
    <div className={`bs-root${isOpen ? ' bs-open' : ''}`} aria-hidden={!isOpen}>
      {/* Backdrop — in modalità blocking non chiude */}
      <div className="bs-backdrop" onClick={blocking ? undefined : onClose} />

      {/* Panel */}
      <div className="bs-panel" role="dialog" aria-modal="true" aria-label={title}>
        {/* Drag handle */}
        <div className="bs-handle" />

        {title && (
          <div className="bs-header">
            <h3 className="bs-title">{title}</h3>
            {/* Nessun pulsante ✕ in modalità blocking */}
            {!blocking && (
              <button className="bs-close" onClick={onClose} aria-label="Chiudi">✕</button>
            )}
          </div>
        )}

        <div className="bs-content">{children}</div>
      </div>

      <style jsx>{`
        /* Root: full-screen stacking context */
        .bs-root {
          position: fixed; inset: 0; z-index: 500;
          pointer-events: none;
        }
        .bs-open { pointer-events: auto; }

        /* Backdrop */
        .bs-backdrop {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0);
          transition: background 0.3s;
        }
        .bs-open .bs-backdrop { background: rgba(0,0,0,0.45); }

        /* Panel */
        .bs-panel {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: var(--md-surface, #FAFAFA);
          border-radius: var(--md-radius-xxl, 28px) var(--md-radius-xxl, 28px) 0 0;
          padding: 0 0 calc(1.5rem + env(safe-area-inset-bottom));
          max-height: 92dvh;
          overflow-y: auto;
          transform: translateY(100%);
          transition: transform 0.35s cubic-bezier(0.34, 1.12, 0.64, 1);
          box-shadow: 0 -4px 24px rgba(124,58,237,0.12);
        }
        .bs-open .bs-panel { transform: translateY(0); }

        /* Drag handle */
        .bs-handle {
          width: 36px; height: 4px;
          background: var(--md-outline-variant, #D4D4D8);
          border-radius: var(--md-radius-full);
          margin: 12px auto 0;
        }

        /* Header */
        .bs-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 1.25rem 0.5rem;
        }
        .bs-title {
          font-size: 1rem; font-weight: 700;
          color: var(--md-on-surface, #18181B);
          margin: 0;
        }
        .bs-close {
          width: 32px; height: 32px; border-radius: 50%;
          border: none; background: var(--md-surface-container-low, #F4F4F5);
          cursor: pointer; font-size: 0.8rem;
          color: var(--md-on-surface-variant, #52525B);
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s;
        }
        .bs-close:hover { background: var(--md-surface-container, #EEECF8); }

        /* Content */
        .bs-content { padding: 0.75rem 1.25rem 0; }
      `}</style>
    </div>,
    document.body
  )
}
