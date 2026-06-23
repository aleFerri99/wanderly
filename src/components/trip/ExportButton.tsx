'use client'

import { useState, useTransition } from 'react'
import { generateExport } from '@/app/trip/[id]/export/actions'

interface Props {
  tripId: string
  tripName: string
}

export function ExportButton({ tripId, tripName }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function getExportData() {
    const result = await generateExport(tripId)
    if ('error' in result) { setError(result.error); return null }
    return result.data
  }

  function handleDownload() {
    setError(null)
    startTransition(async () => {
      const data = await getExportData()
      if (!data) return

      const json   = JSON.stringify(data, null, 2)
      const blob   = new Blob([json], { type: 'application/json' })
      const url    = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = url
      a.download   = `${tripName.replace(/\s+/g, '_')}_wanderly.json`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  async function handleShare() {
    setError(null)
    startTransition(async () => {
      const data = await getExportData()
      if (!data) return

      const json = JSON.stringify(data, null, 2)
      const file = new File([json], `${tripName}_wanderly.json`, { type: 'application/json' })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Itinerario: ${tripName}` })
      } else {
        // Fallback: copia link al viaggio
        await navigator.clipboard.writeText(window.location.href)
        alert('Link copiato negli appunti!')
      }
    })
  }

  return (
    <div className="exp-btn-wrap">
      {error && <p className="exp-btn-error">{error}</p>}

      <div className="exp-btn-row">
        <button className="exp-btn exp-btn-dl" onClick={handleDownload} disabled={isPending}>
          {isPending ? '…' : '⬇️ Scarica itinerario'}
        </button>
        <button className="exp-btn exp-btn-share" onClick={handleShare} disabled={isPending}>
          🔗 Condividi
        </button>
      </div>

      <p className="exp-btn-hint">
        Il file JSON include tutte le tappe e attività. Le recensioni testuali sono escluse per privacy; è inclusa solo la media dei voti.
      </p>

      <style jsx>{`
        .exp-btn-wrap { display: flex; flex-direction: column; gap: 8px; }
        .exp-btn-row { display: flex; gap: 8px; }
        .exp-btn { flex: 1; padding: 0.7rem 0.5rem; border-radius: 10px; font-size: 0.875rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; border: none; }
        .exp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .exp-btn-dl { background: #1D9E75; color: #fff; }
        .exp-btn-dl:hover:not(:disabled) { background: #0F6E56; }
        .exp-btn-share { background: #E1F5EE; color: #0F6E56; border: 1px solid #9FE1CB; }
        .exp-btn-share:hover:not(:disabled) { background: #9FE1CB; }
        .exp-btn-hint { font-size: 0.75rem; color: #9a9a94; line-height: 1.4; margin: 0; }
        .exp-btn-error { font-size: 0.8rem; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 6px 10px; margin: 0; }
      `}</style>
    </div>
  )
}
