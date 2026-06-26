// ============================================================
// src/components/trip/JoinTripModal.tsx
// Modal per unirsi a un viaggio via codice
// ============================================================
'use client'

import { useState, useTransition } from 'react'
import { joinTrip } from '@/app/trip/actions'

export function JoinTripModal() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await joinTrip(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <>
      <button className="dash-btn dash-btn-secondary" onClick={() => setOpen(true)}>
        🔗 Unisciti
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Unisciti a un viaggio</h2>
              <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
            </div>

            <p className="modal-desc">
              Inserisci il codice di 8 caratteri condiviso dall&apos;organizzatore.
            </p>

            <form onSubmit={handleSubmit}>
              {error && <div className="form-error">{error}</div>}

              <div className="field">
                <label htmlFor="inviteCode">Codice invito</label>
                <input
                  id="inviteCode"
                  name="inviteCode"
                  type="text"
                  required
                  maxLength={8}
                  placeholder="es. AB3F9C2D"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.25rem', textAlign: 'center' }}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Annulla
                </button>
                <button type="submit" className="btn-primary" disabled={isPending}>
                  {isPending ? 'Accesso…' : 'Entra nel viaggio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .dash-btn { padding: 0.7rem 1rem; border-radius: 10px; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
        .dash-btn-secondary { background: #fff; color: #1a1a1a; border: 1px solid #e0e0db; }
        .dash-btn-secondary:hover { background: #f8f7f4; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; display: flex; align-items: flex-end; justify-content: center; backdrop-filter: blur(4px); }
        .modal { background: #fff; border-radius: 20px 20px 0 0; width: 100%; max-width: 500px; padding: 1.5rem; padding-bottom: calc(1.5rem + env(safe-area-inset-bottom)); }
        .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
        .modal-header h2 { font-size: 1.125rem; font-weight: 600; margin: 0; }
        .modal-close { background: none; border: none; font-size: 1rem; color: #9a9a94; cursor: pointer; }
        .modal-desc { font-size: 0.875rem; color: #6b6b6b; margin: 0 0 1.25rem; }
        .form-error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 8px; padding: 0.75rem; font-size: 0.875rem; margin-bottom: 1rem; }
        .field { margin-bottom: 1rem; }
        .field label { display: block; font-size: 0.8125rem; font-weight: 500; color: #3a3a3a; margin-bottom: 0.375rem; }
        .field input { width: 100%; padding: 0.75rem 0.875rem; border: 1px solid #e0e0db; border-radius: 10px; color: #1a1a1a; background: #fafaf8; transition: border-color 0.15s; box-sizing: border-box; }
        .field input:focus { outline: none; border-color: #1D9E75; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); }
        .modal-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 1.5rem; }
        .btn-primary { padding: 0.75rem; background: #1D9E75; color: #fff; border: none; border-radius: 10px; font-size: 0.9375rem; font-weight: 600; cursor: pointer; }
        .btn-primary:disabled { opacity: 0.6; }
        .btn-secondary { padding: 0.75rem; background: #f8f7f4; color: #3a3a3a; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.9375rem; font-weight: 500; cursor: pointer; }
      `}</style>
    </>
  )
}
