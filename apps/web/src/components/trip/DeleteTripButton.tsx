'use client'

import { useTransition } from 'react'
import { deleteTrip } from '@/app/trip/actions'

interface Props { tripId: string; tripName: string }

export function DeleteTripButton({ tripId, tripName }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm(
      `Sei sicuro di voler eliminare "${tripName}"?\n\nQuesta azione è IRREVERSIBILE e cancellerà tutte le tappe, attività e spese del viaggio.`
    )) return

    startTransition(async () => { await deleteTrip(tripId) })
  }

  return (
    <div className="dtrip-wrap">
      <div className="dtrip-header">
        <span className="dtrip-title">⚠️ Zona pericolosa</span>
        <p className="dtrip-desc">
          L&apos;eliminazione del viaggio è permanente e rimuoverà tutte le tappe,
          attività, spese, note e suggerimenti AI associati.
        </p>
      </div>
      <button
        className="dtrip-btn"
        onClick={handleDelete}
        disabled={isPending}
      >
        {isPending ? 'Eliminazione…' : '🗑 Elimina viaggio'}
      </button>

      <style jsx>{`
        .dtrip-wrap {
          background: var(--md-surface, #FAFAFA);
          border: 1.5px solid var(--md-error-container, #FEE2E2);
          border-radius: var(--md-radius-xl, 24px);
          padding: 1.25rem;
          display: flex; flex-direction: column; gap: 1rem;
        }
        .dtrip-header { display: flex; flex-direction: column; gap: 6px; }
        .dtrip-title {
          font-size: 0.9rem; font-weight: 700;
          color: var(--md-error, #DC2626);
        }
        .dtrip-desc {
          font-size: 0.8125rem;
          color: var(--md-on-surface-variant, #52525B);
          line-height: 1.5; margin: 0;
        }
        .dtrip-btn {
          padding: 0.75rem;
          background: var(--md-error-container, #FEE2E2);
          color: var(--md-error, #DC2626);
          border: 1.5px solid var(--md-error, #DC2626);
          border-radius: var(--md-radius-full);
          font-size: 0.9rem; font-weight: 700;
          cursor: pointer; font-family: inherit;
          transition: background 0.15s;
        }
        .dtrip-btn:hover:not(:disabled) { background: #fecaca; }
        .dtrip-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
