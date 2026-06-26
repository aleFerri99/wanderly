// ============================================================
// src/components/trip/CompletionBurst.tsx
// Burst animato quando un giorno viene completato al 100%
// ============================================================
'use client'

import { useEffect, useState } from 'react'

interface Props {
  show: boolean
  message?: string
}

export function CompletionBurst({ show, message = '🎉 Giorno completato!' }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 2800)
      return () => clearTimeout(t)
    }
  }, [show])

  if (!visible) return null

  return (
    <div className="burst-wrap" role="status" aria-live="polite">
      <div className="burst-pill">
        {message}
      </div>

      <style jsx>{`
        .burst-wrap {
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 200;
          pointer-events: none;
          animation: burst-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                     burst-out 0.3s ease-in 2.4s forwards;
        }
        @keyframes burst-in {
          from { opacity: 0; transform: translateX(-50%) scale(0.7) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
        }
        @keyframes burst-out {
          from { opacity: 1; transform: translateX(-50%) scale(1); }
          to   { opacity: 0; transform: translateX(-50%) scale(0.9) translateY(-6px); }
        }
        .burst-pill {
          background: #1D9E75;
          color: #fff;
          font-size: 0.9375rem;
          font-weight: 600;
          padding: 0.625rem 1.25rem;
          border-radius: 99px;
          box-shadow: 0 4px 20px rgba(29,158,117,0.35);
          white-space: nowrap;
        }
        @media (prefers-reduced-motion: reduce) {
          .burst-wrap { animation: none; }
        }
      `}</style>
    </div>
  )
}
