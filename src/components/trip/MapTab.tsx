// ============================================================
// src/components/trip/MapTab.tsx
// Mappa con Leaflet — geocoding via Nominatim
// Strategia: usa activity.location se presente,
//            altrimenti activity.title + day.title (la città)
// ============================================================
'use client'

import { useEffect, useRef, useState } from 'react'
import type { DayWithActivities } from '@/types/database'

interface Props {
  days: DayWithActivities[]
  tripDestination: string | null
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function geocodeRaw(q: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
      { headers: { 'Accept-Language': 'it,en' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
  } catch { /* ignora */ }
  return null
}

// Traduce da italiano a inglese via MyMemory (gratuito, no API key)
// OSM indicizza i luoghi in lingua locale/inglese, non in italiano,
// quindi la traduzione aumenta drasticamente i match
async function translateToEnglish(text: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=it|en`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return text
    const data = await res.json()
    const translated: string | undefined = data?.responseData?.translatedText
    if (
      translated &&
      translated.trim() &&
      !translated.toUpperCase().includes('MYMEMORY') &&
      translated.toLowerCase() !== text.toLowerCase()
    ) {
      return translated
    }
  } catch { /* ignora: usa testo originale */ }
  return text
}

// Flusso geocoding per un'attività:
// 1. Prova originale + città  →  copre nomi locali/inglesi già corretti (es. "Bến Thành Market")
// 2. Se fallisce: traduce it→en (MyMemory) e riprova  →  copre nomi italiani (es. "Museo dei Resti della Guerra")
// 3. Se ancora fallisce: prova il testo migliore senza città come ultimo tentativo
async function geocodeActivity(baseQuery: string, city: string): Promise<[number, number] | null> {
  // Tentativo 1: originale + città
  await sleep(350)
  const r1 = await geocodeRaw(`${baseQuery}, ${city}`)
  if (r1) return r1

  // Tentativo 2: traduzione it→en + città (solo se produce un testo diverso)
  const translated = await translateToEnglish(baseQuery)
  const isTranslated = translated.toLowerCase() !== baseQuery.toLowerCase()

  if (isTranslated) {
    await sleep(350)
    const r2 = await geocodeRaw(`${translated}, ${city}`)
    if (r2) return r2
  }

  // Tentativo 3: senza città (usa il testo migliore disponibile)
  await sleep(350)
  return await geocodeRaw(isTranslated ? translated : baseQuery)
}

export function MapTab({ days, tripDestination }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<unknown>(null)
  const daysRef = useRef(days)
  daysRef.current = days

  const [selectedDayId, setSelectedDayId] = useState<string | 'all'>('all')
  const [loading, setLoading] = useState(false)
  const [geocodedCount, setGeocodedCount] = useState(0)
  const [activitiesCount, setActivitiesCount] = useState(0)

  function handleSelectDay(id: string | 'all') {
    // Rimuove la mappa corrente — il cleanup dell'effect la deallocherà
    setSelectedDayId(id)
  }

  useEffect(() => {
    let cancelled = false

    async function initMap() {
      if (!mapRef.current) return

      setLoading(true)
      setGeocodedCount(0)

      // Importa Leaflet solo lato client
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (cancelled) return

      // Fix icone default Leaflet (problema webpack)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      // Legge i days aggiornati tramite ref per evitare stale closure
      const currentDays = daysRef.current
      const visibleDays = selectedDayId === 'all'
        ? currentDays
        : currentDays.filter(d => d.id === selectedDayId)

      // Centro: titolo del giorno selezionato (= città) o tripDestination come fallback
      const selectedDay = currentDays.find(d => d.id === selectedDayId)
      const centerQuery = selectedDay?.title ?? tripDestination
      let center: [number, number] = [41.9028, 12.4964] // Roma come ultimo fallback
      if (centerQuery) {
        const coords = await geocodeRaw(centerQuery)
        if (!cancelled && coords) center = coords
      }

      if (cancelled) return

      const map = L.map(mapRef.current).setView(center, 13)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }).addTo(map as any)

      // Raccoglie le attività con il titolo del loro giorno (= città)
      // e le ordina cronologicamente: data effettiva → orario (null in coda)
      const activities = visibleDays
        .flatMap(d =>
          (d.activities ?? []).map(a => ({
            ...a,
            dayTitle: d.title,
            effectiveDate: a.activity_date ?? d.date ?? '',
          }))
        )
        .sort((a, b) => {
          if (a.effectiveDate !== b.effectiveDate)
            return a.effectiveDate.localeCompare(b.effectiveDate)
          if (a.time_start && b.time_start)
            return a.time_start.localeCompare(b.time_start)
          if (a.time_start) return -1
          if (b.time_start) return 1
          return 0
        })
      setActivitiesCount(activities.length)

      const bounds: [number, number][] = []
      let count = 0

      for (const act of activities) {
        if (cancelled) break

        // Strategia geocoding:
        // 1. Se c'è location esplicita → usa quella; altrimenti → titolo attività
        // 2. Traduce automaticamente it→en (MyMemory) prima della query Nominatim
        // 3. Prova con città, poi senza città come fallback
        const baseQuery = act.location?.trim() || act.title
        const coords = await geocodeActivity(baseQuery, act.dayTitle)
        if (cancelled) break

        if (!coords) continue

        const icon = L.divIcon({
          html: `<div style="
            background:#1D9E75;color:#fff;
            width:28px;height:28px;
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            display:flex;align-items:center;justify-content:center;
            font-size:11px;font-weight:700;
            border:2px solid #fff;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);
          "><span style="transform:rotate(45deg)">${count + 1}</span></div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -30],
        })

        const timeLabel     = act.time_start ? `${act.time_start.slice(0, 5)} · ` : ''
        const locationLabel = act.location
          ? `<div style="font-size:11px;color:#1D9E75;margin-top:3px;">📍 ${act.location}</div>`
          : ''
        const notesLabel    = act.notes
          ? `<div style="font-size:11px;color:#6b6b6b;margin-top:3px;max-width:200px;">${act.notes}</div>`
          : ''

        L.marker(coords, { icon })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .addTo(map as any)
          .bindPopup(`
            <div style="font-family:system-ui;min-width:160px;">
              <div style="font-size:11px;color:#9a9a94;margin-bottom:2px;">${act.dayTitle}</div>
              <div style="font-weight:600;font-size:13px;color:#1a1a1a;">${timeLabel}${act.title}</div>
              ${locationLabel}
              ${notesLabel}
            </div>
          `)

        bounds.push(coords)
        count++
        setGeocodedCount(count)
      }

      // Adatta i bounds se ci sono più marker
      if (!cancelled && bounds.length > 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(map as any).fitBounds(bounds, { padding: [40, 40] })
      }

      if (!cancelled) setLoading(false)
    }

    initMap()

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapInstanceRef.current as any).remove()
        mapInstanceRef.current = null
      }
    }
  // selectedDayId è l'unico trigger; days arriva via daysRef per evitare re-init a ogni update realtime
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayId])

  return (
    <div className="map-wrap">
      {/* Filtro per giorno */}
      {days.length > 1 && (
        <div className="map-day-select">
          <button
            className={`map-day-btn ${selectedDayId === 'all' ? 'map-day-active' : ''}`}
            onClick={() => handleSelectDay('all')}
          >
            Tutto il viaggio
          </button>
          {days.map(d => (
            <button
              key={d.id}
              className={`map-day-btn ${selectedDayId === d.id ? 'map-day-active' : ''}`}
              onClick={() => handleSelectDay(d.id)}
            >
              {d.title || `Tappa ${d.position + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Mappa */}
      <div className="map-container-wrap">
        {loading && (
          <div className="map-loading">
            <div className="map-spinner" />
            <span>
              {geocodedCount > 0
                ? `${geocodedCount} attività trovate…`
                : 'Caricamento mappa…'}
            </span>
          </div>
        )}
        <div ref={mapRef} className="map-container" />
      </div>

      {/* Info */}
      {!loading && activitiesCount > 0 && (
        <div className="map-info">
          <span>📍 {geocodedCount} di {activitiesCount} attività sulla mappa</span>
          {geocodedCount < activitiesCount && (
            <span className="map-hint">
              Aggiungi un campo &quot;Luogo&quot; alle attività per migliorare i risultati
            </span>
          )}
        </div>
      )}

      <style jsx>{`
        .map-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
        .map-day-select { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .map-day-select::-webkit-scrollbar { display: none; }
        .map-day-btn { padding: 5px 12px; border-radius: 99px; border: 1px solid #e0e0db; background: #fff; font-size: 0.8rem; font-weight: 500; color: #6b6b6b; cursor: pointer; white-space: nowrap; transition: all 0.15s; flex-shrink: 0; }
        .map-day-active { background: #1D9E75; border-color: #1D9E75; color: #fff; }
        .map-container-wrap { position: relative; border-radius: 16px; overflow: hidden; border: 1px solid #e8e8e4; }
        .map-container { height: 360px; width: 100%; }
        .map-loading { position: absolute; inset: 0; background: rgba(248,247,244,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; z-index: 500; font-size: 0.875rem; color: #6b6b6b; }
        .map-spinner { width: 24px; height: 24px; border: 3px solid #e8e8e4; border-top-color: #1D9E75; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .map-info { display: flex; flex-direction: column; gap: 2px; }
        .map-info span { font-size: 0.8rem; color: #6b6b6b; }
        .map-hint { font-size: 0.75rem; color: #9a9a94; }
        @media (prefers-reduced-motion: reduce) { .map-spinner { animation: none; } }
      `}</style>
    </div>
  )
}
