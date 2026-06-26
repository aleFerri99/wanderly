// ============================================================
// src/components/trip/ActivityCard.tsx  — Modulo C+D
// Toggle animato, stato visivo ricco, poll integrato
// ============================================================
'use client'

import { useState, useTransition, useOptimistic, useCallback } from 'react'
import { toggleActivity, deleteActivity, updateActivity } from '@/app/trip/[id]/timeline/actions'
import { ReviewSection } from './ReviewSection'
import { TimeInput } from '@/components/ui/TimeInput'
import type { Activity, Profile } from '@repo/shared/types/database'

interface Props {
  activity: Activity
  tripId: string
  isLast: boolean
  currentUserId: string
  members: Profile[]
  onToggled?:  (newStatus: 'todo' | 'done') => void
  dayId:       string
  cardIndex?:  number   // per l'animazione stagger all'ingresso
  dayTitle?:   string   // usato come contesto nel link Maps (fallback testo)
}

// Costruisce il deep link Google Maps: coordinate se disponibili, altrimenti testo
function buildMapsUrl(activity: Activity, dayTitle?: string): string | null {
  if (activity.lat && activity.lng) {
    return `https://www.google.com/maps/search/?api=1&query=${activity.lat},${activity.lng}`
  }
  if (activity.location) {
    const query = dayTitle
      ? `${activity.location}, ${dayTitle}`
      : activity.location
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  }
  return null
}

export function ActivityCard({ activity, tripId, isLast, currentUserId, members, onToggled, dayId, cardIndex = 0, dayTitle }: Props) {
  const [deleted, setDeleted] = useState(false)
  const [editing, setEditing] = useState(false)
  const [avgScore, setAvgScore] = useState<number | null>(null)
  const handleAvg = useCallback((avg: number | null) => setAvgScore(avg), [])
  const [title, setTitle] = useState(activity.title)
  const [notes, setNotes] = useState(activity.notes ?? '')
  const [location, setLocation] = useState(activity.location ?? '')
  const [timeStart, setTimeStart] = useState(activity.time_start ?? '')
  const [duration, setDuration] = useState(activity.duration_minutes?.toString() ?? '')
  const [isPending, startTransition] = useTransition()

  // Stato ottimistico: aggiorna subito l'UI senza aspettare il server
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    activity.status,
    (_: string, next: string) => next
  )

  const isDone = optimisticStatus === 'done'
  const mapsUrl = buildMapsUrl(activity, dayTitle)

  function handleToggle() {
    const next = isDone ? 'todo' : 'done'
    // Vibrazione breve (40ms) quando si completa un'attività su mobile
    if (next === 'done' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(40)
    }
    startTransition(async () => {
      setOptimisticStatus(next)
      await toggleActivity(tripId, activity.id, activity.status)
      onToggled?.(next as 'todo' | 'done')
    })
  }

  function handleSave() {
    startTransition(async () => {
      await updateActivity(tripId, activity.id, {
        title,
        notes: notes || null,
        location: location || null,
        time_start: timeStart || null,
        duration_minutes: duration ? parseInt(duration, 10) : null,
      })
      setEditing(false)
    })
  }

  function handleDelete() {
    if (!confirm(`Eliminare "${activity.title}"?`)) return
    startTransition(async () => {
      setDeleted(true)
      const result = await deleteActivity(tripId, activity.id)
      if (result?.error) setDeleted(false)
    })
  }

  if (deleted) return null

  return (
    <div
      className={`act-card ${isDone ? 'act-done' : ''} ${isLast ? 'act-last' : ''}`}
      style={{ animationDelay: `${cardIndex * 55}ms` }}
      draggable={!editing}
      onDragStart={(e) => {
        // Salva activityId e dayId nel dataTransfer — unico modo sicuro in React
        // senza causare re-render che interromperebbero la drag operation
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/activityid', activity.id)
        e.dataTransfer.setData('text/dayid', dayId)
        // Feedback visivo dopo che il browser ha catturato l'immagine del drag
        const el = e.currentTarget
        setTimeout(() => { el.style.opacity = '0.35' }, 0)
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = ''
      }}
    >
      {/* Linea temporale */}
      <div className="act-timeline">
        <button
          className={`act-dot ${isDone ? 'act-dot-done' : 'act-dot-todo'}`}
          onClick={handleToggle}
          disabled={isPending}
          aria-label={isDone ? 'Segna come da fare' : 'Segna come fatto'}
        >
          <span className={`act-check-icon ${isDone ? 'act-check-visible' : ''}`}>✓</span>
        </button>
        {!isLast && <div className={`act-line ${isDone ? 'act-line-done' : ''}`} />}
      </div>

      {/* Contenuto */}
      <div className="act-body">
        {editing ? (
          <div className="act-edit-form">
            <input
              className="act-edit-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Titolo attività"
              autoFocus
            />
            <div className="act-edit-row">
              <TimeInput value={timeStart} onChange={setTimeStart} />
              <span className="act-edit-hint">Orario</span>
              <input
                className="act-edit-dur"
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="60"
              />
              <span className="act-edit-hint">min</span>
            </div>
            <input
              className="act-edit-location"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="📍 Nome in inglese/locale (es. War Remnants Museum)"
            />
            <textarea
              className="act-edit-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Note, indirizzo, link…"
              rows={2}
            />
            <div className="act-edit-actions">
              <button className="act-btn-cancel" onClick={() => { setEditing(false); setTitle(activity.title); setNotes(activity.notes ?? ''); setLocation(activity.location ?? ''); setTimeStart(activity.time_start ?? ''); setDuration(activity.duration_minutes?.toString() ?? '') }}>
                Annulla
              </button>
              <button className="act-btn-save" onClick={handleSave} disabled={isPending || !title.trim()}>
                {isPending ? '…' : 'Salva'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="act-header">
              {activity.time_start && (
                <span className={`act-time ${isDone ? 'act-time-done' : ''}`}>
                  {activity.time_start.slice(0, 5)}
                </span>
              )}
              <span className={`act-title ${isDone ? 'act-title-done' : ''}`}>
                {activity.title}
              </span>
              {avgScore !== null && !isDone && (
                <span className="act-avg-badge">★ {avgScore.toFixed(1)}</span>
              )}
              <div className="act-actions">
                <button className="act-icon-btn" onClick={() => setEditing(true)} aria-label="Modifica">✏️</button>
                <button className="act-icon-btn act-icon-delete" onClick={handleDelete} aria-label="Elimina">🗑</button>
              </div>
            </div>
            {(activity.location || mapsUrl) && (
              <div className={`act-location-row ${isDone ? 'act-location-done' : ''}`}>
                {activity.location && (
                  <span className="act-location-text">📍 {activity.location}</span>
                )}
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="act-maps-link"
                    onClick={e => e.stopPropagation()}
                  >
                    Maps →
                  </a>
                )}
              </div>
            )}
            {activity.notes && (
              <p className={`act-notes ${isDone ? 'act-notes-done' : ''}`}>{activity.notes}</p>
            )}
            {activity.created_by && (() => {
              const proposer = members.find(m => m.id === activity.created_by)
              if (!proposer) return null
              const isMe = activity.created_by === currentUserId
              const name = isMe ? 'tu' : (proposer.full_name ?? `@${proposer.username}`)
              return (
                <p className={`act-proposer ${isDone ? 'act-proposer-done' : ''}`}>
                  👤 {name}
                </p>
              )
            })()}
            <ReviewSection
              tripId={tripId}
              activityId={activity.id}
              currentUserId={currentUserId}
              members={members}
              onAverageComputed={handleAvg}
            />
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes actCardEnter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .act-card {
          display: flex;
          gap: 0;
          cursor: grab;
          padding-bottom: 4px;
          transition: opacity 0.2s;
          animation: actCardEnter 0.28s ease-out both;
        }
        .act-card:active { cursor: grabbing; }
        .act-timeline {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 32px;
          flex-shrink: 0;
          padding-top: 2px;
        }
        .act-dot {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 2px solid #d0d0cb;
          background: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          flex-shrink: 0;
          padding: 0;
        }
        .act-dot-done {
          background: #1D9E75;
          border-color: #1D9E75;
          transform: scale(1.05);
        }
        .act-dot-todo:hover {
          border-color: #1D9E75;
          background: #E1F5EE;
          transform: scale(1.1);
        }
        .act-dot:active { transform: scale(0.92); }
        .act-check-icon {
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          line-height: 1;
          opacity: 0;
          transform: scale(0.5);
          transition: all 0.15s ease;
        }
        .act-check-visible {
          opacity: 1;
          transform: scale(1);
        }
        .act-line {
          width: 2px;
          flex: 1;
          min-height: 16px;
          background: #f0f0ec;
          margin: 4px 0;
          transition: background 0.3s;
        }
        .act-line-done { background: #9FE1CB; }
        .act-body {
          flex: 1;
          min-width: 0;
          padding: 0 0 12px 10px;
        }
        .act-last .act-body { padding-bottom: 4px; }
        .act-header {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          min-height: 26px;
        }
        .act-time {
          font-size: 0.725rem;
          font-weight: 700;
          color: #1D9E75;
          background: #E1F5EE;
          padding: 2px 7px;
          border-radius: 5px;
          flex-shrink: 0;
          margin-top: 2px;
          font-variant-numeric: tabular-nums;
          transition: all 0.2s;
          letter-spacing: 0.02em;
        }
        .act-time-done {
          background: #f0f0ec;
          color: #9a9a94;
        }
        .act-title {
          font-size: 0.9rem;
          font-weight: 500;
          color: #1a1a1a;
          flex: 1;
          line-height: 1.45;
          transition: all 0.2s;
        }
        .act-title-done {
          text-decoration: line-through;
          color: #b0b0aa;
        }
        .act-avg-badge {
          font-size: 0.7rem;
          font-weight: 700;
          color: #1D9E75;
          background: #E1F5EE;
          padding: 2px 6px;
          border-radius: 99px;
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }
        .act-location-row {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin: 3px 0 0;
          flex-wrap: wrap;
        }
        .act-location-text {
          font-size: 0.75rem;
          color: #1D9E75;
          line-height: 1.4;
          transition: color 0.2s;
        }
        .act-maps-link {
          font-size: 0.7rem;
          font-weight: 600;
          color: #1D9E75;
          text-decoration: none;
          background: #E1F5EE;
          padding: 1px 7px;
          border-radius: 5px;
          flex-shrink: 0;
          transition: background 0.15s;
          cursor: pointer;
        }
        .act-maps-link:hover { background: #9FE1CB; }
        .act-location-done .act-location-text { color: #b0b0aa; }
        .act-location-done .act-maps-link { background: #f0f0ec; color: #b0b0aa; }
        .act-notes {
          font-size: 0.775rem;
          color: #6b6b6b;
          margin: 3px 0 0;
          line-height: 1.4;
          transition: color 0.2s;
        }
        .act-notes-done { color: #b0b0aa; }
        .act-proposer {
          font-size: 0.7rem;
          color: #9a9a94;
          margin: 3px 0 0;
          line-height: 1.4;
        }
        .act-proposer-done { color: #c8c8c4; }
        .act-actions {
          display: flex;
          gap: 2px;
          opacity: 0;
          transition: opacity 0.15s;
          flex-shrink: 0;
        }
        .act-card:hover .act-actions { opacity: 1; }
        .act-icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.875rem;
          padding: 2px 4px;
          border-radius: 4px;
          transition: background 0.1s;
        }
        .act-icon-btn:hover { background: #f0f0ec; }
        .act-icon-delete:hover { background: #fef2f2; }
        .act-edit-form { display: flex; flex-direction: column; gap: 8px; }
        .act-edit-title { width: 100%; padding: 6px 8px; border: 1px solid #1D9E75; border-radius: 8px; font-size: 0.9rem; font-weight: 500; color: #1a1a1a; background: #fff; box-sizing: border-box; }
        .act-edit-title:focus { outline: none; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); }
        .act-edit-row { display: flex; align-items: center; gap: 8px; }
        .act-edit-time { padding: 5px 8px; border: 1px solid #e0e0db; border-radius: 8px; font-size: 0.875rem; color: #1a1a1a; background: #fafaf8; width: 100px; }
        .act-edit-time:focus { outline: none; border-color: #1D9E75; }
        .act-edit-dur { padding: 5px 6px; border: 1px solid #e0e0db; border-radius: 8px; font-size: 0.875rem; color: #1a1a1a; background: #fafaf8; width: 56px; font-family: inherit; }
        .act-edit-dur:focus { outline: none; border-color: #7c3aed; }
        .act-edit-hint { font-size: 0.75rem; color: #9a9a94; }
        .act-edit-location { width: 100%; padding: 6px 8px; border: 1px solid #e0e0db; border-radius: 8px; font-size: 0.8rem; color: #1a1a1a; background: #fafaf8; box-sizing: border-box; }
        .act-edit-location:focus { outline: none; border-color: #1D9E75; }
        .act-edit-notes { width: 100%; padding: 6px 8px; border: 1px solid #e0e0db; border-radius: 8px; font-size: 0.8rem; color: #1a1a1a; background: #fafaf8; resize: none; box-sizing: border-box; font-family: inherit; line-height: 1.4; }
        .act-edit-notes:focus { outline: none; border-color: #1D9E75; }
        .act-edit-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .act-btn-cancel { padding: 5px 12px; border-radius: 8px; border: 1px solid #e0e0db; background: #f8f7f4; font-size: 0.8125rem; cursor: pointer; color: #3a3a3a; }
        .act-btn-save { padding: 5px 14px; border-radius: 8px; border: none; background: #1D9E75; color: #fff; font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
        .act-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
