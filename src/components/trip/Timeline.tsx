// ============================================================
// src/components/trip/Timeline.tsx  — Modulo C
// ============================================================
'use client'

import { useState, useTransition, useCallback } from 'react'
import { DayBlock } from './DayBlock'
import { TimelineHeader } from './TimelineHeader'
import { useTimelineRealtime } from '@/hooks/useTimelineRealtime'
import { addDay } from '@/app/trip/[id]/timeline/actions'
import type { DayWithActivities, Profile } from '@/types/database'

interface Props {
  tripId: string
  initialDays: DayWithActivities[]
  tripStartDate: string | null
  tripName: string
  currentUserId: string
  members: Profile[]
}

export function Timeline({ tripId, initialDays, tripStartDate, tripName, currentUserId, members }: Props) {
  const [days, setDays] = useState<DayWithActivities[]>(initialDays)
  const [addingDay, setAddingDay] = useState(false)
  const [newDayTitle, setNewDayTitle] = useState('')
  const [newDayDate, setNewDayDate] = useState('')
  const [newDayDateEnd, setNewDayDateEnd] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleRealtimeUpdate = useCallback((updatedDays: DayWithActivities[]) => {
    setDays(updatedDays)
  }, [])

  useTimelineRealtime({ tripId, onUpdate: handleRealtimeUpdate })

  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const todayDayId = days.find(d => {
    if (!d.date) return false
    if (!d.date_end || d.date_end <= d.date) return d.date === today
    return d.date <= today && today <= d.date_end
  })?.id ?? null

  function handleAddDay() {
    if (!newDayTitle.trim()) return
    startTransition(async () => {
      await addDay(tripId, newDayTitle.trim(), newDayDate || null, newDayDateEnd || null, days.length)
      setNewDayTitle('')
      setNewDayDate('')
      setNewDayDateEnd('')
      setAddingDay(false)
    })
  }

  const sortedDays = days.slice().sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date)
    return a.position - b.position
  })

  return (
    <div className="timeline-wrap">
      {/* Header gamificato */}
      <TimelineHeader days={days} tripName={tripName} />

      {/* Lista giorni */}
      <div className="days-list">
        {days.length === 0 ? (
          <div className="timeline-empty">
            <div className="empty-icon">🗓</div>
            <h3>Nessuna tappa ancora</h3>
            <p>Aggiungi il primo giorno del tuo itinerario.</p>
          </div>
        ) : (
          sortedDays.map((day, index) => (
            <DayBlock
              key={day.id}
              day={day}
              tripId={tripId}
              isToday={day.id === todayDayId}
              currentUserId={currentUserId}
              members={members}
              defaultExpanded={index === 0}
            />
          ))
        )}
      </div>

      {/* Aggiungi tappa */}
      {addingDay ? (
        <div className="add-day-form">
          <h3>Nuova tappa</h3>
          <div className="add-day-field">
            <label>Nome della tappa</label>
            <input
              value={newDayTitle}
              onChange={e => setNewDayTitle(e.target.value)}
              placeholder="es. Giorno 1 · Parigi"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddDay()}
            />
          </div>
          <div className="add-day-field">
            <label>Intervallo date (opzionale)</label>
            <div className="add-day-dates">
              <input
                type="date"
                value={newDayDate}
                onChange={e => setNewDayDate(e.target.value)}
                min={tripStartDate ?? undefined}
                placeholder="Inizio"
              />
              <span className="add-day-arrow">→</span>
              <input
                type="date"
                value={newDayDateEnd}
                onChange={e => setNewDayDateEnd(e.target.value)}
                min={newDayDate || tripStartDate || undefined}
                placeholder="Fine"
              />
            </div>
            {newDayDate && newDayDateEnd && newDayDateEnd > newDayDate && (
              <p className="add-day-range-hint">
                {Math.round((new Date(newDayDateEnd + 'T00:00:00').getTime() - new Date(newDayDate + 'T00:00:00').getTime()) / 86400000) + 1} giorni
              </p>
            )}
          </div>
          <div className="add-day-actions">
            <button className="add-day-cancel" onClick={() => { setAddingDay(false); setNewDayTitle(''); setNewDayDate(''); setNewDayDateEnd('') }}>
              Annulla
            </button>
            <button className="add-day-save" onClick={handleAddDay} disabled={isPending || !newDayTitle.trim()}>
              {isPending ? 'Creazione…' : '+ Crea tappa'}
            </button>
          </div>
        </div>
      ) : (
        <button className="add-day-btn" onClick={() => setAddingDay(true)}>
          + Aggiungi tappa
        </button>
      )}

      <style jsx>{`
        .timeline-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
        .days-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .timeline-empty { text-align: center; padding: 2.5rem 1rem; background: #fff; border-radius: 16px; border: 1px dashed #d0d0cb; }
        .empty-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
        .timeline-empty h3 { font-size: 1rem; font-weight: 600; color: #1a1a1a; margin: 0 0 0.375rem; }
        .timeline-empty p { font-size: 0.875rem; color: #6b6b6b; margin: 0; }
        .add-day-btn { width: 100%; padding: 0.75rem; background: none; border: 1.5px dashed #d0d0cb; border-radius: 16px; font-size: 0.875rem; font-weight: 500; color: #9a9a94; cursor: pointer; transition: border-color 0.15s, color 0.15s, background 0.15s; }
        .add-day-btn:hover { border-color: #1D9E75; color: #1D9E75; background: #f8fffc; }
        .add-day-form { background: #fff; border-radius: 16px; border: 1px solid #1D9E75; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 0 0 3px rgba(29,158,117,0.08); }
        .add-day-form h3 { font-size: 0.9375rem; font-weight: 600; color: #1a1a1a; margin: 0; }
        .add-day-field { display: flex; flex-direction: column; gap: 0.375rem; }
        .add-day-field label { font-size: 0.8125rem; font-weight: 500; color: #3a3a3a; }
        .add-day-field input { padding: 0.65rem 0.875rem; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.9375rem; color: #1a1a1a; background: #fafaf8; transition: border-color 0.15s; }
        .add-day-field input:focus { outline: none; border-color: #1D9E75; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); }
        .add-day-dates { display: flex; align-items: center; gap: 6px; }
        .add-day-dates input { flex: 1; min-width: 0; font-size: 0.875rem; padding: 0.55rem 0.6rem; }
        .add-day-arrow { color: #9a9a94; font-size: 0.875rem; flex-shrink: 0; }
        .add-day-range-hint { font-size: 0.775rem; color: #1D9E75; font-weight: 500; margin: 4px 0 0; }
        .add-day-actions { display: flex; gap: 0.75rem; }
        .add-day-cancel { flex: 1; padding: 0.7rem; background: #f8f7f4; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.875rem; font-weight: 500; color: #3a3a3a; cursor: pointer; }
        .add-day-save { flex: 1; padding: 0.7rem; background: #1D9E75; border: none; border-radius: 10px; font-size: 0.875rem; font-weight: 600; color: #fff; cursor: pointer; }
        .add-day-save:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
