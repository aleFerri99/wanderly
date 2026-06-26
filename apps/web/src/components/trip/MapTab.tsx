'use client'

import { useEffect, useRef, useState } from 'react'
import { saveActivityCoords, saveDayCoords } from '@/app/trip/[id]/timeline/actions'
import type { DayWithActivities } from '@repo/shared/types/database'

interface Props {
  days:             DayWithActivities[]
  tripDestination:  string | null
}

type MapView = 'itinerary' | 'activities'
type Viewbox = [number, number, number, number]

// BBox Nominatim: [minLat, maxLat, minLon, maxLon]
interface BBox { minLat: number; maxLat: number; minLon: number; maxLon: number }

// ─────────────── helpers ────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function makeViewbox(lat: number, lon: number, spread = 1.2): Viewbox {
  return [lon - spread, lat - spread, lon + spread, lat + spread]
}

async function geocodeRaw(q: string, viewbox?: Viewbox | null): Promise<[number, number] | null> {
  try {
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`
    if (viewbox) url += `&viewbox=${viewbox.join(',')}&bounded=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'it,en' } })
    if (!res.ok) return null
    const data = await res.json()
    if (data[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
  } catch { /* ignora */ }
  return null
}

// Geocoding destinazione: restituisce coordinate + bounding box Nominatim
async function geocodeDestination(q: string): Promise<{ coords: [number, number]; bbox: BBox } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'it,en' } })
    if (!res.ok) return null
    const data = await res.json()
    if (!data[0]) return null
    const bb = data[0].boundingbox as [string, string, string, string] // [minlat, maxlat, minlon, maxlon]
    return {
      coords: [parseFloat(data[0].lat), parseFloat(data[0].lon)],
      bbox: { minLat: parseFloat(bb[0]), maxLat: parseFloat(bb[1]), minLon: parseFloat(bb[2]), maxLon: parseFloat(bb[3]) },
    }
  } catch { return null }
}

// Controlla se coordinate cadono dentro bbox espanso di un buffer
// Buffer adattivo: più grande per bbox piccole (città) per coprire la provincia,
// più piccolo per bbox grandi (nazioni) dove il perimetro è già accurato
function isWithinBBox(coords: [number, number], bbox: BBox): boolean {
  const size = Math.max(bbox.maxLat - bbox.minLat, bbox.maxLon - bbox.minLon)
  // Città/area piccola → buffer 1° (~110 km) per coprire comuni limitrofi e province
  // Nazione/area grande → buffer 0.5° per piccole imprecisioni di confine
  const buffer = size < 3 ? 1.0 : 0.5
  return coords[0] >= bbox.minLat - buffer &&
         coords[0] <= bbox.maxLat + buffer &&
         coords[1] >= bbox.minLon - buffer &&
         coords[1] <= bbox.maxLon + buffer
}

async function translateToEnglish(text: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=it|en`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return text
    const data = await res.json()
    const t: string | undefined = data?.responseData?.translatedText
    if (t && t.trim() && !t.toUpperCase().includes('MYMEMORY') && t.toLowerCase() !== text.toLowerCase())
      return t
  } catch { /* ignora */ }
  return text
}

// Geocoding attività con validazione contro il bbox della tappa di appartenenza.
// Nessun bounded=1 — la validazione avviene lato client tramite isWithinBBox.
async function geocodeActivity(
  baseQuery: string,
  tappTitle: string,
  filterBBox: BBox | null,
): Promise<[number, number] | null> {
  // Restituisce coords solo se dentro il bbox (o se nessun filtro disponibile)
  const check = (c: [number, number] | null): [number, number] | null =>
    !c || !filterBBox ? c : isWithinBBox(c, filterBBox) ? c : null

  await sleep(350)
  const r1 = check(await geocodeRaw(`${baseQuery}, ${tappTitle}`))
  if (r1) return r1

  const translated = await translateToEnglish(baseQuery)
  const isTranslated = translated.toLowerCase() !== baseQuery.toLowerCase()
  if (isTranslated) {
    await sleep(350)
    const r2 = check(await geocodeRaw(`${translated}, ${tappTitle}`))
    if (r2) return r2
  }

  await sleep(350)
  return check(await geocodeRaw(isTranslated ? translated : baseQuery))
}

// Geocoding tappa con filtro geografico sulla destinazione del viaggio.
// Flusso:
//  1. Cerca globalmente (no bounded) per trovare la città giusta
//  2. Se il risultato cade fuori dal bbox della destinazione → ritenta con
//     "${title}, ${destinationQuery}" per disambiguare (es. "Salisburgo, Austria")
//  3. Se ancora fuori → scarta (la tappa è probabilmente lontana dalla destinazione
//     e il match è falso positivo)
async function geocodeStage(
  title: string,
  destinationQuery: string | null,
  destinationBBox: BBox | null,
): Promise<[number, number] | null> {
  await sleep(300)

  async function tryWithFallback(query: string): Promise<[number, number] | null> {
    const r = await geocodeRaw(query)
    if (!r) return null
    // Nessun filtro se la destinazione non è nota
    if (!destinationBBox) return r
    if (isWithinBBox(r, destinationBBox)) return r
    // Fuori area → ritenta aggiungendo la destinazione come contesto
    if (destinationQuery) {
      await sleep(300)
      const rCtx = await geocodeRaw(`${query}, ${destinationQuery}`)
      if (rCtx && isWithinBBox(rCtx, destinationBBox)) return rCtx
    }
    return null
  }

  const r = await tryWithFallback(title)
  if (r) return r

  const t = await translateToEnglish(title)
  if (t !== title) { await sleep(300); return tryWithFallback(t) }
  return null
}

function leafletIconDefaults(L: { Icon: { Default: { prototype: Record<string, unknown>; mergeOptions: (o: Record<string, string>) => void } } }) {
  delete L.Icon.Default.prototype._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  })
}

// ─────────────── Categorie attività (C) ─────────────────────────
// Inferenza lato client dal titolo/luogo: zero API, zero colonne nuove.
const CATEGORY_STYLE: Record<string, { color: string; emoji: string; label: string }> = {
  museum:     { color: '#7C3AED', emoji: '🏛️', label: 'Cultura'       },
  restaurant: { color: '#D97706', emoji: '🍽️', label: 'Cibo'          },
  outdoor:    { color: '#0D9488', emoji: '🌳', label: 'Outdoor'       },
  landmark:   { color: '#2563EB', emoji: '📸', label: 'Monumento'     },
  shopping:   { color: '#DB2777', emoji: '🛍️', label: 'Shopping'      },
  nightlife:  { color: '#9333EA', emoji: '🍸', label: 'Vita notturna' },
  transport:  { color: '#6B7280', emoji: '🚆', label: 'Trasporto'     },
  general:    { color: '#1D9E75', emoji: '📍', label: 'Tappa'         },
}

function inferActivityCategory(title: string, location?: string | null): string {
  const t = `${title} ${location ?? ''}`.toLowerCase()
  if (/muse|galleri|mostra|pinacotec|\bart/.test(t))                                              return 'museum'
  if (/ristorant|cena|pranzo|trattoria|osteria|caff|\bbar\b|colazione|street food|mercat|gelat|pizzeri|cucina|brunch/.test(t)) return 'restaurant'
  if (/parc|giardin|spiagg|\bmare\b|lago|monta|trekking|escursion|natur|sentier|passeggiat|orto botanic/.test(t)) return 'outdoor'
  if (/castell|palazz|cattedral|chiesa|duomo|basilica|torre|ponte|piazza|monument|rovine|tempio|fortezz|abbazia/.test(t)) return 'landmark'
  if (/shopping|negoz|outlet|boutique|centro commerc/.test(t))                                    return 'shopping'
  if (/discotec|\blocale\b|cocktail|\bpub\b|vita nottur|\bclub\b/.test(t))                         return 'nightlife'
  if (/aeroport|stazion|\bvolo\b|\btreno\b|transfer|noleggi|\bbus\b|traghett|check-?in|check-?out/.test(t)) return 'transport'
  return 'general'
}

// ─────────────── Filtro attività "troppo generiche" ────────────
// Senza un nome proprio di luogo, geocodificare porta a match casuali
// (anche dall'altra parte del mondo). Queste attività NON vanno in mappa.
const GENERIC_PHRASES = [
  // frasi multiword (rimosse prima delle singole)
  'centro storico', 'centro città', 'tempo libero', 'giornata libera', 'serata libera',
  'pausa pranzo', 'pausa caffè', 'street food', 'vita notturna', 'cibo di strada',
  // pasti / attività vaghe
  'colazione', 'pranzo', 'cena', 'aperitivo', 'brunch', 'merenda', 'spuntino', 'pausa',
  'passeggiata', 'relax', 'riposo', 'shopping', 'giro', 'giretto', 'gita', 'escursione',
  'visita', 'partenza', 'arrivo', 'trasferimento', 'transfer', 'ritrovo', 'sosta', 'sveglia',
  'serata', 'mattinata', 'pomeriggio', 'nottata', 'notte', 'giornata',
  // categorie generiche senza nome proprio
  'ristorante', 'ristorantino', 'trattoria', 'osteria', 'pizzeria', 'tavola calda',
  'bar', 'caffè', 'caffetteria', 'pub', 'birreria', 'enoteca', 'mercatino', 'mercato',
  'museo', 'galleria', 'parco', 'giardino', 'spiaggia', 'negozio', 'negozi', 'hotel', 'albergo',
  'centro', 'quartiere', 'piazza', 'locale', 'cima', 'lungomare',
]
// Parole non significative: connettori + aggettivi generici
const NON_SIGNIFICANT = new Set([
  'al','allo','alla','ai','agli','alle','in','nel','nello','nella','nei','negli','nelle',
  'del','dello','della','dei','degli','delle','di','da','dal','con','per','presso','vicino',
  'a','e','o','il','lo','la','i','gli','le','un','uno','una',"un'",'su','sul','sulla','che',
  'tipico','tipica','tipici','tipiche','storico','storica','moderno','moderna','nuovo','nuova',
  'antico','antica','tradizionale','tradizionali','autentico','autentica','famoso','famosa',
  'rinomato','consigliato','locale','vero','vera','buono','buona','migliore','piccolo','grande',
])
// Attività "di percorso" (passeggiata/giro/tour che ATTRAVERSA qualcosa):
// itinerari lineari, non un punto → un singolo pin è sempre fuorviante.
// Solo connettori di TRAGITTO (lungo/attraverso/per/intorno) — NON "nel/sul"
// che invece indicano stare DENTRO un luogo specifico (es. "passeggiata nel Prater").
const ROUTE_PATTERN = /^\s*(passeggiat\w*|giro|giretto|tour|esplora\w*|camminat\w*|trekking|escursion\w*|gita)\b.*\b(lungo|attraverso|per|intorno|attorno|in giro)\b/i

function looksGeneric(raw: string, city?: string): boolean {
  if (ROUTE_PATTERN.test(raw)) return true   // "Passeggiata lungo il Danubio" → percorso, non punto
  let s = ` ${raw.toLowerCase()} `
  for (const p of GENERIC_PHRASES) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`(^|\\s)${esc}(?=\\s|$)`, 'g'), ' ')
  }
  // Il nome della città e il suo aggettivo (demonimo) NON sono "luoghi specifici":
  // es. "colazione in un caffè viennese" o "shopping nel centro di Vienna" sono generici.
  const cityName = (city ?? '').split(',')[0].trim().toLowerCase()
  const cityStem = cityName.replace(/[aeiou]+$/, '')   // "vienna" → "vienn" → cattura "viennese"

  const leftover = s.split(/[^a-zàèéìòùáíóúç']+/i)
    .filter(Boolean)
    .filter(w =>
      !NON_SIGNIFICANT.has(w) &&
      w.length >= 3 &&
      w !== cityName &&
      !(cityStem.length >= 4 && w.startsWith(cityStem))
    )
  // niente token "significativo" rimasto → troppo generica per la mappa
  return leftover.length === 0
}

// ─────────────── Pulizia query + geocoding POI (Geoapify) ──────
// Estrae il nome del luogo da una descrizione: toglie il verbo d'azione
// iniziale ("Visita al…", "Cena da…") e il suffisso "di/a <città>".
function cleanPlaceQuery(raw: string, city: string): string {
  let q = raw.trim()
  q = q.replace(
    /^(visita(?:re)?|vedere|tour|giro|esplora(?:re)?|scopri(?:re)?|pranzo|cena|colazione|aperitivo|brunch|merenda|passeggiata|relax|shopping|sosta|pausa|escursione|gita)\s+(?:guidat[ao]\s+)?(?:al|allo|alla|ai|agli|alle|a|da|del|della|dei|degli|delle|in|nel|nella|per|lungo|presso|il|lo|la|i|gli|le|un|uno|una)?\s*/i,
    '',
  )
  if (city) {
    const c = city.split(',')[0].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (c) q = q.replace(new RegExp(`[,\\s]+(?:di|a|in|presso|vicino a)\\s+${c}\\s*$`, 'i'), '')
  }
  return q.trim() || raw.trim()
}

// Geocoding via Geoapify autocomplete (POI-optimized, multilingua),
// vincolato al rettangolo della destinazione → niente match nel mondo sbagliato.
async function geocodeGeoapifyPlace(query: string, bbox: BBox | null): Promise<[number, number] | null> {
  const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY
  if (!apiKey || !query.trim()) return null
  const params = new URLSearchParams({ text: query, limit: '1', lang: 'it', apiKey })
  if (bbox) {
    const pad = 0.25
    params.set('filter', `rect:${bbox.minLon - pad},${bbox.minLat - pad},${bbox.maxLon + pad},${bbox.maxLat + pad}`)
    params.set('bias', `proximity:${(bbox.minLon + bbox.maxLon) / 2},${(bbox.minLat + bbox.maxLat) / 2}`)
  }
  try {
    const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const f = data.features?.[0]?.properties
    if (f && typeof f.lat === 'number' && typeof f.lon === 'number') return [f.lat, f.lon]
    return null
  } catch {
    return null
  }
}

// Geocoding della CITTÀ di una tappa (coords + bbox) via Geoapify — veloce,
// nessun rate limit. Serve a centrare, vincolare e validare le attività.
async function geocodeCityGeoapify(name: string): Promise<{ coords: [number, number]; bbox: BBox } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY
  if (!apiKey || !name.trim()) return null
  const params = new URLSearchParams({ text: name, type: 'city', limit: '1', lang: 'it', format: 'json', apiKey })
  try {
    const res = await fetch(`https://api.geoapify.com/v1/geocode/search?${params}`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const r = data.results?.[0]
    if (!r || typeof r.lat !== 'number' || typeof r.lon !== 'number') return null
    const bb = r.bbox as { lon1: number; lat1: number; lon2: number; lat2: number } | undefined
    const bbox: BBox = bb
      ? { minLat: Math.min(bb.lat1, bb.lat2), maxLat: Math.max(bb.lat1, bb.lat2), minLon: Math.min(bb.lon1, bb.lon2), maxLon: Math.max(bb.lon1, bb.lon2) }
      : { minLat: r.lat - 0.3, maxLat: r.lat + 0.3, minLon: r.lon - 0.3, maxLon: r.lon + 0.3 }
    return { coords: [r.lat, r.lon], bbox }
  } catch {
    return null
  }
}

// ─────────────── Routing — Geoapify (walk | drive) ─────────────
// Riusa NEXT_PUBLIC_GEOAPIFY_KEY. Restituisce geometria + distanza (m) + tempo (s).
async function fetchRoute(
  points: [number, number][],
  mode: 'walk' | 'drive' = 'walk',
): Promise<{ line: [number, number][]; distance: number; time: number } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY
  if (!apiKey || points.length < 2) return null
  const pts = points.slice(0, 30)
  const waypoints = pts.map(p => `${p[0]},${p[1]}`).join('|')
  try {
    const res = await fetch(
      `https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=${mode}&apiKey=${apiKey}`,
      { signal: AbortSignal.timeout(9000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const feat = data.features?.[0]
    if (!feat?.geometry) return null
    const line: [number, number][] = []
    const g = feat.geometry
    if (g.type === 'LineString') {
      for (const c of g.coordinates) line.push([c[1], c[0]])
    } else if (g.type === 'MultiLineString') {
      for (const seg of g.coordinates) for (const c of seg) line.push([c[1], c[0]])
    }
    const props = feat.properties ?? {}
    return { line, distance: props.distance ?? 0, time: props.time ?? 0 }
  } catch {
    return null
  }
}

// Distanza in km tra due coordinate (fallback se il routing non risponde)
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371, toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// Codice meteo WMO (Open-Meteo) → emoji
function wmoEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}

// Meteo della tappa per una data (solo se entro la finestra di previsione Open-Meteo)
async function fetchStageWeather(
  lat: number, lon: number, date: string,
): Promise<{ emoji: string; tmax: number; tmin: number } | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&start_date=${date}&end_date=${date}&timezone=auto`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    const d = data.daily
    if (!d?.weather_code?.length) return null
    return {
      emoji: wmoEmoji(d.weather_code[0]),
      tmax:  Math.round(d.temperature_2m_max[0]),
      tmin:  Math.round(d.temperature_2m_min[0]),
    }
  } catch {
    return null
  }
}

// ─────────────── MAPPA ITINERARIO ───────────────────────────────

function minsToHuman(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), mm = m % 60
  return mm ? `${h}h ${mm}min` : `${h}h`
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
}

interface StageInfo { coords: [number, number]; title: string; date: string | null }

function ItineraryMapView({ days, tripDestination }: Props) {
  const mapRef        = useRef<HTMLDivElement>(null)
  const mapInstRef    = useRef<unknown>(null)
  const stagesRef     = useRef<StageInfo[]>([])
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [loading,      setLoading]      = useState(true)
  const [found,        setFound]        = useState(0)
  const [total,        setTotal]        = useState(0)
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [playIdx,      setPlayIdx]      = useState(-1)
  const [driveKm,      setDriveKm]      = useState<number | null>(null)
  const [driveMins,    setDriveMins]    = useState(0)

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!mapRef.current) return
      setLoading(true); setFound(0); setIsPlaying(false); setPlayIdx(-1); setDriveKm(null); setDriveMins(0)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')).default as any
      await import('leaflet/dist/leaflet.css')
      if (cancelled) return
      leafletIconDefaults(L)

      const sorted = days.slice().sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date)
        return a.position - b.position
      })
      setTotal(sorted.length)

      // (Fondamenta) Risolvi le coordinate città di ogni tappa in parallelo:
      // dal DB se salvate, altrimenti Geoapify (riserva Nominatim) + persistenza.
      const resolved = await mapLimit(sorted, 4, async (day) => {
        if (day.lat != null && day.lng != null) {
          return { day, coords: [day.lat, day.lng] as [number, number] }
        }
        let coords: [number, number] | null = null
        const g = await geocodeCityGeoapify(day.title)
        if (g) coords = g.coords
        else { const c = await geocodeStage(day.title, tripDestination ?? null, null); if (c) coords = c }
        if (coords) saveDayCoords(day.trip_id, day.id, coords[0], coords[1]).catch(() => {})
        return { day, coords }
      })
      if (cancelled) return

      const stages = resolved.filter((s): s is { day: typeof s.day; coords: [number, number] } => s.coords != null)
      setFound(stages.length)

      const center: [number, number] = stages[0]?.coords ?? [41.9028, 12.4964]
      const map = L.map(mapRef.current).setView(center, 6)
      mapInstRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const today = new Date().toISOString().split('T')[0]

      // (Percorso auto) Tratte stradali tra tappe consecutive, in parallelo
      const legs = await mapLimit(
        stages.slice(1).map((s, i) => ({ from: stages[i].coords, to: s.coords, idx: i + 1 })),
        4,
        async ({ from, to, idx }) => {
          const r = await fetchRoute([from, to], 'drive')
          return { idx, route: r }
        },
      )
      if (cancelled) return

      let totalM = 0, totalS = 0
      const legByIdx = new Map<number, { km: number; mins: number }>()
      for (const { idx, route } of legs) {
        const from = stages[idx - 1].coords, to = stages[idx].coords
        const fut = stages[idx].day.date ? stages[idx].day.date! > today : false
        try {
          if (route && route.line.length) {
            L.polyline(route.line, fut
              ? { color: '#4A6FA5', weight: 3, opacity: 0.7, dashArray: '8 6' }
              : { color: '#1D9E75', weight: 4, opacity: 0.8 }).addTo(map)
            totalM += route.distance; totalS += route.time
            legByIdx.set(idx, { km: route.distance / 1000, mins: Math.round(route.time / 60) })
          } else {
            L.polyline([from, to], { color: '#9a9a94', weight: 2, opacity: 0.5, dashArray: '4 6' }).addTo(map)
            const km = haversineKm(from, to); totalM += km * 1000
            legByIdx.set(idx, { km, mins: 0 })
          }
        } catch { return }
      }

      // (Meteo) Previsione per ogni tappa, in parallelo (solo se entro finestra)
      const weather = await mapLimit(stages, 4, async (s) =>
        s.day.date ? await fetchStageWeather(s.coords[0], s.coords[1], s.day.date) : null,
      )
      if (cancelled) return

      // Marker + popup ricchi
      let todayIdx = -1
      for (let i = 0; i < stages.length; i++) {
        if (cancelled) break
        const { day, coords } = stages[i]
        const isPast  = day.date ? day.date < today : false
        const isToday = day.date === today || !!(day.date && day.date_end && today >= day.date && today <= day.date_end)
        if (isToday) todayIdx = i

        const bgColor = isToday ? '#1D9E75' : isPast ? '#5DCAA5' : '#4A6FA5'
        const label   = isPast ? '✓' : `${i + 1}`
        const size    = isToday ? 40 : 32
        const pulseHtml = isToday ? `
          <style>@keyframes itnPulse{0%,100%{box-shadow:0 0 0 0 rgba(29,158,117,.5)}50%{box-shadow:0 0 0 14px rgba(29,158,117,0)}}</style>
          <div style="position:absolute;inset:-6px;border-radius:50%;animation:itnPulse 1.8s infinite;pointer-events:none;"></div>` : ''
        const html = `<div style="position:relative;width:${size}px;height:${size}px;">
          ${pulseHtml}
          <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bgColor};color:#fff;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:${isToday ? 13 : 12}px;font-weight:700;font-family:system-ui;">${isToday ? '📍' : label}</div>
          ${isToday ? `<div style="position:absolute;top:-24px;left:50%;transform:translateX(-50%);background:#1D9E75;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;white-space:nowrap;font-family:system-ui;">Oggi</div>` : ''}
        </div>`
        const icon = L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -(size / 2 + 4)] })

        // Date / notti
        const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
        const hasRange = !!(day.date && day.date_end && day.date_end > day.date)
        const dateLabel = day.date ? (hasRange ? `${fmt(day.date)} – ${fmt(day.date_end!)}` : new Date(day.date + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })) : ''
        let nights: number | null = null
        if (day.date) {
          const dep = hasRange ? day.date_end! : (stages[i + 1]?.day.date ?? null)
          if (dep) { const n = daysBetween(day.date, dep); nights = n > 0 ? n : null }
        }

        const w = weather[i]
        const weatherLine = w ? `<div style="font-size:11px;color:#6b6b6b;margin-top:3px;">${w.emoji} ${w.tmax}° / ${w.tmin}°</div>` : ''
        const nightsLine  = nights ? `<div style="font-size:11px;color:#6b6b6b;margin-top:3px;">🌙 ${nights} ${nights === 1 ? 'notte' : 'notti'}</div>` : ''
        const actCount    = day.activities?.length ?? 0
        const actLine     = `<div style="font-size:11px;color:#6b6b6b;margin-top:3px;">📋 ${actCount} ${actCount === 1 ? 'attività' : 'attività'}</div>`
        const leg = legByIdx.get(i)
        const legLine = leg ? `<div style="font-size:11px;color:#4A6FA5;margin-top:5px;font-weight:600;">🚗 da ${stages[i - 1].day.title}: ${leg.km.toFixed(0)} km${leg.mins ? ` · ${minsToHuman(leg.mins)}` : ''}</div>` : ''

        try {
          L.marker(coords, { icon }).addTo(map).bindPopup(`
            <div style="font-family:system-ui;min-width:160px;">
              ${dateLabel ? `<div style="font-size:11px;color:#9a9a94;margin-bottom:2px;">${dateLabel}</div>` : ''}
              <div style="font-weight:600;font-size:13px;color:#1a1a1a;">${day.title}</div>
              ${weatherLine}${nightsLine}${actLine}${legLine}
            </div>`)
        } catch { break }
      }

      stagesRef.current = stages.map(s => ({ coords: s.coords, title: s.day.title, date: s.day.date ?? null }))

      if (cancelled) return
      setDriveKm(totalM > 0 ? totalM / 1000 : null)
      setDriveMins(Math.round(totalS / 60))

      try {
        if (todayIdx >= 0) map.flyTo(stages[todayIdx].coords, 12, { duration: 1.2 })
        else if (stages.length > 1) map.fitBounds(stages.map(s => s.coords), { padding: [48, 48] })
        else if (stages.length === 1) map.setView(stages[0].coords, 13)
      } catch { return }
      if (!cancelled) setLoading(false)
    }

    init()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
      if (mapInstRef.current) { (mapInstRef.current as { remove: () => void }).remove(); mapInstRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startPlay() {
    const stages = stagesRef.current
    const map = mapInstRef.current as { flyTo: (c: [number, number], z: number, o: object) => void; fitBounds: (b: [number, number][], o: object) => void } | null
    if (!stages.length || !map) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = map as any
    setIsPlaying(true)
    let idx = 0
    function step() {
      if (idx >= stages.length) {
        setIsPlaying(false); setPlayIdx(-1)
        if (stages.length > 1) m.fitBounds(stages.map((s: StageInfo) => s.coords), { padding: [48, 48] })
        return
      }
      setPlayIdx(idx)
      m.flyTo(stages[idx].coords, 15, { duration: 1.6 })
      idx++
      timerRef.current = setTimeout(step, 3200)
    }
    step()
  }

  function stopPlay() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setIsPlaying(false); setPlayIdx(-1)
    const stages = stagesRef.current
    const map = mapInstRef.current as { fitBounds: (b: [number, number][], o: object) => void; setView: (c: [number, number], z: number) => void } | null
    if (!map) return
    if (stages.length > 1) map.fitBounds(stages.map(s => s.coords), { padding: [48, 48] })
    else if (stages.length === 1) map.setView(stages[0].coords, 13)
  }

  return (
    <div className="map-wrap">
      <div className="map-container-wrap">
        {loading && (
          <div className="map-loading">
            <div className="map-spinner" />
            <span>{found > 0 ? `${found} tappe trovate…` : 'Calcolo itinerario…'}</span>
          </div>
        )}
        {/* Overlay animazione */}
        {isPlaying && playIdx >= 0 && stagesRef.current[playIdx] && (
          <div className="itn-play-overlay">
            <div className="itn-play-label">
              <span className="itn-play-num">{playIdx + 1} / {stagesRef.current.length}</span>
              <span className="itn-play-title">{stagesRef.current[playIdx].title}</span>
            </div>
          </div>
        )}
        <div ref={mapRef} className="map-container" />
      </div>

      {/* Controlli */}
      {!loading && (
        <div className="itn-controls">
          <button className="itn-play-btn" onClick={isPlaying ? stopPlay : startPlay} disabled={found === 0}>
            {isPlaying ? '⏹ Ferma' : '▶ Anima itinerario'}
          </button>
          <span className="itn-info">
            {found > 0 ? `${found} tappe` : ''}
            {driveKm != null && (
              <span className="itn-drive"> · 🚗 {driveKm.toFixed(0)} km{driveMins > 0 ? ` · ${minsToHuman(driveMins)}` : ''}</span>
            )}
            <span className="itn-legend">
              <span style={{ color: '#1D9E75', marginLeft: 8 }}>●</span> Passato
              <span style={{ color: '#4A6FA5', marginLeft: 8 }}>●</span> Futuro
            </span>
          </span>
        </div>
      )}

      <style jsx>{`
        .map-wrap { display:flex;flex-direction:column;gap:.75rem; }
        .map-container-wrap { position:relative;border-radius:16px;overflow:hidden;border:1px solid #e8e8e4; }
        .map-container { height:380px;width:100%; }
        .map-loading { position:absolute;inset:0;background:rgba(248,247,244,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;z-index:500;font-size:.875rem;color:#6b6b6b; }
        .map-spinner { width:24px;height:24px;border:3px solid #e8e8e4;border-top-color:#1D9E75;border-radius:50%;animation:spin .7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .itn-play-overlay { position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:600;pointer-events:none; }
        .itn-play-label { background:rgba(29,158,117,.92);color:#fff;border-radius:12px;padding:8px 16px;display:flex;flex-direction:column;align-items:center;gap:2px;backdrop-filter:blur(4px); }
        .itn-play-num { font-size:.7rem;font-weight:700;opacity:.85; }
        .itn-play-title { font-size:.9rem;font-weight:600; }
        .itn-controls { display:flex;align-items:center;gap:12px;flex-wrap:wrap; }
        .itn-play-btn { padding:7px 18px;background:#1D9E75;color:#fff;border:none;border-radius:10px;font-size:.85rem;font-weight:600;cursor:pointer;font-family:inherit;flex-shrink:0; }
        .itn-play-btn:disabled { opacity:.5;cursor:not-allowed; }
        .itn-info { font-size:.78rem;color:#9a9a94; }
        .itn-drive { color:#4A6FA5;font-weight:600; }
        .itn-legend { margin-left:4px; }
      `}</style>
    </div>
  )
}

// ─────────────── MAPPA ATTIVITÀ ─────────────────────────────────

// Esegue fn su items con al massimo `limit` chiamate in parallelo (mantiene l'ordine)
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const cur = idx++
      out[cur] = await fn(items[cur])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function dateChipLabel(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

function ActivitiesMapView({ days, tripDestination }: Props) {
  const mapRef      = useRef<HTMLDivElement>(null)
  const mapInstRef  = useRef<unknown>(null)
  const daysRef     = useRef(days)
  daysRef.current   = days

  const [selectedDate, setSelectedDate]    = useState<string | 'all'>('all')
  const [loading,       setLoading]        = useState(false)
  const [geocodedCount, setGeocodedCount]  = useState(0)
  const [activitiesCount, setActivitiesCount] = useState(0)
  const [genericSkipped,  setGenericSkipped]  = useState(0)
  const [routeInfo,     setRouteInfo]      = useState<{ km: number; mins: number } | null>(null)

  // Date di calendario disponibili (da activity_date, fallback alla data della tappa)
  const availableDates = [...new Set(
    days.flatMap(d => (d.activities ?? []).map(a => a.activity_date ?? d.date ?? '')).filter(Boolean)
  )].sort()

  useEffect(() => {
    let cancelled = false

    async function initMap() {
      if (!mapRef.current) return
      setLoading(true); setGeocodedCount(0); setGenericSkipped(0); setRouteInfo(null)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')).default as any
      await import('leaflet/dist/leaflet.css')
      if (cancelled) return
      leafletIconDefaults(L)

      const currentDays = daysRef.current

      // Filtra per GIORNATA di calendario (non per tappa)
      const activities = currentDays
        .flatMap(d => (d.activities ?? []).map(a => ({ ...a, dayTitle: d.title, effectiveDate: a.activity_date ?? d.date ?? '' })))
        .filter(a => selectedDate === 'all' || a.effectiveDate === selectedDate)
        .sort((a, b) => {
          if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate.localeCompare(b.effectiveDate)
          if (a.time_start && b.time_start) return a.time_start.localeCompare(b.time_start)
          return a.time_start ? -1 : b.time_start ? 1 : 0
        })
      setActivitiesCount(activities.length)

      // Geocodifica la CITTÀ di ogni tappa coinvolta (coords + bbox): serve a
      // centrare, vincolare la ricerca e VALIDARE le coordinate già salvate.
      const tappaTitles = [...new Set(activities.map(a => a.dayTitle).filter(Boolean))]
      const tappaInfo = new Map<string, { coords: [number, number]; bbox: BBox }>()
      await mapLimit(tappaTitles, 3, async (title) => {
        const g = (await geocodeCityGeoapify(title)) ?? (await geocodeDestination(title))
        if (g) tappaInfo.set(title, g)
      })
      if (cancelled) return

      // Center iniziale sulla città della tappa (fitBounds aggiusta dopo)
      let center: [number, number] = [41.9028, 12.4964]
      const firstTappa = tappaInfo.get(activities[0]?.dayTitle ?? '')
      if (firstTappa) center = firstTappa.coords
      else {
        const fs = activities.find(a => a.lat != null && a.lng != null)
        if (fs) center = [fs.lat!, fs.lng!]
      }

      const map = L.map(mapRef.current).setView(center, 13)
      mapInstRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // (A) Risolvi coordinate in parallelo (max 8). Le coordinate SALVATE vengono
      // validate contro la città della tappa: se fuori (geocodifica errata salvata
      // in passato) vengono rigeocodificate e sovrascritte.
      let skipped = 0
      const resolved = await mapLimit(activities, 8, async (act) => {
        const tappa    = tappaInfo.get(act.dayTitle) ?? null
        const bbox     = tappa?.bbox ?? null
        const original = act.location?.trim() || act.title
        const city     = (act.dayTitle || tripDestination || '').split(',')[0]

        // Generica → mai in mappa, anche se ha coordinate salvate da un vecchio match.
        // ROUTE_PATTERN viene testato sempre sul TITOLO (anche se original = location)
        // perché il titolo è dove compare "Passeggiata lungo…"
        if (ROUTE_PATTERN.test(act.title) || looksGeneric(original, city)) {
          skipped++; return { act, coords: null }
        }

        // Coordinate salvate valide (dentro la città della tappa)?
        if (act.lat != null && act.lng != null) {
          const c: [number, number] = [act.lat, act.lng]
          if (!bbox || isWithinBBox(c, bbox)) return { act, coords: c }
          // fuori dalla città → coordinate sbagliate, rigeocodifica sotto
        }

        const cleaned = cleanPlaceQuery(original, city)
        const query   = city ? `${cleaned}, ${city}` : cleaned   // città SEMPRE nella query

        let coords = await geocodeGeoapifyPlace(query, bbox)
        if (!coords) coords = await geocodeActivity(query, city, bbox)
        // accetta solo se dentro la città (quando conosciamo il bbox)
        if (coords && bbox && !isWithinBBox(coords, bbox)) coords = null
        if (coords) saveActivityCoords(act.trip_id, act.id, coords[0], coords[1]).catch(() => {})
        return { act, coords }
      })
      if (cancelled) return

      const bounds: [number, number][] = []
      let count = 0

      for (const { act, coords } of resolved) {
        if (cancelled) break   // ← guard: smette se la mappa è stata rimossa
        if (!coords) continue

        const cat   = inferActivityCategory(act.title, act.location)
        const style = CATEGORY_STYLE[cat] ?? CATEGORY_STYLE.general
        const icon  = L.divIcon({
          html: `<div style="background:${style.color};color:#fff;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);"><span style="transform:rotate(45deg)">${count + 1}</span></div>`,
          className: '', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -32],
        })

        const timeLabel = act.time_start ? `${act.time_start.slice(0, 5)} · ` : ''
        const durLabel  = act.duration_minutes ? `<div style="font-size:11px;color:#6b6b6b;margin-top:2px;">⏱️ ${act.duration_minutes} min</div>` : ''
        const locLabel  = act.location ? `<div style="font-size:11px;color:${style.color};margin-top:3px;">📍 ${act.location}</div>` : ''
        const notesLab  = act.notes ? `<div style="font-size:11px;color:#6b6b6b;margin-top:3px;max-width:200px;">${act.notes}</div>` : ''
        const mapsLink  = `<a href="https://www.google.com/maps/search/?api=1&query=${coords[0]},${coords[1]}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:11px;font-weight:600;color:${style.color};text-decoration:none;">Apri in Maps →</a>`

        try {
          L.marker(coords, { icon }).addTo(map).bindPopup(`
            <div style="font-family:system-ui;min-width:170px;">
              <div style="font-size:11px;color:#9a9a94;margin-bottom:2px;">${style.emoji} ${style.label} · ${act.dayTitle}</div>
              <div style="font-weight:600;font-size:13px;color:#1a1a1a;">${timeLabel}${act.title}</div>
              ${durLabel}${locLabel}${notesLab}${mapsLink}
            </div>`)
          bounds.push(coords); count++
        } catch { break }   // mappa rimossa durante il loop → esci silenziosamente
      }

      if (cancelled) return
      setGeocodedCount(count)
      setGenericSkipped(skipped)

      try {
        if (bounds.length > 1) map.fitBounds(bounds, { padding: [44, 44] })
        else if (bounds.length === 1) map.setView(bounds[0], 15)
      } catch { return }   // mappa già rimossa tra il check cancelled e fitBounds

      // (B) Percorso a piedi: solo quando è selezionata UNA giornata
      if (selectedDate !== 'all' && bounds.length >= 2) {
        const route = await fetchRoute(bounds, 'walk')
        if (cancelled) return
        try {
          if (route && route.line.length) {
            L.polyline(route.line, { color: '#7C3AED', weight: 4, opacity: 0.7 }).addTo(map)
            setRouteInfo({ km: route.distance / 1000, mins: Math.round(route.time / 60) })
          } else {
            L.polyline(bounds, { color: '#7C3AED', weight: 2.5, opacity: 0.5, dashArray: '6 6' }).addTo(map)
          }
        } catch { return }
      }

      if (!cancelled) setLoading(false)
    }

    initMap()
    return () => {
      cancelled = true
      if (mapInstRef.current) { (mapInstRef.current as { remove: () => void }).remove(); mapInstRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  return (
    <div className="map-wrap">
      {availableDates.length > 1 && (
        <div className="map-day-select">
          <button className={`map-day-btn ${selectedDate === 'all' ? 'map-day-active' : ''}`} onClick={() => setSelectedDate('all')}>
            Tutte le giornate
          </button>
          {availableDates.map(d => (
            <button key={d} className={`map-day-btn ${selectedDate === d ? 'map-day-active' : ''}`} onClick={() => setSelectedDate(d)}>
              {dateChipLabel(d)}
            </button>
          ))}
        </div>
      )}

      <div className="map-container-wrap">
        {loading && (
          <div className="map-loading">
            <div className="map-spinner" />
            <span>Caricamento attività…</span>
          </div>
        )}
        <div ref={mapRef} className="map-container" />
      </div>

      {!loading && activitiesCount > 0 && (
        <div className="map-info">
          {routeInfo ? (
            <span className="map-route">🚶 Percorso del giorno: <strong>{routeInfo.km.toFixed(1)} km</strong> · ~{routeInfo.mins} min a piedi</span>
          ) : selectedDate === 'all' && availableDates.length > 1 ? (
            <span className="map-hint">💡 Seleziona una giornata per vedere il percorso a piedi tra le attività</span>
          ) : null}
          <span>📍 {geocodedCount} di {activitiesCount} attività sulla mappa</span>
          {genericSkipped > 0 && (
            <span className="map-hint">
              {genericSkipped} {genericSkipped === 1 ? 'attività troppo generica' : 'attività troppo generiche'} (es. &quot;cena al ristorante&quot;): aggiungi un luogo specifico per vederla sulla mappa
            </span>
          )}
        </div>
      )}

      <style jsx>{`
        .map-wrap { display:flex;flex-direction:column;gap:.75rem; }
        .map-day-select { display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none; }
        .map-day-select::-webkit-scrollbar { display:none; }
        .map-day-btn { padding:5px 12px;border-radius:99px;border:1px solid #e0e0db;background:#fff;font-size:.8rem;font-weight:500;color:#6b6b6b;cursor:pointer;white-space:nowrap;transition:all .15s;flex-shrink:0; }
        .map-day-active { background:#1D9E75;border-color:#1D9E75;color:#fff; }
        .map-container-wrap { position:relative;border-radius:16px;overflow:hidden;border:1px solid #e8e8e4; }
        .map-container { height:360px;width:100%; }
        .map-loading { position:absolute;inset:0;background:rgba(248,247,244,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;z-index:500;font-size:.875rem;color:#6b6b6b; }
        .map-spinner { width:24px;height:24px;border:3px solid #e8e8e4;border-top-color:#1D9E75;border-radius:50%;animation:spin .7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .map-info { display:flex;flex-direction:column;gap:3px; }
        .map-info span { font-size:.8rem;color:#6b6b6b; }
        .map-route { color:#7C3AED !important;font-weight:500; }
        .map-route strong { color:#7C3AED; }
        .map-hint { font-size:.75rem;color:#9a9a94 !important; }
      `}</style>
    </div>
  )
}

// ─────────────── COMPONENTE ESPORTATO ───────────────────────────

export function MapTab({ days, tripDestination }: Props) {
  const [mapView, setMapView] = useState<MapView>('itinerary')

  return (
    <div className="maptab-root">
      {/* Toggle */}
      <div className="maptab-toggle">
        <button
          className={`maptab-tog-btn ${mapView === 'itinerary' ? 'maptab-tog-active' : ''}`}
          onClick={() => setMapView('itinerary')}
        >
          🗺️ Itinerario
        </button>
        <button
          className={`maptab-tog-btn ${mapView === 'activities' ? 'maptab-tog-active' : ''}`}
          onClick={() => setMapView('activities')}
        >
          📍 Attività
        </button>
      </div>

      {/* Render solo la mappa attiva — l'altra è smontata e pulita */}
      {mapView === 'itinerary'
        ? <ItineraryMapView  key="itinerary"  days={days} tripDestination={tripDestination} />
        : <ActivitiesMapView key="activities" days={days} tripDestination={tripDestination} />
      }

      <style jsx>{`
        .maptab-root   { display:flex;flex-direction:column;gap:.75rem; }
        .maptab-toggle { display:flex;background:#f0f0ec;border-radius:12px;padding:3px;gap:3px; }
        .maptab-tog-btn { flex:1;padding:8px 0;border:none;border-radius:9px;font-size:.85rem;font-weight:600;color:#6b6b6b;background:transparent;cursor:pointer;font-family:inherit;transition:all .15s; }
        .maptab-tog-active { background:#fff;color:#1a1a1a;box-shadow:0 1px 4px rgba(0,0,0,.1); }
      `}</style>
    </div>
  )
}
