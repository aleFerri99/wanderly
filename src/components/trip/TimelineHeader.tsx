// ============================================================
// src/components/trip/TimelineHeader.tsx
// Header gamificato: anello progresso, streak giorni, stato viaggio
// ============================================================
'use client'

import type { DayWithActivities } from '@/types/database'

interface Props {
  days: DayWithActivities[]
  tripName: string
}

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export function TimelineHeader({ days, tripName }: Props) {
  const allActivities = days.flatMap(d => d.activities ?? [])
  const total = allActivities.length
  const done = allActivities.filter(a => a.status === 'done').length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

  // Giorni completati: per tappe multi-day conta ogni giorno singolo con tutte le attività done
  let completedDays = 0
  days.forEach(d => {
    const acts = d.activities ?? []
    const isMultiDay = !!(d.date && d.date_end && d.date_end > d.date)
    if (isMultiDay) {
      getDatesInRange(d.date!, d.date_end!).forEach(dateStr => {
        const dayActs = acts.filter(a => a.activity_date === dateStr)
        if (dayActs.length > 0 && dayActs.every(a => a.status === 'done')) completedDays++
      })
    } else {
      if (acts.length > 0 && acts.every(a => a.status === 'done')) completedDays++
    }
  })

  // Tappa che contiene oggi (supporta multi-day)
  const todayDay = days.find(d => {
    if (!d.date) return false
    if (!d.date_end || d.date_end <= d.date) return d.date === today
    return d.date <= today && today <= d.date_end
  })
  const isMultiDayToday = !!(todayDay?.date_end && todayDay.date_end > todayDay.date!)
  const todayActs = isMultiDayToday
    ? (todayDay?.activities ?? []).filter(a => a.activity_date === today)
    : (todayDay?.activities ?? [])
  const todayDone = todayActs.filter(a => a.status === 'done').length
  const todayTotal = todayActs.length
  const todayProgress = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0

  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  const statusEmoji =
    progress === 100 ? '🎉' :
    progress >= 75   ? '🔥' :
    progress >= 50   ? '⚡' :
    progress >= 25   ? '👣' : '🗺️'

  const statusLabel =
    progress === 100 ? 'Viaggio completato!' :
    progress >= 75   ? 'Quasi finiti!'       :
    progress >= 50   ? 'Metà strada!'        :
    progress >= 25   ? 'Partiti!'            : 'Inizia il viaggio'

  return (
    <div className="tl-header">
      <div className="tl-ring-wrap">
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r={radius} fill="none" stroke="#f0f0ec" strokeWidth="7" />
          <circle
            cx="48" cy="48" r={radius}
            fill="none"
            stroke={progress >= 50 ? '#1D9E75' : '#5DCAA5'}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 48 48)"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="tl-ring-inner">
          <span className="tl-ring-emoji">{statusEmoji}</span>
          <span className="tl-ring-pct">{progress}%</span>
        </div>
      </div>

      <div className="tl-info">
        <h2 className="tl-trip-name">{tripName}</h2>
        <p className="tl-status-label">{statusLabel}</p>
        <div className="tl-stats">
          <div className="tl-stat">
            <span className="tl-stat-value">{done}</span>
            <span className="tl-stat-label">fatte</span>
          </div>
          <div className="tl-stat-divider" />
          <div className="tl-stat">
            <span className="tl-stat-value">{total - done}</span>
            <span className="tl-stat-label">da fare</span>
          </div>
          <div className="tl-stat-divider" />
          <div className="tl-stat">
            <span className="tl-stat-value">{completedDays}</span>
            <span className="tl-stat-label">{completedDays === 1 ? 'giorno ✓' : 'giorni ✓'}</span>
          </div>
        </div>
        {todayDay && todayTotal > 0 && (
          <div className="tl-today-bar">
            <span className="tl-today-label">Oggi: {todayDone}/{todayTotal}</span>
            <div className="tl-today-track">
              <div className="tl-today-fill" style={{ width: `${todayProgress}%` }} />
            </div>
            <span className="tl-today-pct">{todayProgress}%</span>
          </div>
        )}
      </div>

      <style jsx>{`
        .tl-header { background: #fff; border-radius: 20px; border: 1px solid #e8e8e4; padding: 1.25rem; display: flex; gap: 1rem; align-items: center; }
        .tl-ring-wrap { position: relative; flex-shrink: 0; width: 96px; height: 96px; }
        .tl-ring-inner { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
        .tl-ring-emoji { font-size: 1.25rem; line-height: 1; }
        .tl-ring-pct { font-size: 0.8125rem; font-weight: 700; color: #1D9E75; font-variant-numeric: tabular-nums; }
        .tl-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .tl-trip-name { font-size: 0.9375rem; font-weight: 700; color: #1a1a1a; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tl-status-label { font-size: 0.8rem; color: #1D9E75; font-weight: 500; margin: 0; }
        .tl-stats { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
        .tl-stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .tl-stat-value { font-size: 1rem; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; line-height: 1; }
        .tl-stat-label { font-size: 0.65rem; color: #9a9a94; white-space: nowrap; }
        .tl-stat-divider { width: 1px; height: 24px; background: #e8e8e4; }
        .tl-today-bar { display: flex; align-items: center; gap: 6px; margin-top: 6px; background: #f8f7f4; border-radius: 8px; padding: 5px 8px; }
        .tl-today-label { font-size: 0.7rem; color: #6b6b6b; font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .tl-today-track { flex: 1; height: 5px; background: #e8e8e4; border-radius: 99px; overflow: hidden; }
        .tl-today-fill { height: 100%; background: #BA7517; border-radius: 99px; transition: width 0.4s ease; }
        .tl-today-pct { font-size: 0.7rem; font-weight: 600; color: #BA7517; font-variant-numeric: tabular-nums; min-width: 26px; text-align: right; }
      `}</style>
    </div>
  )
}
