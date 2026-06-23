// ============================================================
// src/components/trip/ActivityCard.tsx  — Modulo C+D
// Toggle animato, stato visivo ricco, poll integrato
// ============================================================
'use client'

import { useState, useTransition, useOptimistic, useCallback } from 'react'
import { toggleActivity, deleteActivity, updateActivity } from '@/app/trip/[id]/timeline/actions'
import { ReviewSection } from './ReviewSection'
import type { Activity, Profile } from '@/types/database'

interface Props {
  activity: Activity
  tripId: string
  isLast: boolean
  currentUserId: string
  members: Profile[]
  onToggled?: (newStatus: 'todo' | 'done') => void
}

export function ActivityCard({ activity, tripId, isLast, currentUserId, members, onToggled }: Props) {
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

  function handleToggle() {
    const next = isDone ? 'todo' : 'done'
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
    <div className={`act-card ${isDone ? 'act-done' : ''} ${isLast ? 'act-last' : ''}`}>
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
              <input
                className="act-edit-time"
                type="time"
                value={timeStart}
                onChange={e => setTimeStart(e.target.value)}
              />
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
            {activity.location && (
              <p className={`act-location ${isDone ? 'act-location-done' : ''}`}>📍 {activity.location}</p>
            )}
            {activity.notes && (
              <p className={`act-notes ${isDone ? 'act-notes-done' : ''}`}>{activity.notes}</p>
            )}
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
        .act-card {
          display: flex;
          gap: 0;
          padding-bottom: 4px;
          transition: opacity 0.2s;
        }
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
        .act-location {
          font-size: 0.75rem;
          color: #1D9E75;
          margin: 3px 0 0;
          line-height: 1.4;
          transition: color 0.2s;
        }
        .act-location-done { color: #b0b0aa; }
        .act-notes {
          font-size: 0.775rem;
          color: #6b6b6b;
          margin: 3px 0 0;
          line-height: 1.4;
          transition: color 0.2s;
        }
        .act-notes-done { color: #b0b0aa; }
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
