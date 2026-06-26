'use client'
// BadgeUnlockToast — animazione badge sbloccato
// Dual-track: Realtime (primary) + polling fallback ogni 30s

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BADGES_BY_ID, type BadgeDef } from '@repo/shared/badges'

interface Props {
  tripId: string
  userId: string
}

const SEEN_KEY = (tripId: string) => `badges_seen_${tripId}`

export function BadgeUnlockToast({ tripId, userId }: Props) {
  const [queue,   setQueue]   = useState<BadgeDef[]>([])
  const [current, setCurrent] = useState<BadgeDef | null>(null)
  const [visible, setVisible] = useState(false)
  const knownRef = useRef<Set<string>>(new Set())

  // Carica i badge già visti da localStorage (persiste tra sessioni — evita rimostrare)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SEEN_KEY(tripId))
      if (stored) knownRef.current = new Set(JSON.parse(stored))
    } catch { /* ignora */ }
  }, [tripId])

  const addToSeen = useCallback((badgeId: string) => {
    knownRef.current.add(badgeId)
    try {
      localStorage.setItem(SEEN_KEY(tripId), JSON.stringify([...knownRef.current]))
    } catch { /* ignora */ }
  }, [tripId])

  const enqueueBadge = useCallback((badge: BadgeDef) => {
    if (knownRef.current.has(badge.id)) return  // già mostrato in questa sessione
    addToSeen(badge.id)
    setQueue(q => [...q, badge])
  }, [addToSeen])

  // ── Check iniziale al mount ───────────────────────────────────
  // Allinea knownRef con i badge già esistenti su DB (così non li ri-mostra)
  // e cattura quelli sbloccati mentre l'utente era offline. Gli aggiornamenti
  // live arrivano via Realtime (sotto): nessun polling periodico → zero query a riposo.
  useEffect(() => {
    const supabase = createClient()

    async function checkNewBadges() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('user_achievements')
        .select('badge_id')
        .eq('user_id', userId)
        .eq('trip_id', tripId)

      for (const row of (data ?? []) as { badge_id: string }[]) {
        if (!knownRef.current.has(row.badge_id)) {
          const def = BADGES_BY_ID.get(row.badge_id)
          if (def) enqueueBadge(def)
        }
      }
    }

    checkNewBadges()
  }, [tripId, userId, enqueueBadge])

  // ── Realtime primary track ────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()

    const ch = supabase
      .channel(`badge-unlock:${userId}:${tripId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'user_achievements',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const badgeId = payload.new?.badge_id as string | undefined
        if (badgeId) {
          const def = BADGES_BY_ID.get(badgeId)
          if (def) enqueueBadge(def)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [tripId, userId, enqueueBadge])

  // ── Processa la coda uno alla volta ──────────────────────────
  useEffect(() => {
    if (current || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    setCurrent(next)
    setVisible(true)

    const t1 = setTimeout(() => setVisible(false), 3800)
    const t2 = setTimeout(() => setCurrent(null), 4400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [queue, current])

  if (!current) return null

  return (
    <>
      <div
        className={visible ? 'bu-overlay bu-show' : 'bu-overlay bu-hide'}
        onClick={() => setVisible(false)}
        role="dialog"
        aria-modal="true"
      >
        {/* Particelle — CSS puro, no JS */}
        <span className={visible ? 'bu-spark bu-s1 bu-spark-show' : 'bu-spark bu-s1'}>✨</span>
        <span className={visible ? 'bu-spark bu-s2 bu-spark-show' : 'bu-spark bu-s2'}>⭐</span>
        <span className={visible ? 'bu-spark bu-s3 bu-spark-show' : 'bu-spark bu-s3'}>🌟</span>
        <span className={visible ? 'bu-spark bu-s4 bu-spark-show' : 'bu-spark bu-s4'}>✨</span>
        <span className={visible ? 'bu-spark bu-s5 bu-spark-show' : 'bu-spark bu-s5'}>⭐</span>
        <span className={visible ? 'bu-spark bu-s6 bu-spark-show' : 'bu-spark bu-s6'}>🌟</span>

        <div
          className={visible ? 'bu-card bu-card-show' : 'bu-card bu-card-hide'}
          onClick={e => e.stopPropagation()}
        >
          <p className="bu-label">🏅 Badge sbloccato!</p>

          <div className="bu-emoji-wrap" style={{ background: current.bgColor }}>
            <span className="bu-emoji">{current.icon}</span>
          </div>

          <h3 className="bu-name" style={{ color: current.color }}>{current.name}</h3>
          <p className="bu-desc">{current.description}</p>

          <button
            className="bu-dismiss"
            style={{ background: current.color }}
            onClick={() => setVisible(false)}
          >
            Fantastico! 🎉
          </button>
        </div>
      </div>

      <style jsx>{`
        /* ── Overlay ── */
        .bu-overlay {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          padding: 1.5rem;
          transition: background 0.35s;
        }
        .bu-show { background: rgba(0,0,0,0.6); }
        .bu-hide { background: rgba(0,0,0,0); pointer-events: none; }

        /* ── Card ── */
        .bu-card {
          background: var(--md-surface, #FAFAFA);
          border-radius: var(--md-radius-xxl, 28px);
          padding: 2rem 1.5rem 1.5rem;
          max-width: 320px; width: 100%;
          display: flex; flex-direction: column; align-items: center; gap: 0.875rem;
          text-align: center;
          box-shadow: 0 24px 64px rgba(0,0,0,0.3);
          transition: opacity 0.3s, transform 0.3s;
        }
        /* Entrata: spring bounce */
        .bu-card-show {
          animation: buCardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        /* Uscita */
        .bu-card-hide {
          animation: buCardOut 0.3s ease-in both;
        }
        @keyframes buCardIn {
          from { opacity: 0; transform: scale(0.55) translateY(50px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes buCardOut {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(0.85) translateY(20px); }
        }

        /* ── Label ── */
        .bu-label {
          font-size: 0.8rem; font-weight: 800; letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--md-on-surface-variant, #52525B);
          animation: buFadeUp 0.4s 0.1s ease-out both;
          margin: 0;
        }

        /* ── Emoji ── */
        .bu-emoji-wrap {
          width: 104px; height: 104px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          animation: buCircleIn 0.55s 0.15s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .bu-emoji {
          font-size: 3.5rem; line-height: 1; display: block;
          animation: buEmojiBounce 0.7s 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes buCircleIn {
          from { transform: scale(0) rotate(-20deg); opacity: 0; }
          to   { transform: scale(1) rotate(0);      opacity: 1; }
        }
        @keyframes buEmojiBounce {
          0%   { transform: scale(0.5) rotate(-10deg); }
          55%  { transform: scale(1.25) rotate(6deg); }
          78%  { transform: scale(0.93) rotate(-2deg); }
          100% { transform: scale(1) rotate(0); }
        }

        /* ── Testo ── */
        .bu-name {
          font-size: 1.25rem; font-weight: 800; margin: 0;
          animation: buFadeUp 0.4s 0.32s ease-out both;
        }
        .bu-desc {
          font-size: 0.85rem; color: var(--md-on-surface-variant,#52525B);
          line-height: 1.5; margin: 0;
          animation: buFadeUp 0.4s 0.42s ease-out both;
        }
        @keyframes buFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Pulsante ── */
        .bu-dismiss {
          color: #fff; border: none; border-radius: var(--md-radius-full);
          padding: 0.75rem 1.5rem;
          font-size: 0.9375rem; font-weight: 700;
          cursor: pointer; font-family: inherit;
          animation: buFadeUp 0.4s 0.52s ease-out both;
          box-shadow: var(--md-elevation-1);
          transition: transform 0.1s;
          width: 100%;
        }
        .bu-dismiss:active { transform: scale(0.97); }

        /* ── Particelle ── */
        .bu-spark {
          position: absolute;
          font-size: 1.5rem;
          pointer-events: none;
          opacity: 0;
        }
        .bu-spark-show { animation: buSparkFloat 1.4s ease-out both; }

        .bu-s1 { top: 18%; left: 8%;   animation-delay: 0.2s; }
        .bu-s2 { top: 12%; right: 10%; animation-delay: 0.35s; }
        .bu-s3 { top: 35%; left: 4%;  animation-delay: 0.15s; }
        .bu-s4 { bottom: 22%; left: 7%;  animation-delay: 0.4s; }
        .bu-s5 { bottom: 18%; right: 8%; animation-delay: 0.28s; }
        .bu-s6 { top: 42%; right: 5%;  animation-delay: 0.32s; }

        @keyframes buSparkFloat {
          0%   { opacity: 0; transform: scale(0.5) translateY(0) rotate(0); }
          25%  { opacity: 1; }
          100% { opacity: 0; transform: scale(1.4) translateY(-70px) rotate(200deg); }
        }
      `}</style>
    </>
  )
}
