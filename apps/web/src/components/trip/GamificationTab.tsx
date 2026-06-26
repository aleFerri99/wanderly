'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getLeaderboard,
  getDailyVoteSummary,
  castDailyVote,
  awardBathroom,
  claimMorningSprint,
  getTodaySprint,
  checkAndApplyTripEndBonuses,
  type LeaderboardEntry,
} from '@/app/trip/[id]/gamification/actions'
import { BATHROOM_DAILY_MAX, POINTS_GUIDE } from '@repo/shared/supabase/gamification'
import { BADGES, BADGES_BY_ID } from '@repo/shared/badges'
import { TriviaGame } from './TriviaGame'
import { loadTripAchievements } from '@/app/trip/[id]/gamification/actions'
import { BottomSheet } from '@/components/ui/BottomSheet'
import type { Profile } from '@repo/shared/types/database'

interface Props {
  tripId:        string
  currentUserId: string
  members:       Profile[]
  tripEndDate?:  string | null
  destination?:  string | null
}

const RANK_MEDAL = ['🥇', '🥈', '🥉']

// Gradienti rank-based per le Linear Progress Indicators M3
const RANK_GRADIENTS = [
  'linear-gradient(90deg, #F59E0B, #FCD34D)',  // 🥇 Gold
  'linear-gradient(90deg, #9CA3AF, #D1D5DB)',  // 🥈 Silver
  'linear-gradient(90deg, #B45309, #D97706)',  // 🥉 Bronze
]
function rankGradient(rank: number): string {
  return rank <= 3 ? RANK_GRADIENTS[rank - 1] : 'var(--md-primary, #7C3AED)'
}

// Inline styles per Avatar — evita :global() styled-jsx che rompeva lo scope in M.1
function Avatar({ profile, size = 40 }: {
  profile: Pick<Profile, 'username' | 'full_name' | 'avatar_url'>
  size?:   number
}) {
  const initials = (profile.full_name || profile.username || '?')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const base: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0 }
  return profile.avatar_url
    ? <img src={profile.avatar_url} alt={profile.username} style={{ ...base, objectFit: 'cover' }} />
    : <div style={{ ...base, background: 'var(--md-primary-container,#EDE9FE)', color: 'var(--md-primary,#7C3AED)', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials}</div>
}

export function GamificationTab({ tripId, currentUserId, members, tripEndDate, destination }: Props) {
  const supabase = createClient()
  const [leaderboard, setLeaderboard]   = useState<LeaderboardEntry[]>([])
  const [votedFor,    setVotedFor]      = useState<string | null>(null)
  const [voteCounts,  setVoteCounts]    = useState<{ user_id: string; count: number }[]>([])
  const [loading,     setLoading]       = useState(true)
  const [isPending,   startTransition]  = useTransition()
  const [voteError,   setVoteError]     = useState<string | null>(null)
  const [section,      setSection]       = useState<'classifica' | 'badge' | 'guida'>('classifica')
  const [mvpOpen,      setMvpOpen]       = useState(false)
  // Contatori bagno per oggi per ogni membro (user_id → count)
  const [bathroomToday, setBathroomToday] = useState<Record<string, number>>({})
  const [bathroomCD,    setBathroomCD]    = useState<Record<string, boolean>>({})
  const [shameUsers,    setShameUsers]    = useState<Set<string>>(new Set())
  // Badge per utente: userId → badgeId[]
  const [achievements,  setAchievements]  = useState<Record<string, string[]>>({})
  // Gara Speedy: winnerId = null se non ancora reclamata oggi
  const [sprintWinner,  setSprintWinner]  = useState<string | null | undefined>(undefined)
  const [sprintPending, setSprintPending] = useState(false)
  const [sprintError,   setSprintError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    // Lazy trigger fire-and-forget (non blocca il caricamento)
    if (tripEndDate) {
      checkAndApplyTripEndBonuses(tripId, tripEndDate).catch(() => {})
    }

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Tutto in parallelo: server actions + query client-side simultanee
    const [lb, vote, bathRaw, malusRaw, ach, sprint] = await Promise.all([
      getLeaderboard(tripId),
      getDailyVoteSummary(tripId),
      db.from('points_log').select('user_id')
        .eq('trip_id', tripId).eq('event_type', 'bathroom')
        .gte('created_at', todayStart.toISOString()),
      db.from('points_log').select('user_id')
        .eq('trip_id', tripId).eq('event_type', 'mvp_no_vote')
        .gte('created_at', twoDaysAgo.toISOString()),
      loadTripAchievements(tripId),
      getTodaySprint(tripId),
    ])

    setLeaderboard(lb)
    setVotedFor(vote.voted_for)
    setVoteCounts(vote.vote_counts)

    const counts: Record<string, number> = {}
    for (const log of ((bathRaw.data ?? []) as { user_id: string }[])) {
      counts[log.user_id] = (counts[log.user_id] ?? 0) + 1
    }
    setBathroomToday(counts)
    setShameUsers(new Set(((malusRaw.data ?? []) as { user_id: string }[]).map((l: { user_id: string }) => l.user_id)))
    setAchievements(ach)
    setSprintWinner(sprint.winnerId)

    setLoading(false)
  }, [tripId, tripEndDate, supabase])

  // Refresh leggero su INSERT points_log: aggiorna SOLO ciò che cambia
  // (classifica + contatori bagno + shame). Achievements/sprint/voti non
  // dipendono da points_log → non li rileggiamo.
  const refreshPoints = useCallback(async () => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [lb, bathRaw, malusRaw] = await Promise.all([
      getLeaderboard(tripId),
      db.from('points_log').select('user_id')
        .eq('trip_id', tripId).eq('event_type', 'bathroom')
        .gte('created_at', todayStart.toISOString()),
      db.from('points_log').select('user_id')
        .eq('trip_id', tripId).eq('event_type', 'mvp_no_vote')
        .gte('created_at', twoDaysAgo.toISOString()),
    ])
    setLeaderboard(lb)
    const counts: Record<string, number> = {}
    for (const log of ((bathRaw.data ?? []) as { user_id: string }[])) {
      counts[log.user_id] = (counts[log.user_id] ?? 0) + 1
    }
    setBathroomToday(counts)
    setShameUsers(new Set(((malusRaw.data ?? []) as { user_id: string }[]).map((l: { user_id: string }) => l.user_id)))
  }, [tripId, supabase])

  // Refresh solo del sondaggio su cambi daily_votes
  const refreshVotes = useCallback(async () => {
    const vote = await getDailyVoteSummary(tripId)
    setVotedFor(vote.voted_for)
    setVoteCounts(vote.vote_counts)
  }, [tripId])

  useEffect(() => {
    load()

    // Debounce: insert multipli collassano in un solo refresh.
    // points_log → refresh leggero (classifica/bagno/shame).
    // daily_votes → solo il sondaggio.
    let dPoints: ReturnType<typeof setTimeout> | null = null
    let dVotes:  ReturnType<typeof setTimeout> | null = null
    const onPoints = () => { if (dPoints) clearTimeout(dPoints); dPoints = setTimeout(() => { refreshPoints() }, 400) }
    const onVotes  = () => { if (dVotes)  clearTimeout(dVotes);  dVotes  = setTimeout(() => { refreshVotes() }, 400) }

    const ch = supabase
      .channel(`gamification:${tripId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'points_log',
        filter: `trip_id=eq.${tripId}` }, onPoints)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_votes',
        filter: `trip_id=eq.${tripId}` }, onVotes)
      .subscribe()

    return () => {
      if (dPoints) clearTimeout(dPoints)
      if (dVotes)  clearTimeout(dVotes)
      supabase.removeChannel(ch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  function handleVote(votedForId: string) {
    setVoteError(null)
    startTransition(async () => {
      const res = await castDailyVote(tripId, votedForId)
      if (res.error) { setVoteError(res.error); return }
      // Ottimista: segna subito come votato, poi ricarica
      setVotedFor(votedForId)
      await load()
    })
  }

  async function handleBathroom(targetUserId: string) {
    if (bathroomCD[targetUserId]) return
    if ((bathroomToday[targetUserId] ?? 0) >= BATHROOM_DAILY_MAX) return

    // Cooldown UI immediato (10s visivo)
    setBathroomCD(p => ({ ...p, [targetUserId]: true }))
    setTimeout(() => setBathroomCD(p => ({ ...p, [targetUserId]: false })), 10000)

    // Ottimismo: aggiorna il contatore localmente
    setBathroomToday(p => ({ ...p, [targetUserId]: (p[targetUserId] ?? 0) + 1 }))

    const res = await awardBathroom(tripId, targetUserId)
    if (res.error && !res.cooldown && !res.maxReached) {
      // Rollback se c'è un errore reale
      setBathroomToday(p => ({ ...p, [targetUserId]: Math.max(0, (p[targetUserId] ?? 1) - 1) }))
    }
    // Ricarica classifica dopo 500ms (Realtime si aggiorna già, ma forziamo per sicurezza)
    setTimeout(load, 500)
  }

  async function handleSprint() {
    if (sprintWinner !== null) return    // già reclamata oggi
    if (sprintPending) return
    setSprintError(null)
    setSprintPending(true)
    const res = await claimMorningSprint(tripId)
    setSprintPending(false)
    if (res.error) { setSprintError(res.error); return }
    setSprintWinner(res.winnerId ?? currentUserId)
  }

  const otherMembers = members.filter(m => m.id !== currentUserId)
  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="gf-wrap">
      {/* Sezione pills */}
      <div className="gf-pills">
        {(['classifica', 'badge', 'guida'] as const).map(s => (
          <button key={s} className={`gf-pill ${section === s ? 'gf-pill-active' : ''}`}
            onClick={() => setSection(s)}>
            {s === 'classifica' ? '🏆 Classifica' : s === 'badge' ? '🎖️ Vetrina' : '⭐ Punti'}
          </button>
        ))}
        <button className={`gf-pill gf-pill-trivia ${section === 'trivia' as string ? 'gf-pill-active' : ''}`}
          onClick={() => setSection('trivia' as typeof section)}>
          🧠 Trivia
        </button>
        {/* Il voto MVP apre un Bottom Sheet M3 */}
        <button className={`gf-pill${votedFor ? ' gf-pill-voted' : ''}`} onClick={() => setMvpOpen(true)}>
          🗳️ MVP {votedFor ? '✓' : 'del giorno'}
        </button>
      </div>

      {loading ? (
        <div className="gf-loading">
          <div className="gf-spinner" />
          <span>Caricamento…</span>
        </div>
      ) : (
        <>
          {/* ── SPEEDY BANNER (J.9) ─────────────────────────────── */}
          {section === 'classifica' && (
            <div className={`gf-sprint-banner${sprintWinner ? ' gf-sprint-won' : ''}`}>
              {sprintWinner ? (
                <>
                  <span className="gf-sprint-icon">⚡</span>
                  <span className="gf-sprint-text">
                    {sprintWinner === currentUserId
                      ? 'Sei il più veloce di stamattina! +20pt'
                      : `${members.find(m => m.id === sprintWinner)?.full_name ?? members.find(m => m.id === sprintWinner)?.username ?? 'Qualcuno'} si è preparato per primo oggi`}
                  </span>
                </>
              ) : (
                <>
                  <span className="gf-sprint-icon">⚡</span>
                  <span className="gf-sprint-text">Chi si prepara per primo stamattina?</span>
                  <button
                    className="gf-sprint-btn"
                    onClick={handleSprint}
                    disabled={sprintPending || sprintWinner !== null}
                  >
                    {sprintPending ? '…' : 'Sono pronto! +20'}
                  </button>
                </>
              )}
              {sprintError && <span className="gf-sprint-err">{sprintError}</span>}
            </div>
          )}

          {/* ── CLASSIFICA ─────────────────────────────────────── */}
          {section === 'classifica' && (
            <div className="gf-section">
              {leaderboard.length === 0 ? (
                <div className="gf-empty">
                  <div className="gf-empty-icon">🏆</div>
                  <p>Nessun punto ancora!</p>
                  <p className="gf-empty-hint">
                    Aggiungi attività, completa tappe e vota i tuoi compagni di viaggio per salire in classifica.
                  </p>
                </div>
              ) : (() => {
                const maxPts = leaderboard[0]?.total_points || 1
                return (
                  <div className="gf-lb-list">
                    {leaderboard.map((entry) => {
                      const isMe  = entry.user_id === currentUserId
                      const medal = entry.rank <= 3 ? RANK_MEDAL[entry.rank - 1] : `#${entry.rank}`
                      const pct      = Math.round((entry.total_points / maxPts) * 100)
                      // Controlla se questo utente ha ricevuto il malus di recente (ultimi 2 giorni)
                      // tramite i metadata della classifica (non serve query extra)
                      return (
                        <div key={entry.user_id} className={`gf-lb-card ${isMe ? 'gf-lb-me' : ''}`}>
                          {/* Top row: rank + avatar + name + points */}
                          <div className="gf-lb-top">
                            <span className="gf-lb-rank">{medal}</span>
                            <Avatar profile={entry.profile} size={42} />
                            <div className="gf-lb-info">
                              <span className="gf-lb-name">
                                {entry.profile.full_name || entry.profile.username}
                                {isMe && <span className="gf-badge-me">tu</span>}
                                {shameUsers.has(entry.user_id) && (
                                  <span className="gf-shame-badge" title="Non ha votato il sondaggio recentemente 😱">😱 -20</span>
                                )}
                              </span>
                              <span className="gf-lb-username">@{entry.profile.username}</span>
                            </div>
                            <div className="gf-lb-pts">
                              <span className="gf-pts-num">{entry.total_points}</span>
                              <span className="gf-pts-label">pt</span>
                            </div>
                            {/* 🚽 Pulsante Bagno */}
                            {(() => {
                              const count   = bathroomToday[entry.user_id] ?? 0
                              const maxed   = count >= BATHROOM_DAILY_MAX
                              const onCool  = bathroomCD[entry.user_id] ?? false
                              const disabled = maxed || onCool
                              return (
                                <button
                                  className={`gf-bath-btn${disabled ? ' gf-bath-disabled' : ''}`}
                                  onClick={() => handleBathroom(entry.user_id)}
                                  disabled={disabled}
                                  title={maxed ? `Massimo ${BATHROOM_DAILY_MAX} bagni/giorno` : onCool ? 'Cooldown...' : `+10 pt (${count}/${BATHROOM_DAILY_MAX})`}
                                >
                                  🚽
                                  {count > 0 && <span className="gf-bath-count">{count}</span>}
                                </button>
                              )
                            })()}
                          </div>
                          {/* Badge chips sotto il nome */}
                          {(achievements[entry.user_id] ?? []).length > 0 && (
                            <div className="gf-badge-row">
                              {(achievements[entry.user_id] ?? []).map(badgeId => {
                                const b = BADGES_BY_ID.get(badgeId)
                                if (!b) return null
                                return (
                                  <span
                                    key={badgeId}
                                    className="gf-badge-chip"
                                    style={{ background: b.bgColor, color: b.color }}
                                    title={`${b.name}: ${b.description}`}
                                  >
                                    {b.icon}
                                  </span>
                                )
                              })}
                            </div>
                          )}

                          {/* M3 Linear Progress Indicator */}
                          <div className="gf-progress-track">
                            <div
                              className="gf-progress-fill"
                              style={{ width: `${pct}%`, background: rankGradient(entry.rank) }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          {/* MVP gestito via BottomSheet */}
          {(false as boolean) && (
            <div className="gf-section">
              <div className="gf-mvp-header">
                <p className="gf-mvp-date">📅 {today}</p>
                <p className="gf-mvp-desc">
                  Vota il compagno di viaggio più prezioso di oggi.
                  Il vincitore guadagna <strong>+{30} punti</strong>!
                </p>
              </div>

              {voteError && <div className="gf-error">{voteError}</div>}

              {votedFor ? (
                <div className="gf-voted-box">
                  {(() => {
                    const voted = members.find(m => m.id === votedFor)
                    return voted ? (
                      <>
                        <Avatar profile={voted} size={52} />
                        <div>
                          <p className="gf-voted-label">Hai votato</p>
                          <p className="gf-voted-name">{voted.full_name || voted.username}</p>
                        </div>
                        <span className="gf-voted-check">✓</span>
                      </>
                    ) : null
                  })()}
                </div>
              ) : null}

              <div className="gf-vote-list">
                {otherMembers.length === 0 ? (
                  <p className="gf-empty-hint">Sei l'unico membro del viaggio — invita qualcuno!</p>
                ) : (
                  otherMembers.map(m => {
                    const vCount = voteCounts.find(v => v.user_id === m.id)?.count ?? 0
                    const isVotedByMe = votedFor === m.id
                    return (
                      <div key={m.id} className={`gf-vote-row ${isVotedByMe ? 'gf-vote-row-selected' : ''}`}>
                        <Avatar profile={m} size={40} />
                        <div className="gf-vote-info">
                          <span className="gf-vote-name">{m.full_name || m.username}</span>
                          <span className="gf-vote-count">
                            {vCount > 0 ? `${vCount} ${vCount === 1 ? 'voto' : 'voti'} oggi` : 'Nessun voto ancora'}
                          </span>
                        </div>
                        <button
                          className={`gf-vote-btn ${isVotedByMe ? 'gf-vote-btn-active' : ''}`}
                          onClick={() => handleVote(m.id)}
                          disabled={isPending}
                        >
                          {isVotedByMe ? '✓ Votato' : '🗳️ Vota'}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>

              {votedFor && (
                <p className="gf-change-hint">
                  Puoi cambiare voto fino a mezzanotte — seleziona un altro membro.
                </p>
              )}
            </div>
          )}

          {/* ── VETRINA BADGE ──────────────────────────────────── */}
          {section === 'badge' && (
            <div className="gf-section">
              <p className="gf-guide-intro">
                Badge sbloccabili durante il viaggio. Quelli grigi devono ancora essere conquistati.
              </p>
              <div className="gf-vetrina-grid">
                {BADGES.map(b => {
                  // Controlla se almeno un membro del gruppo ha sbloccato il badge
                  const earnedBy = Object.entries(achievements)
                    .filter(([, bids]) => bids.includes(b.id))
                    .map(([uid]) => uid)
                  const isUnlocked = earnedBy.length > 0

                  return (
                    <div
                      key={b.id}
                      className={`gf-vetrina-card${isUnlocked ? ' gf-vetrina-unlocked' : ' gf-vetrina-locked'}`}
                      style={isUnlocked ? { borderColor: b.color, background: b.bgColor } : undefined}
                    >
                      <span className="gf-vetrina-icon" style={isUnlocked ? {} : { filter: 'grayscale(1) opacity(0.35)' }}>
                        {isUnlocked ? b.icon : '🔒'}
                      </span>
                      <div className="gf-vetrina-info">
                        <span className="gf-vetrina-name" style={isUnlocked ? { color: b.color } : undefined}>
                          {b.name}
                        </span>
                        <span className="gf-vetrina-desc">
                          {isUnlocked ? b.description : 'Sblocca completando la sfida…'}
                        </span>
                        {isUnlocked && earnedBy.length > 0 && (
                          <div className="gf-vetrina-earners">
                            {earnedBy.map(uid => {
                              const m = members.find(p => p.id === uid)
                              return m ? (
                                <span key={uid} className="gf-earner-chip">
                                  {m.full_name?.split(' ')[0] || m.username}
                                </span>
                              ) : null
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── TRIVIA DEL LUOGO ──────────────────────────────── */}
          {(section as string) === 'trivia' && (
            <TriviaGame
              tripId={tripId}
              currentUserId={currentUserId}
              members={members}
              destination={destination ?? null}
            />
          )}

          {/* ── GUIDA PUNTI ────────────────────────────────────── */}
          {section === 'guida' && (
            <div className="gf-section">
              <p className="gf-guide-intro">
                Guadagna punti partecipando attivamente alla pianificazione del viaggio!
              </p>
              <div className="gf-guide-list">
                {POINTS_GUIDE.map((g, i) => (
                  <div key={i} className="gf-guide-row">
                    <span className="gf-guide-icon">{g.icon}</span>
                    <span className="gf-guide-label">{g.label}</span>
                    <span className={`gf-guide-pts${g.points < 0 ? ' gf-guide-pts-neg' : ''}`}>
                      {g.points > 0 ? '+' : ''}{g.points} pt
                    </span>
                  </div>
                ))}
              </div>
              <div className="gf-guide-note">
                💡 I punti vengono assegnati automaticamente — non devi fare nulla di speciale!
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Bottom Sheet MVP del giorno ── */}
      <BottomSheet isOpen={mvpOpen} onClose={() => setMvpOpen(false)} title="🗳️ MVP del giorno">
        <div className="gf-bs-content">
          <div className="gf-mvp-header">
            <p className="gf-mvp-date">📅 {today}</p>
            <p className="gf-mvp-desc">
              Vota il compagno più prezioso di oggi. Il vincitore guadagna <strong>+50 punti</strong>!
            </p>
          </div>

          {voteError && <div className="gf-error">{voteError}</div>}

          {votedFor && (
            <div className="gf-voted-box">
              {(() => {
                const voted = members.find(m => m.id === votedFor)
                if (!voted) return null
                return (
                <>
                  <span style={{ fontSize: '2rem' }}>
                    {voted.avatar_url
                      ? <img src={voted.avatar_url} alt={voted.username} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                      : (voted.full_name?.[0] ?? voted.username?.[0] ?? '?').toUpperCase()}
                  </span>
                  <div>
                    <p className="gf-voted-label">Hai votato</p>
                    <p className="gf-voted-name">{voted.full_name || voted.username}</p>
                  </div>
                  <span className="gf-voted-check">✓</span>
                </>
              )
              })()}
            </div>
          )}

          <div className="gf-vote-list" style={{ paddingBottom: '1rem' }}>
            {otherMembers.length === 0 ? (
              <p className="gf-empty-hint">Sei l&apos;unico membro del viaggio.</p>
            ) : otherMembers.map(m => {
              const vCount = voteCounts.find(v => v.user_id === m.id)?.count ?? 0
              const isVotedByMe = votedFor === m.id
              return (
                <div key={m.id} className={`gf-vote-row${isVotedByMe ? ' gf-vote-row-selected' : ''}`}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--md-primary,#7C3AED)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                    {m.avatar_url ? <img src={m.avatar_url} alt={m.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (m.full_name?.[0] ?? m.username?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="gf-vote-info">
                    <span className="gf-vote-name">{m.full_name || m.username}</span>
                    <span className="gf-vote-count">{vCount > 0 ? `${vCount} ${vCount === 1 ? 'voto' : 'voti'}` : 'Nessun voto'}</span>
                  </div>
                  <button className={`gf-vote-btn${isVotedByMe ? ' gf-vote-btn-active' : ''}`}
                    onClick={() => { handleVote(m.id); if (!isVotedByMe) setMvpOpen(false) }}
                    disabled={isPending}>
                    {isVotedByMe ? '✓ Votato' : '🗳️ Vota'}
                  </button>
                </div>
              )
            })}
          </div>

          {votedFor && (
            <p className="gf-change-hint" style={{ paddingBottom: '0.5rem' }}>
              Puoi cambiare voto fino a mezzanotte.
            </p>
          )}
        </div>
      </BottomSheet>

      <style jsx>{`
        .gf-bs-content { display: flex; flex-direction: column; gap: 0.875rem; }
        .gf-wrap    { display: flex; flex-direction: column; gap: 1rem; }

        /* ── Pills — M3 Segmented style ── */
        .gf-pills { display: flex; background: var(--md-surface-container-low, #F4F4F5); border-radius: var(--md-radius-full); padding: 4px; gap: 4px; }
        .gf-pill  { flex: 1; padding: 10px 12px; background: none; border: none; border-radius: var(--md-radius-full); font-size: 0.875rem; font-weight: 600; color: var(--md-on-surface-variant, #52525B); cursor: pointer; font-family: inherit; transition: all 0.2s; }
        .gf-pill:hover:not(.gf-pill-active) { background: var(--md-primary-container, #EDE9FE); color: var(--md-primary, #7C3AED); }
        .gf-pill-active { background: var(--md-primary, #7C3AED); color: #fff; }
        .gf-pill-voted   { background: var(--md-tertiary-container, #CCFBF1); color: var(--md-tertiary, #0D9488); }
        .gf-pill-trivia  { background: var(--md-tertiary-container, #CCFBF1); color: var(--md-tertiary, #0D9488); }

        /* ── Loading ── */
        .gf-loading { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 3rem; color: var(--md-on-surface-variant, #52525B); font-size: 0.875rem; }
        .gf-spinner { width: 24px; height: 24px; border: 3px solid var(--md-surface-container, #EEECF8); border-top-color: var(--md-primary, #7C3AED); border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .gf-section { display: flex; flex-direction: column; gap: 0.75rem; }

        /* ── Empty state ── */
        .gf-empty { background: var(--md-surface, #FAFAFA); border-radius: var(--md-radius-xl, 24px); border: 2px dashed var(--md-outline-variant, #D4D4D8); padding: 2.5rem 1.25rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .gf-empty-icon { font-size: 2.75rem; }
        .gf-empty p    { font-size: 0.9rem; color: var(--md-on-surface, #18181B); margin: 0; font-weight: 600; }
        .gf-empty-hint { font-size: 0.8rem !important; color: var(--md-on-surface-variant, #52525B) !important; font-weight: 400 !important; line-height: 1.5; }

        /* ── Leaderboard M3 ── */
        .gf-lb-list { display: flex; flex-direction: column; gap: 10px; }

        .gf-lb-card {
          background: var(--md-surface, #FAFAFA);
          border-radius: var(--md-radius-xl, 24px);
          box-shadow: var(--md-elevation-1);
          padding: 1rem;
          display: flex; flex-direction: column; gap: 10px;
          transition: box-shadow 0.2s;
        }
        .gf-lb-card:hover { box-shadow: var(--md-elevation-2); }
        .gf-lb-me { box-shadow: 0 0 0 2px var(--md-primary, #7C3AED), var(--md-elevation-1) !important; }

        .gf-lb-top  { display: flex; align-items: center; gap: 12px; }
        .gf-lb-rank { font-size: 1.375rem; min-width: 32px; text-align: center; flex-shrink: 0; }
        .gf-lb-info { flex: 1; min-width: 0; }
        .gf-lb-name { font-size: 0.9375rem; font-weight: 700; color: var(--md-on-surface, #18181B); display: flex; align-items: center; gap: 6px; }
        .gf-lb-username { font-size: 0.75rem; color: var(--md-on-surface-variant, #52525B); }
        .gf-badge-me    { background: var(--md-primary, #7C3AED); color: #fff; font-size: 0.6rem; padding: 1px 6px; border-radius: var(--md-radius-full); font-weight: 700; }
        .gf-shame-badge { background: var(--md-error-container,#FEE2E2); color: var(--md-error,#DC2626); font-size: 0.6rem; font-weight: 800; padding: 1px 7px; border-radius: var(--md-radius-full); flex-shrink: 0; }

        /* Badge chips nella riga leaderboard */
        .gf-badge-row  { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 0 4px; }
        .gf-badge-chip { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; font-size: 0.875rem; cursor: default; border: 1.5px solid currentColor; transition: transform 0.15s; }
        .gf-badge-chip:hover { transform: scale(1.25); z-index: 10; }

        /* Vetrina badge */
        .gf-vetrina-grid { display: flex; flex-direction: column; gap: 8px; }
        .gf-vetrina-card { display: flex; align-items: flex-start; gap: 12px; border-radius: var(--md-radius-l,16px); border: 1.5px solid var(--md-outline-variant,#D4D4D8); padding: 12px; transition: border-color 0.2s, background 0.2s; }
        .gf-vetrina-unlocked { box-shadow: var(--md-elevation-1); }
        .gf-vetrina-locked   { opacity: 0.65; }
        .gf-vetrina-icon { font-size: 1.75rem; flex-shrink: 0; line-height: 1; }
        .gf-vetrina-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .gf-vetrina-name { font-size: 0.875rem; font-weight: 700; color: var(--md-on-surface,#18181B); }
        .gf-vetrina-desc { font-size: 0.775rem; color: var(--md-on-surface-variant,#52525B); line-height: 1.4; }
        .gf-vetrina-earners { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
        .gf-earner-chip { font-size: 0.65rem; font-weight: 700; padding: 2px 8px; border-radius: var(--md-radius-full); background: rgba(0,0,0,0.08); color: inherit; }
        .gf-lb-pts  { display: flex; align-items: baseline; gap: 3px; flex-shrink: 0; }
        .gf-pts-num { font-size: 1.375rem; font-weight: 800; color: var(--md-on-surface, #18181B); font-variant-numeric: tabular-nums; }
        .gf-pts-label { font-size: 0.7rem; color: var(--md-on-surface-variant, #52525B); }

        /* Pulsante Bagno */
        .gf-bath-btn {
          position: relative;
          background: var(--md-surface-container-low, #F4F4F5);
          border: 1.5px solid var(--md-outline-variant, #D4D4D8);
          border-radius: var(--md-radius-full);
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1rem; cursor: pointer; flex-shrink: 0;
          transition: background 0.15s, transform 0.1s;
        }
        .gf-bath-btn:hover:not(.gf-bath-disabled) {
          background: var(--md-secondary-container, #FEF3C7);
          border-color: var(--md-secondary, #D97706);
          transform: scale(1.1);
        }
        .gf-bath-btn:active:not(.gf-bath-disabled) { transform: scale(0.95); }
        .gf-bath-disabled { opacity: 0.38; cursor: not-allowed; }
        .gf-bath-count {
          position: absolute; top: -5px; right: -5px;
          background: var(--md-secondary, #D97706); color: #fff;
          font-size: 0.55rem; font-weight: 800;
          min-width: 14px; height: 14px; padding: 0 2px;
          border-radius: var(--md-radius-full);
          display: flex; align-items: center; justify-content: center;
        }

        /* ── Speedy Banner (J.9) ── */
        .gf-sprint-banner {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          background: var(--md-surface-container-low, #F4F4F5);
          border: 1.5px solid var(--md-outline-variant, #D4D4D8);
          border-radius: var(--md-radius-l, 16px); padding: 10px 14px;
        }
        .gf-sprint-won { background: var(--md-secondary-container, #FEF3C7); border-color: var(--md-secondary, #D97706); }
        .gf-sprint-icon { font-size: 1.25rem; flex-shrink: 0; }
        .gf-sprint-text { font-size: 0.8375rem; font-weight: 600; color: var(--md-on-surface, #18181B); flex: 1; }
        .gf-sprint-btn {
          background: var(--md-secondary, #D97706); color: #fff;
          border: none; border-radius: var(--md-radius-full);
          padding: 6px 16px; font-size: 0.8125rem; font-weight: 700;
          cursor: pointer; font-family: inherit; flex-shrink: 0;
          box-shadow: var(--md-elevation-1); transition: opacity 0.15s;
        }
        .gf-sprint-btn:hover:not(:disabled) { opacity: 0.88; }
        .gf-sprint-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .gf-sprint-err { font-size: 0.75rem; color: var(--md-error, #DC2626); width: 100%; }

        /* M3 Linear Progress Indicator */
        .gf-progress-track { height: 8px; background: var(--md-surface-container, #EEECF8); border-radius: var(--md-radius-full); overflow: hidden; }
        .gf-progress-fill  { height: 100%; border-radius: var(--md-radius-full); transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1); }

        /* ── MVP del giorno ── */
        .gf-mvp-header { background: var(--md-secondary-container, #FEF3C7); border-radius: var(--md-radius-l, 16px); padding: 1rem; display: flex; flex-direction: column; gap: 4px; }
        .gf-mvp-date   { font-size: 0.75rem; color: var(--md-secondary, #D97706); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
        .gf-mvp-desc   { font-size: 0.875rem; color: var(--md-on-surface, #18181B); margin: 0; line-height: 1.4; }

        .gf-voted-box { display: flex; align-items: center; gap: 12px; background: var(--md-tertiary-container, #CCFBF1); border-radius: var(--md-radius-l, 16px); padding: 1rem; }
        .gf-voted-label { font-size: 0.7rem; color: var(--md-tertiary, #0D9488); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
        .gf-voted-name  { font-size: 1rem; font-weight: 700; color: var(--md-on-surface, #18181B); margin: 0; }
        .gf-voted-check { margin-left: auto; font-size: 1.75rem; }

        .gf-vote-list { display: flex; flex-direction: column; gap: 8px; }
        .gf-vote-row  { display: flex; align-items: center; gap: 12px; background: var(--md-surface, #FAFAFA); border-radius: var(--md-radius-l, 16px); box-shadow: var(--md-elevation-1); padding: 0.75rem 1rem; }
        .gf-vote-row-selected { box-shadow: 0 0 0 2px var(--md-tertiary, #0D9488), var(--md-elevation-1) !important; }
        .gf-vote-info { flex: 1; min-width: 0; }
        .gf-vote-name  { font-size: 0.875rem; font-weight: 600; color: var(--md-on-surface, #18181B); display: block; }
        .gf-vote-count { font-size: 0.75rem; color: var(--md-on-surface-variant, #52525B); }
        .gf-vote-btn  { padding: 7px 16px; background: var(--md-surface-container-low, #F4F4F5); border: 1.5px solid var(--md-outline-variant, #D4D4D8); border-radius: var(--md-radius-full); font-size: 0.8rem; font-weight: 700; color: var(--md-on-surface-variant, #52525B); cursor: pointer; font-family: inherit; flex-shrink: 0; transition: all 0.15s; }
        .gf-vote-btn:hover:not(:disabled) { border-color: var(--md-tertiary, #0D9488); color: var(--md-tertiary, #0D9488); background: var(--md-tertiary-container, #CCFBF1); }
        .gf-vote-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .gf-vote-btn-active { background: var(--md-tertiary, #0D9488) !important; color: #fff !important; border-color: var(--md-tertiary, #0D9488) !important; }

        .gf-change-hint { font-size: 0.75rem; color: var(--md-on-surface-variant, #52525B); text-align: center; margin: 0; }
        .gf-error { background: var(--md-error-container, #FEE2E2); color: var(--md-error, #DC2626); border-radius: var(--md-radius-m, 12px); padding: 0.75rem 1rem; font-size: 0.825rem; }

        /* ── Guida punti ── */
        .gf-guide-intro { font-size: 0.875rem; color: var(--md-on-surface-variant, #52525B); margin: 0; line-height: 1.5; }
        .gf-guide-list  { display: flex; flex-direction: column; gap: 8px; }
        .gf-guide-row   { display: flex; align-items: center; gap: 12px; background: var(--md-surface, #FAFAFA); border-radius: var(--md-radius-l, 16px); box-shadow: var(--md-elevation-1); padding: 0.875rem 1rem; }
        .gf-guide-icon  { font-size: 1.375rem; min-width: 32px; text-align: center; }
        .gf-guide-label { flex: 1; font-size: 0.875rem; font-weight: 500; color: var(--md-on-surface, #18181B); }
        .gf-guide-pts     { font-size: 0.9rem; font-weight: 800; color: var(--md-secondary, #D97706); flex-shrink: 0; background: var(--md-secondary-container, #FEF3C7); padding: 3px 10px; border-radius: var(--md-radius-full); }
        .gf-guide-pts-neg { color: var(--md-error, #DC2626) !important; background: var(--md-error-container, #FEE2E2) !important; }
        .gf-guide-note  { background: var(--md-secondary-container, #FEF3C7); border-radius: var(--md-radius-l, 16px); padding: 0.875rem 1rem; font-size: 0.8rem; color: var(--md-on-secondary-container, #451A00); line-height: 1.4; }
      `}</style>
    </div>
  )
}
