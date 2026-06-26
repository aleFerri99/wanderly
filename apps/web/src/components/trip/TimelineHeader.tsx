// ============================================================
// src/components/trip/TimelineHeader.tsx
// Header gamificato: anello progresso, streak giorni, stato viaggio
// ============================================================
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import type { DayWithActivities } from '@repo/shared/types/database'

interface Props {
  days: DayWithActivities[]
  tripName: string
  tripDestination?: string | null
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

// ── Haversine: distanza in km tra due coordinate ──────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Centro geografico di una tappa (media lat/lng delle attività con coordinate)
// Filtra (0,0): coordinata impossibile per l'Italia, indica geocoding fallito
function dayCenter(acts: { lat: number | null; lng: number | null }[]): { lat: number; lng: number } | null {
  const valid = acts.filter(a => a.lat != null && a.lng != null && (a.lat !== 0 || a.lng !== 0))
  if (!valid.length) return null
  return {
    lat: valid.reduce((s, a) => s + a.lat!, 0) / valid.length,
    lng: valid.reduce((s, a) => s + a.lng!, 0) / valid.length,
  }
}

export function TimelineHeader({ days, tripName, tripDestination }: Props) {
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

  // ── Km percorsi ───────────────────────────────────────────────
  // Strategia a due livelli:
  //  1. lat/lng sulle attività (dallo smart scheduling) — istantaneo
  //  2. Geocoding del titolo della tappa (Open-Meteo) — asincrono, con cache
  const [totalKm, setTotalKm] = useState(0)
  const geoCache = useRef<Map<string, { lat: number; lng: number } | null>>(new Map())
  // Ref per leggere tripDestination dentro useEffect senza aggiungerlo alle deps
  // (aggiungerlo cambierebbe la lunghezza dell'array tra render = errore React)
  const cityCtxRef = useRef('')
  cityCtxRef.current = useMemo(
    () => (tripDestination ? tripDestination.split(',')[0].trim() : ''),
    [tripDestination]
  )

  useEffect(() => {
    const cityCtx = cityCtxRef.current

    async function calcKm() {
      const completedDays = days
        .filter(d => d.date && d.date <= today)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

      if (completedDays.length < 2) { setTotalKm(0); return }

      // Risolvi coordinate per ogni tappa — seriale per rispettare il rate limit Nominatim (1 req/s)
      const centers: ({ lat: number; lng: number } | null)[] = []
      for (const d of completedDays) {
        // Priorità 1: media lat/lng dalle attività (smart scheduling)
        const fromActs = dayCenter(d.activities ?? [])
        if (fromActs) { centers.push(fromActs); continue }

        // Priorità 2: geocodifica titolo via Nominatim (free-form, gestisce quartieri)
        // Con contesto città: "Balduina, Roma" → quartiere corretto
        const query = cityCtx ? `${d.title.trim()}, ${cityCtx}` : d.title.trim()
        const key = query.toLowerCase()
        if (geoCache.current.has(key)) {
          centers.push(geoCache.current.get(key) ?? null)
          continue
        }

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
            { headers: { 'Accept-Language': 'it,en' }, signal: AbortSignal.timeout(5000) }
          )
          const data = await res.json()
          const r = data[0]
          const coords = r ? { lat: parseFloat(r.lat), lng: parseFloat(r.lon) } : null
          geoCache.current.set(key, coords)
          centers.push(coords)
          // Rispetta rate limit Nominatim: max 1 req/s
          await new Promise(r => setTimeout(r, 1100))
        } catch {
          geoCache.current.set(key, null)
          centers.push(null)
        }
      }

      // Somma distanze tra tappe consecutive con coordinate note
      let km = 0
      for (let i = 1; i < centers.length; i++) {
        const p = centers[i - 1]
        const c = centers[i]
        if (p && c) km += haversineKm(p.lat, p.lng, c.lat, c.lng)
      }
      setTotalKm(Math.round(km))
    }

    calcKm()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  // ── Tappa che contiene oggi (supporta multi-day)
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
          <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--md-surface-container, #EEECF8)" strokeWidth="7" />
          <circle
            cx="48" cy="48" r={radius}
            fill="none"
            stroke={progress >= 50 ? 'var(--md-primary, #7C3AED)' : 'var(--md-primary-container, #EDE9FE)'}
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
          <div className="tl-stat-divider" />
          <div className="tl-stat">
            <span className="tl-stat-value tl-stat-km">{totalKm}</span>
            <span className="tl-stat-label">km 🗺️</span>
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
        .tl-header { background: var(--md-surface, #FAFAFA); border-radius: var(--md-radius-xl, 24px); box-shadow: var(--md-elevation-1); padding: 1.25rem; display: flex; gap: 1rem; align-items: center; }
        .tl-ring-wrap { position: relative; flex-shrink: 0; width: 96px; height: 96px; }
        .tl-ring-inner { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
        .tl-ring-emoji { font-size: 1.25rem; line-height: 1; }
        .tl-ring-pct { font-size: 0.8125rem; font-weight: 700; color: var(--md-primary, #7C3AED); font-variant-numeric: tabular-nums; }
        .tl-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .tl-trip-name { font-size: 0.9375rem; font-weight: 700; color: var(--md-on-surface, #18181B); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tl-status-label { font-size: 0.8rem; color: var(--md-primary, #7C3AED); font-weight: 600; margin: 0; }
        .tl-stats { display: flex; align-items: center; gap: 10px; margin-top: 4px; flex-wrap: wrap; }
        .tl-stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .tl-stat-value { font-size: 1rem; font-weight: 700; color: var(--md-on-surface, #18181B); font-variant-numeric: tabular-nums; line-height: 1; }
        .tl-stat-km { color: var(--md-secondary, #D97706); }
        .tl-stat-label { font-size: 0.65rem; color: var(--md-on-surface-variant, #52525B); white-space: nowrap; }
        .tl-stat-divider { width: 1px; height: 24px; background: var(--md-outline-variant, #D4D4D8); }
        .tl-today-bar { display: flex; align-items: center; gap: 6px; margin-top: 6px; background: var(--md-surface-container-low, #F4F4F5); border-radius: var(--md-radius-m, 12px); padding: 5px 8px; }
        .tl-today-label { font-size: 0.7rem; color: var(--md-on-surface-variant, #52525B); font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .tl-today-track { flex: 1; height: 5px; background: var(--md-outline-variant, #D4D4D8); border-radius: 99px; overflow: hidden; }
        .tl-today-fill { height: 100%; background: var(--md-secondary, #D97706); border-radius: 99px; transition: width 0.4s ease; }
        .tl-today-pct { font-size: 0.7rem; font-weight: 700; color: var(--md-secondary, #D97706); font-variant-numeric: tabular-nums; min-width: 26px; text-align: right; }
      `}</style>
    </div>
  )
}
