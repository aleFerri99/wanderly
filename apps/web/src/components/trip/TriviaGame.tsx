'use client'
// TriviaGame — J.3: Minigioco Trivia del Luogo
// Fasi: idle → generating → lobby → playing → results

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createTriviaSession,
  startTriviaSession,
  submitTriviaAnswer,
  forceFinalizeTriviaSession,
  getActiveTriviaForTrip,
  type TriviaSession,
  type TriviaQuestion,
} from '@/app/trip/[id]/trivia/actions'
import type { Profile } from '@repo/shared/types/database'

interface Props {
  tripId:        string
  currentUserId: string
  members:       Profile[]
  destination:   string | null
}

type Phase = 'idle' | 'generating' | 'lobby' | 'playing' | 'results'

const SECONDS_PER_QUESTION = 30

export function TriviaGame({ tripId, currentUserId, members, destination }: Props) {
  const supabase = createClient()

  const [phase,       setPhase]       = useState<Phase>('idle')
  const [session,     setSession]     = useState<TriviaSession | null>(null)
  const [qIdx,        setQIdx]        = useState(0)           // indice domanda corrente
  const [selected,    setSelected]    = useState<number | null>(null)  // opzione scelta
  const [revealed,    setRevealed]    = useState(false)       // mostra risposta corretta
  const [timeLeft,    setTimeLeft]    = useState(SECONDS_PER_QUESTION)
  const [userScores,  setUserScores]  = useState<Record<string, number>>({})
  const [myAnswers,   setMyAnswers]   = useState<Record<number, number>>({})  // qIdx → answer
  const [error,       setError]       = useState<string | null>(null)
  const [generating,  setGenerating]  = useState(false)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionStartRef = useRef<number>(0)

  // ── Carica sessione attiva all'apertura ─────────────────────
  const refreshSession = useCallback(async () => {
    const s = await getActiveTriviaForTrip(tripId)
    if (!s) { setPhase('idle'); setSession(null); return }
    setSession(s)

    if (s.status === 'waiting') { setPhase('lobby'); return }

    if (s.status === 'active') {
      // Controlla se l'utente ha già risposto a qualche domanda (stava giocando)
      const alreadyAnswered = Object.keys(myAnswers).length
      if (alreadyAnswered > 0) {
        setPhase('playing')  // stava giocando → riprende
      } else {
        // Non ha ancora partecipato: offre la scelta di unirsi o ignorare
        setPhase('lobby')
      }
      return
    }

    if (s.status === 'finished') {
      const q = s.questions as { questions?: TriviaQuestion[]; scores?: Record<string, number> }
      if (q?.scores) setUserScores(q.scores)
      setPhase('results')
    }
  }, [tripId, myAnswers])

  useEffect(() => {
    refreshSession()

    // Realtime: aggiorna quando la sessione cambia stato
    const ch = supabase.channel(`trivia:${tripId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'trivia_sessions',
        filter: `trip_id=eq.${tripId}`,
      }, () => refreshSession())
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  // ── Timer per domanda corrente ──────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || revealed) return

    setTimeLeft(SECONDS_PER_QUESTION)
    questionStartRef.current = Date.now()

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!)
          handleTimeout()
          return 0
        }
        return t - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, qIdx, revealed])

  function handleTimeout() {
    if (selected !== null) return  // già risposto
    handleAnswer(-1)               // risposta sbagliata per timeout
  }

  // ── Selezione risposta ──────────────────────────────────────
  async function handleAnswer(answerIdx: number) {
    if (!session || selected !== null) return
    if (timerRef.current) clearInterval(timerRef.current)

    const timeMs = Date.now() - questionStartRef.current
    setSelected(answerIdx)
    setRevealed(true)
    setMyAnswers(p => ({ ...p, [qIdx]: answerIdx }))

    // Invia al server
    await submitTriviaAnswer(session.id, tripId, qIdx, answerIdx, timeMs)

    // Dopo 2s passa alla prossima domanda o ai risultati
    setTimeout(() => {
      const questions = getQuestions(session)
      if (qIdx < questions.length - 1) {
        setQIdx(q => q + 1)
        setSelected(null)
        setRevealed(false)
      } else {
        // Ultima domanda: attende la finalizzazione via Realtime
        setPhase('results')
        // Safety: forza finalizzazione dopo 5s se Realtime non arriva
        setTimeout(() => {
          forceFinalizeTriviaSession(session.id, tripId).catch(() => {})
        }, 5000)
      }
    }, 2000)
  }

  // ── Crea nuova sessione ─────────────────────────────────────
  async function handleCreate() {
    setError(null)
    setGenerating(true)
    setPhase('generating')

    const dest = destination || 'la destinazione del viaggio'
    const res  = await createTriviaSession(tripId, dest)

    if (res.error) { setError(res.error); setPhase('idle'); setGenerating(false); return }
    setGenerating(false)
    await refreshSession()
  }

  // ── Avvia gioco (solo creatore) ─────────────────────────────
  async function handleStart() {
    if (!session) return
    setError(null)
    const res = await startTriviaSession(session.id)
    if (res.error) setError(res.error)
    else { setQIdx(0); setSelected(null); setRevealed(false) }
  }

  // ── Reset ───────────────────────────────────────────────────
  function handleReset() {
    setPhase('idle'); setSession(null); setQIdx(0)
    setSelected(null); setRevealed(false); setUserScores({})
    setMyAnswers({}); setError(null)
  }

  // ── Helpers ─────────────────────────────────────────────────
  function getQuestions(s: TriviaSession): TriviaQuestion[] {
    const q = s.questions as TriviaQuestion[] | { questions: TriviaQuestion[]; scores?: Record<string, number> }
    return Array.isArray(q) ? q : (q.questions ?? [])
  }

  function getMemberName(uid: string): string {
    const m = members.find(p => p.id === uid)
    return m?.full_name?.split(' ')[0] || m?.username || uid.slice(0, 6)
  }

  // ── Render ──────────────────────────────────────────────────
  const questions = session ? getQuestions(session) : []
  const currentQ  = questions[qIdx]
  const isCreator = session?.created_by === currentUserId

  return (
    <div className="tg-wrap">

      {/* ── IDLE ── */}
      {phase === 'idle' && (
        <div className="tg-idle">
          <div className="tg-idle-icon">🧠</div>
          <h3 className="tg-idle-title">Trivia del Luogo</h3>
          <p className="tg-idle-desc">
            L'AI genera 10 domande su <strong>{destination || 'la vostra destinazione'}</strong>.
            Chi risponde correttamente più velocemente vince <strong>+15 punti</strong> in classifica!
          </p>
          <button className="tg-btn-primary" onClick={handleCreate}>
            🎲 Crea partita
          </button>
          {error && <p className="tg-error">{error}</p>}
        </div>
      )}

      {/* ── GENERATING ── */}
      {phase === 'generating' && (
        <div className="tg-loading">
          <div className="tg-spinner" />
          <p>L'AI sta preparando le domande su <strong>{destination}</strong>…</p>
          <p className="tg-loading-hint">Fino a 15 secondi</p>
        </div>
      )}

      {/* ── LOBBY ── */}
      {phase === 'lobby' && session && (
        <div className="tg-lobby">
          <div className="tg-lobby-header">
            <span className="tg-lobby-icon">{session.status === 'active' ? '⚡' : '🎯'}</span>
            <div>
              <p className="tg-lobby-title">
                {session.status === 'active' ? 'Partita in corso!' : 'Partita pronta!'}
              </p>
              <p className="tg-lobby-dest">10 domande su <strong>{session.destination}</strong></p>
            </div>
          </div>

          <div className="tg-members-list">
            {members.map(m => (
              <div key={m.id} className="tg-member-row">
                <span className="tg-member-avatar">
                  {(m.full_name || m.username || '?')[0].toUpperCase()}
                </span>
                <span className="tg-member-name">
                  {m.full_name?.split(' ')[0] || m.username}
                  {m.id === currentUserId && <span className="tg-you">tu</span>}
                  {m.id === session.created_by && <span className="tg-host">host</span>}
                </span>
                <span className="tg-member-ready">✓</span>
              </div>
            ))}
          </div>

          {error && <p className="tg-error">{error}</p>}

          {session.status === 'active' ? (
            /* Partita già avviata — l'utente può unirsi o ignorare */
            <div className="tg-join-wrap">
              <button className="tg-btn-primary" onClick={() => { setQIdx(0); setSelected(null); setRevealed(false); setPhase('playing') }}>
                ⚡ Unisciti alla partita
              </button>
              <button className="tg-btn-secondary" onClick={handleReset}>
                Ignora
              </button>
            </div>
          ) : isCreator ? (
            <button className="tg-btn-primary" onClick={handleStart}>
              ▶ Inizia la partita
            </button>
          ) : (
            <p className="tg-waiting">In attesa che {getMemberName(session.created_by)} avvii il gioco…</p>
          )}
        </div>
      )}

      {/* ── PLAYING ── */}
      {phase === 'playing' && session && currentQ && (
        <div className="tg-game">
          {/* Progresso */}
          <div className="tg-progress">
            <span className="tg-q-counter">Domanda {qIdx + 1} / {questions.length}</span>
            <div className="tg-timer-bar">
              <div
                className={`tg-timer-fill${timeLeft <= 10 ? ' tg-timer-urgent' : ''}`}
                style={{ width: `${(timeLeft / SECONDS_PER_QUESTION) * 100}%` }}
              />
            </div>
            <span className={`tg-timer-num${timeLeft <= 10 ? ' tg-timer-num-urgent' : ''}`}>
              {timeLeft}s
            </span>
          </div>

          {/* Domanda */}
          <div className="tg-question-card">
            <p className="tg-question-text">{currentQ.q}</p>
          </div>

          {/* Opzioni */}
          <div className="tg-options">
            {currentQ.opts.map((opt, i) => {
              let cls = 'tg-option'
              if (revealed) {
                if (i === currentQ.correct_idx) cls += ' tg-option-correct'
                else if (i === selected)        cls += ' tg-option-wrong'
                else                            cls += ' tg-option-dim'
              } else if (i === selected) {
                cls += ' tg-option-selected'
              }
              return (
                <button
                  key={i}
                  className={cls}
                  onClick={() => !revealed && handleAnswer(i)}
                  disabled={revealed || selected !== null}
                >
                  <span className="tg-option-letter">{String.fromCharCode(65 + i)}</span>
                  <span className="tg-option-text">{opt}</span>
                  {revealed && i === currentQ.correct_idx && <span className="tg-tick">✓</span>}
                  {revealed && i === selected && i !== currentQ.correct_idx && <span className="tg-cross">✗</span>}
                </button>
              )
            })}
          </div>

          {revealed && selected === currentQ.correct_idx && (
            <p className="tg-feedback tg-feedback-ok">🎉 Corretto! +{100 + Math.max(0, Math.floor((30000 - (Date.now() - questionStartRef.current)) / 500))} pt</p>
          )}
          {revealed && selected !== currentQ.correct_idx && (
            <p className="tg-feedback tg-feedback-ko">
              {selected === -1 ? '⏰ Tempo scaduto!' : '❌ Sbagliato!'} La risposta era: <strong>{currentQ.opts[currentQ.correct_idx]}</strong>
            </p>
          )}
        </div>
      )}

      {/* ── RESULTS ── */}
      {phase === 'results' && (
        <div className="tg-results">
          <div className="tg-results-header">
            <span className="tg-results-trophy">🏆</span>
            <h3 className="tg-results-title">Risultati finali</h3>
          </div>

          {Object.keys(userScores).length === 0 ? (
            <div className="tg-loading">
              <div className="tg-spinner" />
              <p>Calcolo punteggi…</p>
            </div>
          ) : (
            <div className="tg-results-list">
              {Object.entries(userScores)
                .sort(([, a], [, b]) => b - a)
                .map(([uid, score], i) => {
                  const medals = ['🥇', '🥈', '🥉']
                  const isMe   = uid === currentUserId
                  return (
                    <div key={uid} className={`tg-result-row${isMe ? ' tg-result-me' : ''}`}>
                      <span className="tg-result-medal">{medals[i] ?? `#${i + 1}`}</span>
                      <span className="tg-result-name">
                        {getMemberName(uid)}
                        {isMe && <span className="tg-you">tu</span>}
                      </span>
                      <span className="tg-result-score">{score} pt</span>
                      {i === 0 && <span className="tg-result-badge">+15 🏆</span>}
                    </div>
                  )
                })}
            </div>
          )}

          <button className="tg-btn-secondary" onClick={handleReset}>
            Chiudi
          </button>
        </div>
      )}

      <style jsx>{`
        .tg-wrap  { display: flex; flex-direction: column; gap: 1rem; }

        /* ── Idle ── */
        .tg-idle  { background: var(--md-surface,#FAFAFA); border-radius: var(--md-radius-xl,24px); box-shadow: var(--md-elevation-1); padding: 1.5rem 1.25rem; display: flex; flex-direction: column; align-items: center; gap: 0.875rem; text-align: center; }
        .tg-idle-icon  { font-size: 3rem; }
        .tg-idle-title { font-size: 1.125rem; font-weight: 800; color: var(--md-on-surface,#18181B); margin: 0; }
        .tg-idle-desc  { font-size: 0.875rem; color: var(--md-on-surface-variant,#52525B); margin: 0; line-height: 1.5; }

        /* ── Loading ── */
        .tg-loading { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 2rem; text-align: center; color: var(--md-on-surface-variant,#52525B); font-size: 0.875rem; }
        .tg-spinner { width: 28px; height: 28px; border: 3px solid var(--md-surface-container,#EEECF8); border-top-color: var(--md-primary,#7C3AED); border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .tg-loading-hint { font-size: 0.75rem; color: var(--md-outline,#A1A1AA); margin: 0; }

        /* ── Lobby ── */
        .tg-lobby { background: var(--md-surface,#FAFAFA); border-radius: var(--md-radius-xl,24px); box-shadow: var(--md-elevation-1); padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
        .tg-lobby-header { display: flex; align-items: center; gap: 12px; background: var(--md-primary-container,#EDE9FE); border-radius: var(--md-radius-l,16px); padding: 0.875rem; }
        .tg-lobby-icon   { font-size: 1.75rem; }
        .tg-lobby-title  { font-size: 0.9375rem; font-weight: 700; color: var(--md-primary,#7C3AED); margin: 0 0 2px; }
        .tg-lobby-dest   { font-size: 0.8rem; color: var(--md-on-surface-variant,#52525B); margin: 0; }
        .tg-members-list { display: flex; flex-direction: column; gap: 6px; }
        .tg-member-row   { display: flex; align-items: center; gap: 10px; background: var(--md-surface-container-low,#F4F4F5); border-radius: var(--md-radius-m,12px); padding: 8px 12px; }
        .tg-member-avatar{ width: 32px; height: 32px; border-radius: 50%; background: var(--md-primary,#7C3AED); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; flex-shrink: 0; }
        .tg-member-name  { flex: 1; font-size: 0.875rem; font-weight: 600; color: var(--md-on-surface,#18181B); display: flex; align-items: center; gap: 6px; }
        .tg-member-ready { color: var(--md-tertiary,#0D9488); font-weight: 700; }
        .tg-you          { font-size: 0.6rem; background: var(--md-primary,#7C3AED); color: #fff; padding: 1px 6px; border-radius: 99px; font-weight: 700; }
        .tg-host         { font-size: 0.6rem; background: var(--md-secondary-container,#FEF3C7); color: var(--md-secondary,#D97706); padding: 1px 6px; border-radius: 99px; font-weight: 700; }
        .tg-waiting      { font-size: 0.825rem; color: var(--md-on-surface-variant,#52525B); text-align: center; margin: 0; font-style: italic; }
        .tg-join-wrap    { display: flex; flex-direction: column; gap: 8px; }

        /* ── Playing ── */
        .tg-game { display: flex; flex-direction: column; gap: 0.875rem; }
        .tg-progress { display: flex; align-items: center; gap: 8px; }
        .tg-q-counter { font-size: 0.75rem; font-weight: 700; color: var(--md-on-surface-variant,#52525B); white-space: nowrap; flex-shrink: 0; }
        .tg-timer-bar { flex: 1; height: 6px; background: var(--md-surface-container,#EEECF8); border-radius: 99px; overflow: hidden; }
        .tg-timer-fill { height: 100%; background: var(--md-primary,#7C3AED); border-radius: 99px; transition: width 1s linear; }
        .tg-timer-urgent { background: var(--md-error,#DC2626) !important; }
        .tg-timer-num { font-size: 0.8rem; font-weight: 800; color: var(--md-primary,#7C3AED); min-width: 24px; text-align: right; flex-shrink: 0; }
        .tg-timer-num-urgent { color: var(--md-error,#DC2626) !important; }

        .tg-question-card { background: var(--md-primary-container,#EDE9FE); border-radius: var(--md-radius-xl,24px); padding: 1.25rem; }
        .tg-question-text { font-size: 1rem; font-weight: 700; color: var(--md-on-surface,#18181B); margin: 0; line-height: 1.45; text-align: center; }

        .tg-options { display: flex; flex-direction: column; gap: 8px; }
        .tg-option  { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--md-radius-l,16px); border: 2px solid var(--md-outline-variant,#D4D4D8); background: var(--md-surface,#FAFAFA); cursor: pointer; font-family: inherit; text-align: left; transition: all 0.15s; }
        .tg-option:hover:not(:disabled) { border-color: var(--md-primary,#7C3AED); background: var(--md-primary-container,#EDE9FE); }
        .tg-option:disabled { cursor: default; }
        .tg-option-selected { border-color: var(--md-primary,#7C3AED); background: var(--md-primary-container,#EDE9FE); }
        .tg-option-correct  { border-color: var(--md-tertiary,#0D9488) !important; background: var(--md-tertiary-container,#CCFBF1) !important; }
        .tg-option-wrong    { border-color: var(--md-error,#DC2626) !important; background: var(--md-error-container,#FEE2E2) !important; }
        .tg-option-dim      { opacity: 0.45; }
        .tg-option-letter { width: 28px; height: 28px; border-radius: 50%; background: var(--md-surface-container,#EEECF8); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 800; flex-shrink: 0; }
        .tg-option-text  { flex: 1; font-size: 0.875rem; font-weight: 500; color: var(--md-on-surface,#18181B); }
        .tg-tick  { font-size: 1.1rem; color: var(--md-tertiary,#0D9488); flex-shrink: 0; }
        .tg-cross { font-size: 1.1rem; color: var(--md-error,#DC2626); flex-shrink: 0; }

        .tg-feedback    { font-size: 0.875rem; font-weight: 700; text-align: center; border-radius: var(--md-radius-m,12px); padding: 10px; margin: 0; }
        .tg-feedback-ok { background: var(--md-tertiary-container,#CCFBF1); color: var(--md-tertiary,#0D9488); }
        .tg-feedback-ko { background: var(--md-error-container,#FEE2E2); color: var(--md-error,#DC2626); }

        /* ── Results ── */
        .tg-results        { background: var(--md-surface,#FAFAFA); border-radius: var(--md-radius-xl,24px); box-shadow: var(--md-elevation-1); padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
        .tg-results-header { display: flex; align-items: center; gap: 10px; }
        .tg-results-trophy { font-size: 2rem; }
        .tg-results-title  { font-size: 1.125rem; font-weight: 800; color: var(--md-on-surface,#18181B); margin: 0; }
        .tg-results-list   { display: flex; flex-direction: column; gap: 8px; }
        .tg-result-row     { display: flex; align-items: center; gap: 10px; background: var(--md-surface-container-low,#F4F4F5); border-radius: var(--md-radius-l,16px); padding: 10px 14px; }
        .tg-result-me      { background: var(--md-primary-container,#EDE9FE); }
        .tg-result-medal   { font-size: 1.25rem; flex-shrink: 0; }
        .tg-result-name    { flex: 1; font-size: 0.9rem; font-weight: 600; color: var(--md-on-surface,#18181B); display: flex; align-items: center; gap: 6px; }
        .tg-result-score   { font-size: 1rem; font-weight: 800; color: var(--md-primary,#7C3AED); font-variant-numeric: tabular-nums; }
        .tg-result-badge   { font-size: 0.7rem; font-weight: 700; background: var(--md-secondary-container,#FEF3C7); color: var(--md-secondary,#D97706); padding: 2px 8px; border-radius: 99px; flex-shrink: 0; }

        /* ── Buttons ── */
        .tg-btn-primary   { width: 100%; padding: 0.875rem; background: var(--md-primary,#7C3AED); color: #fff; border: none; border-radius: var(--md-radius-full); font-size: 0.9375rem; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: var(--md-elevation-1); transition: box-shadow 0.15s, transform 0.1s; }
        .tg-btn-primary:hover  { box-shadow: var(--md-elevation-2); }
        .tg-btn-primary:active { transform: scale(0.98); }
        .tg-btn-secondary { width: 100%; padding: 0.75rem; background: var(--md-surface-container-low,#F4F4F5); color: var(--md-on-surface-variant,#52525B); border: 1.5px solid var(--md-outline-variant,#D4D4D8); border-radius: var(--md-radius-full); font-size: 0.875rem; font-weight: 600; cursor: pointer; font-family: inherit; }
        .tg-error { color: var(--md-error,#DC2626); background: var(--md-error-container,#FEE2E2); border-radius: var(--md-radius-m,12px); padding: 8px 12px; font-size: 0.825rem; text-align: center; margin: 0; }
      `}</style>
    </div>
  )
}
