// ============================================================
// src/components/trip/DayBlock.tsx  — Modulo C
// Supporto tappe mono-giorno e multi-giorno con sezioni giornaliere
// ============================================================
'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { ActivityCard } from './ActivityCard'
import { AddActivityForm } from './AddActivityForm'
import { CompletionBurst } from './CompletionBurst'
import { ReviewSection } from './ReviewSection'
import { addActivity, deleteDay, updateDay } from '@/app/trip/[id]/timeline/actions'
import { DateInput } from '@/components/ui/DateInput'
import { scheduleDayActivities } from '@/app/trip/[id]/schedule/actions'
import type { Activity, DayWithActivities, Profile } from '@repo/shared/types/database'

interface Props {
  day: DayWithActivities
  tripId: string
  isToday: boolean
  currentUserId: string
  members: Profile[]
  defaultExpanded?: boolean
  tripDestination?: string | null
  // Drag-and-drop: drop generico sul giorno (cross-day) o su una sezione specifica (cross-day e intra-day)
  onActivityDrop:          (activityId: string, sourceDayId: string) => void
  onActivityDropToSection: (activityId: string, sourceDayId: string, targetDate: string | null) => void
  onDayDeleted?:           (dayId: string) => void
}

// Converte una Date in YYYY-MM-DD usando l'ora locale (evita il bug UTC+N)
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Genera l'array di date YYYY-MM-DD dall'inizio alla fine dell'intervallo
function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T00:00:00')  // T00:00:00 = ora locale, non UTC
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    dates.push(toLocalDateStr(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function sortActivities(acts: Activity[]): Activity[] {
  return acts.slice().sort((a, b) => {
    if (a.time_start && b.time_start) return a.time_start.localeCompare(b.time_start)
    if (a.time_start) return -1
    if (b.time_start) return 1
    return a.position - b.position
  })
}

export function DayBlock({
  day, tripId, isToday, currentUserId, members, defaultExpanded = false,
  tripDestination,
  onActivityDrop, onActivityDropToSection, onDayDeleted,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded || isToday)
  // addingForDate: null = non sta aggiungendo
  //   'single'     = tappa mono-giorno (activity_date = null)
  //   'YYYY-MM-DD' = tappa multi-giorno, aggiunge per quella data
  const [addingForDate, setAddingForDate] = useState<string | null>(null)
  const [newTitle,    setNewTitle]    = useState('')
  const [newTime,     setNewTime]     = useState('')
  const [newDuration, setNewDuration] = useState('')
  const [newNotes,    setNewNotes]    = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newLat,      setNewLat]      = useState<number | null>(null)
  const [newLng,      setNewLng]      = useState<number | null>(null)
  const [editingDay, setEditingDay] = useState(false)
  const [dayTitle, setDayTitle] = useState(day.title)
  const [dayDate, setDayDate] = useState(day.date ?? '')
  const [dayDateEnd, setDayDateEnd] = useState(day.date_end ?? '')
  const [showBurst, setShowBurst] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDragOver,   setIsDragOver]   = useState(false)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const prevDoneCount = useRef(-1)

  const activities = day.activities ?? []
  const doneCount = activities.filter(a => a.status === 'done').length
  const totalCount = activities.length
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  const allDone = totalCount > 0 && doneCount === totalCount
  const today = toLocalDateStr(new Date())

  // Tappa multi-giorno: date valida + date_end > date
  const isMultiDay = !!(day.date && day.date_end && day.date_end > day.date)
  const dateRange = isMultiDay ? getDatesInRange(day.date!, day.date_end!) : []

  // Raggruppa le attività per activity_date (chiave 'unassigned' per quelle senza data)
  const actsByDate = new Map<string, Activity[]>()
  if (isMultiDay) {
    dateRange.forEach(d => actsByDate.set(d, []))
    actsByDate.set('unassigned', [])
    activities.forEach(act => {
      const key = act.activity_date && actsByDate.has(act.activity_date)
        ? act.activity_date
        : 'unassigned'
      actsByDate.get(key)!.push(act)
    })
  }

  // Trigger burst quando si completa l'ultimo
  useEffect(() => {
    if (prevDoneCount.current !== -1 && doneCount === totalCount && totalCount > 0 && doneCount > prevDoneCount.current) {
      setShowBurst(true)
    }
    prevDoneCount.current = doneCount
  }, [doneCount, totalCount])

  // Formatta le date nel header della tappa
  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short',
  })
  const dateLabel = day.date
    ? (isMultiDay
        ? `${fmtDate(day.date)} → ${fmtDate(day.date_end!)}`
        : new Date(day.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
      )
    : null

  // M3: tertiary per completato, primary per avanzato, secondary per metà, error per poco
  const progressColor =
    progress === 100 ? 'var(--md-tertiary, #0D9488)' :
    progress >= 66   ? 'var(--md-primary, #7C3AED)' :
    progress >= 33   ? 'var(--md-secondary, #D97706)' : 'var(--md-error, #DC2626)'

  const progressBg =
    progress === 100 ? 'var(--md-tertiary-container, #CCFBF1)' :
    progress >= 66   ? 'var(--md-primary-container, #EDE9FE)' :
    progress >= 33  ? 'var(--md-secondary-container, #FEF3C7)' : 'var(--md-error-container, #FEE2E2)'

  function resetForm() {
    setNewTitle(''); setNewTime(''); setNewDuration(''); setNewNotes(''); setNewLocation(''); setNewLat(null); setNewLng(null)
  }

  function openAddFor(dateKey: string) {
    resetForm()
    setAddingForDate(dateKey)
  }

  function handleAddActivity() {
    if (!newTitle.trim()) return
    // Per le tappe multi-giorno usa la data della sezione; per single usa null
    const activityDate = (addingForDate && addingForDate !== 'single') ? addingForDate : null
    startTransition(async () => {
      const dur = newDuration ? parseInt(newDuration, 10) : null
      await addActivity(tripId, day.id, newTitle.trim(), newTime || null, newNotes || null, newLocation || null, activityDate, activities.length, isNaN(dur ?? 0) ? null : dur, newLat, newLng)
      resetForm()
      setAddingForDate(null)
    })
  }

  function handleDeleteDay() {
    if (!confirm(`Eliminare "${day.title}" e tutte le sue attività?`)) return
    startTransition(async () => {
      await deleteDay(tripId, day.id)
      onDayDeleted?.(day.id)   // rimozione ottimistica immediata
    })
  }

  function handleSaveDay() {
    startTransition(async () => {
      await updateDay(tripId, day.id, dayTitle, dayDate || null, dayDateEnd || null)
      setEditingDay(false)
    })
  }

  async function handleSchedule(targetDate: string | null) {
    setScheduling(true)
    setScheduleMsg(null)
    const result = await scheduleDayActivities(tripId, day.id, day.title, targetDate)
    setScheduling(false)
    if ('error' in result) {
      setScheduleMsg(`⚠️ ${result.error}`)
      setTimeout(() => setScheduleMsg(null), 4000)
    } else {
      const mode = result.usedLLM ? '✨ AI' : '📐 Auto'
      const base = `${mode} · ${result.scheduled} attività pianificate`
      setScheduleMsg(result.summary ? `${base}\n"${result.summary}"` : base)
      setTimeout(() => setScheduleMsg(null), 8000)
    }
  }

  // Il form è un componente separato per garantire il corretto scoping styled-jsx (SWC)
  const addForm = (
    <AddActivityForm
      destination={tripDestination ?? day.title}
      title={newTitle}            setTitle={setNewTitle}
      time={newTime}              setTime={setNewTime}
      duration={newDuration}      setDuration={setNewDuration}
      notes={newNotes}            setNotes={setNewNotes}
      location={newLocation}      setLocation={setNewLocation}
      setLat={setNewLat}          setLng={setNewLng}
      isPending={isPending}
      onSave={handleAddActivity}
      onCancel={() => { setAddingForDate(null); resetForm() }}
    />
  )

  return (
    <>
      <CompletionBurst show={showBurst} message={`🎉 "${day.title || 'Tappa'}" completata!`} />

      <div className={`day-block ${isToday ? 'day-today' : ''} ${allDone ? 'day-all-done' : ''}`}>
        {/* Header */}
        <div className="day-header" onClick={() => !editingDay && setExpanded(e => !e)}>
          <div className="day-header-left">
            <div className={`day-status-dot ${allDone ? 'dot-done' : isToday ? 'dot-today' : 'dot-future'}`} />
            {editingDay ? (
              <div className="day-edit-inline" onClick={e => e.stopPropagation()}>
                <input className="day-edit-name" value={dayTitle} onChange={e => setDayTitle(e.target.value)} placeholder="Nome tappa" autoFocus />
                <DateInput compact value={dayDate} onChange={setDayDate} />
                <span className="day-edit-arrow">→</span>
                <DateInput compact value={dayDateEnd} onChange={setDayDateEnd} min={dayDate || undefined} />
                <button className="day-edit-save" onClick={handleSaveDay} disabled={isPending}>✓</button>
                <button className="day-edit-cancel" onClick={() => { setEditingDay(false); setDayDateEnd(day.date_end ?? '') }}>✕</button>
              </div>
            ) : (
              <div className="day-title-wrap">
                <span className="day-title">{day.title || 'Tappa senza nome'}</span>
                {dateLabel && <span className="day-date">{dateLabel}</span>}
                {isMultiDay && (
                  <span className="badge-multiday">{dateRange.length}g</span>
                )}
                {isToday && !isMultiDay && <span className="day-badge-today">Oggi</span>}
                {isToday && isMultiDay && <span className="day-badge-today">In corso</span>}
                {allDone && <span className="day-badge-done">✓ Fatto</span>}
              </div>
            )}
          </div>

          <div className="day-header-right" onClick={e => e.stopPropagation()}>
            {!editingDay && (
              <>
                {totalCount > 0 && (
                  <span className="day-count" style={{ color: allDone ? '#1D9E75' : undefined }}>
                    {doneCount}/{totalCount}
                  </span>
                )}
                <button className="day-icon-btn" onClick={() => setEditingDay(true)} aria-label="Modifica tappa">✏️</button>
                <button className="day-icon-btn day-icon-delete" onClick={handleDeleteDay} aria-label="Elimina tappa">🗑</button>
              </>
            )}
            <div className={`day-chevron ${expanded ? 'day-chevron-open' : ''}`}>›</div>
          </div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="day-progress-wrap" style={{ background: progressBg }}>
            <div className="day-progress-track">
              <div className="day-progress-fill" style={{ width: `${progress}%`, background: progressColor }} />
            </div>
            <span className="day-progress-label" style={{ color: progressColor }}>
              {progress === 100 ? '🎉 Completato' : `${progress}%`}
            </span>
          </div>
        )}

        {/* Corpo espanso */}
        {expanded && (
          <div
            className={`day-activities${isDragOver ? ' day-drop-target' : ''}`}
            onDragOver={(e) => {
              // e.preventDefault() DEVE essere chiamato incondizionatamente:
              // senza di esso il browser non attiva mai l'evento onDrop
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (!isDragOver) setIsDragOver(true)
            }}
            onDragLeave={(e) => {
              // Ignora il leave quando il mouse entra in un elemento figlio
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDragOver(false)
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragOver(false)
              const activityId  = e.dataTransfer.getData('text/activityid')
              const sourceDayId = e.dataTransfer.getData('text/dayid')
              if (activityId && sourceDayId && sourceDayId !== day.id) {
                onActivityDrop(activityId, sourceDayId)
              }
            }}
          >
            {scheduleMsg && (
              <div className={`day-sched-msg ${scheduleMsg.startsWith('⚠️') ? 'day-sched-msg-err' : 'day-sched-msg-ok'}`}>
                {scheduleMsg}
              </div>
            )}
            {isMultiDay ? (
              /* ── TAPPA MULTI-GIORNO: sezioni per data ── */
              <>
                {dateRange.map((dateStr, sIdx) => {
                  const sectionActs = sortActivities(actsByDate.get(dateStr) ?? [])
                  const isDateToday = dateStr === today
                  const isAddingHere = addingForDate === dateStr

                  return (
                    <div
                      key={dateStr}
                      className={`day-section ${isDateToday ? 'day-section-today' : ''} ${dragOverDate === dateStr ? 'day-section-drop-target' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragOverDate !== dateStr) setDragOverDate(dateStr) }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null) }}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation(); setDragOverDate(null); setIsDragOver(false)
                        const actId  = e.dataTransfer.getData('text/activityid')
                        const srcId  = e.dataTransfer.getData('text/dayid')
                        if (actId && srcId) onActivityDropToSection(actId, srcId, dateStr)
                      }}
                    >
                      <div className="day-section-header">
                        <span className={`day-section-label ${isDateToday ? 'day-section-label-today' : ''}`}>
                          {formatShortDate(dateStr)}
                          {isDateToday && <span className="day-section-today-dot" />}
                        </span>
                        <div className="day-section-line" />
                        {!isAddingHere && (
                          <>
                            <button
                              className="day-section-sched-btn"
                              onClick={() => handleSchedule(dateStr)}
                              disabled={scheduling}
                              title="Pianifica automaticamente"
                            >
                              {scheduling ? '⏳' : '✨'}
                            </button>
                            <button
                              className="day-section-add-btn"
                              onClick={() => openAddFor(dateStr)}
                              aria-label={`Aggiungi attività per ${formatShortDate(dateStr)}`}
                            >
                              +
                            </button>
                          </>
                        )}
                      </div>

                      {sectionActs.map((act, i, arr) => (
                        <ActivityCard
                          key={act.id}
                          activity={act}
                          tripId={tripId}
                          isLast={i === arr.length - 1 && !isAddingHere}
                          currentUserId={currentUserId}
                          members={members}
                          dayId={day.id}
                          dayTitle={day.title}
                          cardIndex={i}
                        />
                      ))}

                      {isAddingHere && addForm}
                    </div>
                  )
                })}

                {/* Attività senza data assegnata */}
                {(actsByDate.get('unassigned') ?? []).length > 0 && (
                  <div
                    className={`day-section day-section-unassigned ${dragOverDate === '__unassigned__' ? 'day-section-drop-target' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragOverDate !== '__unassigned__') setDragOverDate('__unassigned__') }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null) }}
                    onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation(); setDragOverDate(null); setIsDragOver(false)
                      const actId = e.dataTransfer.getData('text/activityid')
                      const srcId = e.dataTransfer.getData('text/dayid')
                      if (actId && srcId) onActivityDropToSection(actId, srcId, null)
                    }}
                  >
                    <div className="day-section-header">
                      <span className="day-section-label day-section-label-unassigned">Da assegnare</span>
                      <div className="day-section-line" />
                    </div>
                    {sortActivities(actsByDate.get('unassigned')!).map((act, i, arr) => (
                      <ActivityCard
                        key={act.id}
                        activity={act}
                        tripId={tripId}
                        isLast={i === arr.length - 1}
                        currentUserId={currentUserId}
                        members={members}
                        dayId={day.id}
                        dayTitle={day.title}
                        cardIndex={i}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* ── TAPPA MONO-GIORNO: comportamento esistente ── */
              <div className="day-activities-single">
                {activities.length === 0 && addingForDate === null && (
                  <p className="day-empty">Nessuna attività. Aggiungine una!</p>
                )}

                {sortActivities(activities).map((activity, i, arr) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    tripId={tripId}
                    isLast={i === arr.length - 1 && addingForDate === null}
                    currentUserId={currentUserId}
                    members={members}
                    dayId={day.id}
                    dayTitle={day.title}
                    cardIndex={i}
                  />
                ))}

                {addingForDate !== null
                  ? addForm
                  : (
                    <>
                      {activities.some(a => !a.time_start) && (
                        <button
                          className="day-sched-btn"
                          onClick={() => handleSchedule(null)}
                          disabled={scheduling}
                        >
                          {scheduling ? '⏳ Pianificazione in corso…' : '✨ Pianifica automaticamente'}
                        </button>
                      )}
                      <button className="day-add-btn" onClick={() => openAddFor('single')}>
                        + Aggiungi attività
                      </button>
                    </>
                  )
                }
              </div>
            )}

            {/* Recensione per la tappa */}
            <div className="day-review-wrap">
              <ReviewSection
                tripId={tripId}
                dayId={day.id}
                currentUserId={currentUserId}
                members={members}
              />
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        /* M3 Elevated Card */
        .day-block { background: var(--md-surface, #FAFAFA); border-radius: var(--md-radius-xl, 24px); border: none; overflow: hidden; box-shadow: var(--md-elevation-1); transition: box-shadow 0.2s; }
        .day-today    { box-shadow: 0 0 0 2px var(--md-primary, #7C3AED), var(--md-elevation-1); }
        .day-all-done { box-shadow: 0 0 0 2px var(--md-tertiary, #0D9488), var(--md-elevation-1); }
        .day-header { display: flex; align-items: center; justify-content: space-between; padding: 0.875rem 1rem; cursor: pointer; user-select: none; gap: 8px; }
        .day-header-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .day-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; transition: background 0.3s; }
        .dot-done   { background: var(--md-tertiary, #0D9488); }
        .dot-today  { background: var(--md-primary, #7C3AED); box-shadow: 0 0 0 3px rgba(124,58,237,0.2); }
        .dot-future { background: var(--md-outline-variant, #D4D4D8); }
        .day-title-wrap { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
        .day-title { font-size: 0.9375rem; font-weight: 600; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .day-date { font-size: 0.75rem; color: #9a9a94; flex-shrink: 0; }
        .badge-multiday  { font-size: 0.6rem; font-weight: 700; background: var(--md-primary-container, #EDE9FE); color: var(--md-primary, #7C3AED); padding: 2px 6px; border-radius: var(--md-radius-full); flex-shrink: 0; }
        .day-badge-today { font-size: 0.65rem; font-weight: 700; background: var(--md-secondary-container, #FEF3C7); color: var(--md-secondary, #D97706); padding: 2px 7px; border-radius: var(--md-radius-full); flex-shrink: 0; }
        .day-badge-done  { font-size: 0.65rem; font-weight: 700; background: var(--md-tertiary-container, #CCFBF1); color: var(--md-tertiary, #0D9488); padding: 2px 7px; border-radius: var(--md-radius-full); }
        .day-header-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .day-count { font-size: 0.75rem; color: #9a9a94; font-variant-numeric: tabular-nums; font-weight: 500; transition: color 0.3s; }
        .day-icon-btn { background: none; border: none; cursor: pointer; font-size: 0.875rem; padding: 2px 4px; border-radius: 4px; opacity: 0; transition: opacity 0.15s, background 0.1s; }
        .day-block:hover .day-icon-btn { opacity: 1; }
        .day-icon-btn:hover { background: #f0f0ec; }
        .day-icon-delete:hover { background: #fef2f2; }
        .day-chevron { font-size: 1.125rem; color: #9a9a94; transform: rotate(90deg); transition: transform 0.2s; line-height: 1; }
        .day-chevron-open { transform: rotate(-90deg); }

        /* Progress bar */
        .day-progress-wrap { padding: 4px 1rem 6px; display: flex; align-items: center; gap: 8px; transition: background 0.4s; }
        .day-progress-track { flex: 1; height: 4px; background: rgba(0,0,0,0.08); border-radius: 99px; overflow: hidden; }
        .day-progress-fill { height: 100%; border-radius: 99px; transition: width 0.5s ease, background 0.4s; }
        .day-progress-label { font-size: 0.7rem; font-weight: 600; flex-shrink: 0; min-width: 52px; text-align: right; font-variant-numeric: tabular-nums; transition: color 0.4s; }

        /* Corpo attività */
        .day-activities { border-top: 1px solid #f0f0ec; transition: background 0.15s, box-shadow 0.15s; }
        .day-drop-target { background: #f0fbf7; box-shadow: inset 0 0 0 2px #1D9E75; border-radius: 0 0 16px 16px; }

        /* Wrapper mono-giorno: ripristina padding originale */
        .day-activities-single { padding: 0.75rem 1rem 0.5rem; }
        .day-empty { font-size: 0.8rem; color: #9a9a94; text-align: center; padding: 0.5rem 0; }
        .day-add-btn { width: 100%; padding: 0.6rem; background: none; border: 1.5px dashed #d0d0cb; border-radius: 10px; font-size: 0.8125rem; color: #9a9a94; cursor: pointer; margin-top: 8px; transition: all 0.15s; }
        .day-add-btn:hover { border-color: #1D9E75; color: #1D9E75; background: #f8fffc; }
        .day-sched-btn { width: 100%; padding: 0.6rem; background: #faf5ff; border: 1.5px dashed #c4b5fd; border-radius: 10px; font-size: 0.8125rem; color: #7c3aed; cursor: pointer; margin-top: 8px; transition: all 0.15s; font-family: inherit; }
        .day-sched-btn:hover:not(:disabled) { background: #f3e8ff; border-color: #7c3aed; }
        .day-sched-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ─── Sezioni giornaliere (multi-day) ─── */
        .day-section { padding: 0 1rem; border-radius: 10px; transition: background 0.15s, box-shadow 0.15s; }
        .day-section:last-child { padding-bottom: 0.5rem; }
        .day-section-drop-target { background: #f0fbf7; box-shadow: inset 0 0 0 2px #1D9E75; }

        .day-section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 0 6px;
        }
        .day-section-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #b0b0aa;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .day-section-label-today { color: #BA7517; }
        .day-section-today-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #BA7517;
          display: inline-block;
          flex-shrink: 0;
        }
        .day-section-label-unassigned { color: #d0d0cb; font-style: italic; }
        .day-section-line {
          flex: 1;
          height: 1px;
          background: #f0f0ec;
        }
        .day-section-today .day-section-line { background: rgba(186,117,23,0.2); }
        .day-section-unassigned .day-section-line { background: #f8f7f4; }

        .day-section-add-btn {
          width: 22px; height: 22px;
          border-radius: 50%;
          border: 1.5px dashed #d0d0cb;
          background: none;
          color: #b0b0aa;
          font-size: 0.9rem;
          line-height: 1;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .day-section-add-btn:hover { border-color: #1D9E75; color: #1D9E75; background: #f8fffc; }
        .day-section-sched-btn { width: 22px; height: 22px; border-radius: 50%; border: 1.5px dashed #c4b5fd; background: none; color: #7c3aed; font-size: 0.75rem; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
        .day-section-sched-btn:hover:not(:disabled) { background: #f3e8ff; border-color: #7c3aed; }
        .day-section-sched-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Edit inline header */
        .day-edit-inline { display: flex; align-items: center; gap: 5px; flex: 1; flex-wrap: wrap; }
        .day-edit-name { flex: 1; min-width: 80px; padding: 4px 8px; border: 1px solid #1D9E75; border-radius: 8px; font-size: 0.875rem; font-weight: 600; color: #1a1a1a; background: #fff; }
        .day-edit-name:focus { outline: none; }
        .day-edit-date { padding: 4px 6px; border: 1px solid #e0e0db; border-radius: 8px; font-size: 0.75rem; color: #1a1a1a; background: #fafaf8; width: 120px; }
        .day-edit-date-end { width: 120px; }
        .day-edit-arrow { font-size: 0.75rem; color: #9a9a94; flex-shrink: 0; }
        .day-edit-save, .day-edit-cancel { background: none; border: none; cursor: pointer; font-size: 1rem; padding: 4px; border-radius: 4px; }
        .day-edit-save { color: #1D9E75; }
        .day-edit-cancel { color: #E24B4A; }

        /* Stili del form di aggiunta sono in AddActivityForm.tsx */
        .day-review-wrap { padding: 0 1rem 0.75rem; border-top: 1px dashed #e8e8e4; margin-top: 4px; }
        .day-sched-msg { margin: 6px 1rem; padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 500; white-space: pre-line; line-height: 1.45; }
        .day-sched-msg-ok { background: #E1F5EE; color: #0F6E56; }
        .day-sched-msg-err { background: #fef2f2; color: #b91c1c; }
      `}</style>
    </>
  )
}
