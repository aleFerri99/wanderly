// ============================================================
// src/components/trip/InviteCode.tsx
// Mostra il codice invito con copia/condivisione
// ============================================================
'use client'

import { useState } from 'react'

interface Props {
  inviteCode: string
  tripName: string
}

export function InviteCode({ inviteCode, tripName }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleShare() {
    const url = `${window.location.origin}/join/${inviteCode}`
    if (navigator.share) {
      await navigator.share({
        title: `Unisciti a "${tripName}"`,
        text: `Usa il codice ${inviteCode} su Wanderly`,
        url,
      })
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="invite-card">
      <p className="invite-label">Codice invito</p>
      <div className="invite-code">{inviteCode}</div>
      <div className="invite-actions">
        <button className="invite-btn" onClick={handleCopy}>
          {copied ? '✓ Copiato' : '📋 Copia codice'}
        </button>
        <button className="invite-btn invite-btn-share" onClick={handleShare}>
          🔗 Condividi link
        </button>
      </div>

      <style jsx>{`
        .invite-card {
          background: #f8f7f4;
          border: 1px dashed #c0c0bb;
          border-radius: 12px;
          padding: 1rem;
          text-align: center;
        }
        .invite-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #9a9a94;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin: 0 0 0.5rem;
        }
        .invite-code {
          font-size: 1.75rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          color: #1a1a1a;
          font-family: monospace;
          margin-bottom: 0.75rem;
        }
        .invite-actions {
          display: flex;
          gap: 0.5rem;
          justify-content: center;
        }
        .invite-btn {
          flex: 1;
          padding: 0.6rem 0.75rem;
          border-radius: 8px;
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid #e0e0db;
          background: #fff;
          color: #3a3a3a;
          transition: background 0.15s;
        }
        .invite-btn:hover { background: #f0f0ec; }
        .invite-btn-share {
          background: #E1F5EE;
          border-color: #9FE1CB;
          color: #0F6E56;
        }
        .invite-btn-share:hover { background: #9FE1CB; }
      `}</style>
    </div>
  )
}
