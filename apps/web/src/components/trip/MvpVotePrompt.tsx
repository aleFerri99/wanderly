'use client'

// Messaggi minacciosi (ma simpatici) per motivare il voto 😈
const THREAT_MESSAGES = [
  '⚠️ Chi non vota perde 20 punti. Non fare lo struzzo.',
  '😤 I tuoi compagni hanno già votato. Cosa aspetti, una lettera raccomandata?',
  '📉 -20 punti stanno aspettando il tuo nome. Decidi saggiamente.',
  '🔥 Il sondaggio scade alle 22:00. Il karma non dimentica.',
  '👀 Stiamo tutti aspettando il tuo voto. Pressione massima attivata.',
  '💀 Non votare è un lusso che la tua classifica non può permettersi.',
  '🚨 ALLERTA VOTO MANCANTE. Il sistema è in ascolto. Sei in ascolto?',
  '🤡 Solo i clown saltano il sondaggio. Tu non sei un clown, vero?',
  '😈 -20 punti sono già pronti. Basta un voto per bloccarli.',
  '⏰ Il tempo scorre. I punti no — quelli calano.',
]

// Messaggi già nella bottom sheet (header card) per spronare
const HEADER_THREATS = [
  'Vota o perdi 20 punti alle 22:00. Nessuno scherza.',
  'Il tuo portafoglio di punti ti implora. Dai retta.',
  'Fidati: -20 punti fanno sempre male. Vota e dormici sopra.',
  'Tutti guardano. Nessuno aspetta. Vota adesso.',
  'La classifica non ha pietà. Ma tu puoi ancora salvarti.',
]

// MvpVotePrompt — Bottom Sheet bloccante che appare automaticamente:
//   • dal secondo giorno di viaggio
//   • dopo le 09:00 ora locale
//   • se l'utente non ha ancora votato oggi
// L'utente DEVE votare prima di poter usare il resto dell'app.

import { useState, useEffect, useTransition } from 'react'
import { getDailyVoteSummary, castDailyVote } from '@/app/trip/[id]/gamification/actions'
import { BottomSheet } from '@/components/ui/BottomSheet'
import type { Profile } from '@repo/shared/types/database'

interface Props {
  tripId:        string
  currentUserId: string
  members:       Profile[]
  tripStartDate: string | null   // YYYY-MM-DD
}

export function MvpVotePrompt({ tripId, currentUserId, members, tripStartDate }: Props) {
  const [open,       setOpen]       = useState(false)
  const [votedFor,   setVotedFor]   = useState<string | null>(null)
  const [voteCounts, setVoteCounts] = useState<{ user_id: string; count: number }[]>([])
  const [done,       setDone]       = useState(false)   // voto appena espresso
  const [error,      setError]      = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  useEffect(() => {
    if (!tripStartDate) return

    async function check() {
      const now = new Date()

      // ── 1. Almeno il secondo giorno di viaggio ──
      const start   = new Date(tripStartDate + 'T00:00:00')
      const dayTwo  = new Date(start)
      dayTwo.setDate(start.getDate() + 1)
      if (now < dayTwo) return

      // ── 2. Dopo le 09:00 ora locale ──
      if (now.getHours() < 9) return

      // ── 3. Non ha ancora votato oggi ──
      const { voted_for, vote_counts } = await getDailyVoteSummary(tripId)
      setVoteCounts(vote_counts)
      if (voted_for !== null) return   // già votato

      // Tutte le condizioni → apre il panel bloccante
      setOpen(true)
    }

    check()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, tripStartDate])

  function handleVote(votedForId: string) {
    setError(null)
    startTransition(async () => {
      const res = await castDailyVote(tripId, votedForId)
      if (res.error) { setError(res.error); return }

      setVotedFor(votedForId)
      setDone(true)

      // Haptic breve di soddisfazione
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([40, 60, 80])
      }

      // Chiude automaticamente dopo il feedback
      setTimeout(() => setOpen(false), 2000)
    })
  }

  const otherMembers = members.filter(m => m.id !== currentUserId)
  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  // Messaggio casuale ma deterministico (cambia ogni ora così sembra vivo)
  const threatIdx   = Math.floor(Date.now() / 3_600_000) % THREAT_MESSAGES.length
  const headerIdx   = Math.floor(Date.now() / 3_600_000) % HEADER_THREATS.length
  const threatMsg   = THREAT_MESSAGES[threatIdx]
  const headerMsg   = HEADER_THREATS[headerIdx]

  const votedMember = done ? members.find(m => m.id === votedFor) : null

  return (
    <BottomSheet
      isOpen={open}
      onClose={() => {}}   // no-op: bloccante
      title="🗳️ Voto del giorno"
      blocking
    >
      {done ? (
        /* ── Feedback post-voto ── */
        <div className="mvp-done">
          <div className="mvp-done-emoji">🎉</div>
          <p className="mvp-done-title">Voto registrato!</p>
          {votedMember && (
            <p className="mvp-done-sub">
              Hai votato{' '}
              <strong>{votedMember.full_name?.split(' ')[0] || votedMember.username}</strong>{' '}
              come MVP di ieri. +30 punti per lui/lei!
            </p>
          )}
        </div>
      ) : (
        /* ── Schermata di voto ── */
        <div className="mvp-wrap">
          <div className="mvp-header">
            <p className="mvp-date">📅 {today}</p>
            <p className="mvp-desc">
              Chi è stato il <strong>miglior compagno di viaggio</strong> di ieri?
              Il vincitore guadagna <strong>+50 punti</strong>.
            </p>
            <p className="mvp-mandatory">{headerMsg}</p>
          </div>

          {/* Avviso malus con contatore ore rimanenti */}
          <div className="mvp-threat">
            <span className="mvp-threat-icon">⏳</span>
            <div className="mvp-threat-body">
              <p className="mvp-threat-title">Alle 22:00 scatta il malus</p>
              <p className="mvp-threat-msg">{threatMsg}</p>
            </div>
            <span className="mvp-malus-badge">-20 pt</span>
          </div>

          {error && <div className="mvp-error">{error}</div>}

          <div className="mvp-list">
            {otherMembers.length === 0 ? (
              <p className="mvp-empty">Sei l&apos;unico membro del viaggio — nessuno da votare!</p>
            ) : (
              otherMembers.map(m => {
                const vCount = voteCounts.find(v => v.user_id === m.id)?.count ?? 0
                const initials = (m.full_name || m.username || '?')
                  .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

                return (
                  <button
                    key={m.id}
                    className="mvp-member-btn"
                    onClick={() => handleVote(m.id)}
                    disabled={isPending}
                  >
                    <div className="mvp-avatar">
                      {m.avatar_url
                        ? <img src={m.avatar_url} alt={m.username} />
                        : initials
                      }
                    </div>
                    <div className="mvp-member-info">
                      <span className="mvp-member-name">
                        {m.full_name || m.username}
                      </span>
                      {vCount > 0 && (
                        <span className="mvp-member-votes">
                          {vCount} {vCount === 1 ? 'voto' : 'voti'}
                        </span>
                      )}
                    </div>
                    <span className="mvp-vote-arrow">›</span>
                  </button>
                )
              })
            )}
          </div>

          {/* Se unico membro permette di chiudere */}
          {otherMembers.length === 0 && (
            <button className="mvp-skip" onClick={() => setOpen(false)}>
              Chiudi
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        /* ── Post-voto ── */
        .mvp-done { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 1.5rem 0 2rem; text-align: center; }
        .mvp-done-emoji { font-size: 3rem; animation: mvpPop 0.5s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes mvpPop { from{transform:scale(0)} to{transform:scale(1)} }
        .mvp-done-title { font-size: 1.125rem; font-weight: 700; color: var(--md-tertiary,#0D9488); margin: 0; }
        .mvp-done-sub { font-size: 0.875rem; color: var(--md-on-surface-variant,#52525B); margin: 0; line-height: 1.5; }

        /* ── Schermata voto ── */
        .mvp-wrap   { display: flex; flex-direction: column; gap: 1rem; padding-bottom: 0.5rem; }
        .mvp-header { display: flex; flex-direction: column; gap: 6px; background: var(--md-secondary-container,#FEF3C7); border-radius: var(--md-radius-l,16px); padding: 1rem; }
        .mvp-date   { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--md-secondary,#D97706); margin: 0; }
        .mvp-desc   { font-size: 0.9rem; color: var(--md-on-surface,#18181B); margin: 0; line-height: 1.45; }
        .mvp-mandatory { font-size: 0.8rem; color: var(--md-on-surface,#18181B); margin: 0; font-weight: 600; }

        /* Box minaccioso */
        .mvp-threat {
          display: flex; align-items: center; gap: 10px;
          background: var(--md-error-container,#FEE2E2);
          border: 1.5px solid var(--md-error,#DC2626);
          border-radius: var(--md-radius-l,16px);
          padding: 10px 12px;
        }
        .mvp-threat-icon { font-size: 1.5rem; flex-shrink: 0; }
        .mvp-threat-body { flex: 1; min-width: 0; }
        .mvp-threat-title { font-size: 0.8rem; font-weight: 800; color: var(--md-error,#DC2626); margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.04em; }
        .mvp-threat-msg   { font-size: 0.775rem; color: var(--md-on-surface,#18181B); margin: 0; line-height: 1.4; }
        .mvp-malus-badge  { flex-shrink: 0; background: var(--md-error,#DC2626); color: #fff; font-size: 0.75rem; font-weight: 800; padding: 4px 10px; border-radius: var(--md-radius-full); }

        .mvp-error  { background: var(--md-error-container,#FEE2E2); color: var(--md-error,#DC2626); border-radius: var(--md-radius-m,12px); padding: 10px 14px; font-size: 0.85rem; }

        /* ── Lista membri ── */
        .mvp-list { display: flex; flex-direction: column; gap: 8px; }
        .mvp-member-btn {
          width: 100%; display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          background: var(--md-surface,#FAFAFA);
          border: 1.5px solid var(--md-outline-variant,#D4D4D8);
          border-radius: var(--md-radius-xl,24px);
          cursor: pointer; text-align: left; font-family: inherit;
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
        }
        .mvp-member-btn:hover:not(:disabled) {
          border-color: var(--md-primary,#7C3AED);
          background: var(--md-primary-container,#EDE9FE);
          transform: translateY(-1px);
        }
        .mvp-member-btn:active:not(:disabled) { transform: scale(0.98); }
        .mvp-member-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .mvp-avatar {
          width: 44px; height: 44px; border-radius: 50%;
          background: var(--md-primary,#7C3AED); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.8rem; font-weight: 700; overflow: hidden; flex-shrink: 0;
        }
        .mvp-avatar img { width: 100%; height: 100%; object-fit: cover; }

        .mvp-member-info { flex: 1; min-width: 0; }
        .mvp-member-name { display: block; font-size: 0.9375rem; font-weight: 700; color: var(--md-on-surface,#18181B); }
        .mvp-member-votes { font-size: 0.75rem; color: var(--md-secondary,#D97706); font-weight: 600; }
        .mvp-vote-arrow { font-size: 1.25rem; color: var(--md-outline,#A1A1AA); flex-shrink: 0; }

        .mvp-empty { font-size: 0.875rem; color: var(--md-on-surface-variant,#52525B); text-align: center; padding: 1rem; margin: 0; }
        .mvp-skip  { width: 100%; padding: 0.75rem; background: var(--md-surface-container-low,#F4F4F5); border: none; border-radius: var(--md-radius-full); font-size: 0.875rem; font-weight: 600; color: var(--md-on-surface-variant,#52525B); cursor: pointer; font-family: inherit; }
      `}</style>
    </BottomSheet>
  )
}
