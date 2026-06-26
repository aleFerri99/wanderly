// ============================================================
// enricher.ts — Agente 4: Enricher
// Primario:  OpenTripMap (categorie, rating ★, descrizione Wikipedia)
// Secondario: Geoapify geocoding (fallback se OTM non è configurato o fallisce)
// Sempre:    Overpass API per orari di apertura (nessuna chiave richiesta)
// ============================================================

import {
  fetchOTMPlace, mapOTMKinds,
  inferIndoorOutdoor, inferTypicalDuration, inferBestTimeOfDay,
} from './openTripMap'
import { fetchOpeningHours, parseOpeningHours } from './overpassApi'
import { SimpleCache } from './cache'

// ── Fallback Geoapify ─────────────────────────────────────────
// Fornisce categoria e coordinate quando OTM non è disponibile.
// Usa NEXT_PUBLIC_GEOAPIFY_KEY (disponibile anche server-side in Next.js).

const GEOAPIFY_CATEGORY_MAP: Record<string, string> = {
  'tourism.sights.museum':    'museum',
  'tourism.attraction':       'landmark',
  'tourism.sights':           'landmark',
  'catering.restaurant':      'restaurant',
  'catering.cafe':            'restaurant',
  'catering.bar':             'restaurant',
  'leisure.park':             'outdoor',
  'natural':                  'outdoor',
  'sport':                    'sport',
  'commercial.shopping':      'shopping',
  'commercial.supermarket':   'shopping',
}

function mapGeoapifyCategory(categories: string[]): string {
  for (const cat of categories) {
    for (const [key, val] of Object.entries(GEOAPIFY_CATEGORY_MAP)) {
      if (cat.startsWith(key)) return val
    }
  }
  return 'general'
}

interface GeoapifyPlace {
  name:       string
  category:   string
  address:    string
  lat:        number
  lon:        number
}

const geoCache = new SimpleCache<GeoapifyPlace>(120)

async function fetchGeoapifyPlace(
  name:        string,
  destination: string,
): Promise<GeoapifyPlace | null> {
  const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY
  if (!apiKey) return null

  const key    = SimpleCache.key('geo', name, destination)
  const cached = geoCache.get(key)
  if (cached) return cached

  try {
    const params = new URLSearchParams({
      text:   `${name} ${destination}`,
      limit:  '1',
      lang:   'it',
      apiKey,
    })
    const res = await fetch(
      `https://api.geoapify.com/v1/geocode/search?${params}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const f    = data.features?.[0]?.properties
    if (!f) return null

    const cats     = (f.categories ?? []) as string[]
    const category = mapGeoapifyCategory(cats)
    const result: GeoapifyPlace = {
      name:     f.name ?? name,
      category,
      address:  f.formatted ?? '',
      lat:      f.lat,
      lon:      f.lon,
    }
    geoCache.set(key, result)
    return result
  } catch {
    return null
  }
}

export interface EnrichedActivity {
  name:            string
  category:        string
  rating:          number              // 0–3 stelle OTM
  reviewCount:     number              // sempre 0 con OTM (mantenuto per compatibilità)
  priceLevel:      1 | 2 | 3 | 4 | null
  tags:            string[]            // kinds OTM
  indoorOutdoor:   'indoor' | 'outdoor' | 'both'
  typicalDuration: number
  bestTimeOfDay:   'morning' | 'afternoon' | 'evening' | 'any'
  address:         string
  lat?:            number
  lon?:            number
  description:     string              // Wikipedia via OTM
  openingHours:    Record<string, string | null> | null  // Overpass OSM
  popularity:      number              // 0–99 (rate×33)
}

export interface EnricherOutput {
  destination:        string
  enrichedActivities: EnrichedActivity[]
  fetchedAt:          string
  partial:            boolean
}

function makeFallback(name: string): EnrichedActivity {
  return {
    name, category: 'general', rating: 0, reviewCount: 0,
    priceLevel: null, tags: [], indoorOutdoor: 'both',
    typicalDuration: 60, bestTimeOfDay: 'any', address: '',
    description: '', openingHours: null, popularity: 0,
  }
}

async function enrichOne(
  name:        string,
  destination: string,
  otmApiKey:   string | null,
): Promise<EnrichedActivity> {
  // OTM (se disponibile) e Overpass sempre in parallelo
  const [otm, rawHours] = await Promise.all([
    otmApiKey ? fetchOTMPlace(name, destination, otmApiKey) : Promise.resolve(null),
    fetchOpeningHours(name, destination),
  ])

  // Geoapify come fallback: se OTM non ha trovato nulla
  const geo = (!otm && !otmApiKey) || (!otm && otmApiKey)
    ? await fetchGeoapifyPlace(name, destination)
    : null

  const category = otm
    ? mapOTMKinds(otm.kinds)
    : geo?.category ?? 'general'

  const source = otm ? 'otm' : geo ? 'geoapify' : 'none'
  if (source !== 'none') {
    console.log(`  [${source}] ${otm?.name ?? geo?.name ?? name}`)
  }

  return {
    name:            otm?.name ?? geo?.name ?? name,
    category,
    rating:          otm?.rate ?? 0,
    reviewCount:     0,
    priceLevel:      null,
    tags:            otm?.kinds ? otm.kinds.split(',').slice(0, 5) : [],
    indoorOutdoor:   inferIndoorOutdoor(category),
    typicalDuration: inferTypicalDuration(category),
    bestTimeOfDay:   inferBestTimeOfDay(category),
    address:         otm?.address ?? geo?.address ?? '',
    lat:             otm?.lat ?? geo?.lat,
    lon:             otm?.lon ?? geo?.lon,
    description:     otm?.description ?? '',
    openingHours:    parseOpeningHours(rawHours),
    popularity:      Math.round((otm?.rate ?? 0) * 33),
  }
}

// ── Agente Enricher principale ────────────────────────────────
export async function runEnricher(
  activityNames: string[],
  destination:   string,
): Promise<EnricherOutput> {
  if (!activityNames.length) {
    return { destination, enrichedActivities: [], fetchedAt: new Date().toISOString(), partial: false }
  }

  const otmKey  = process.env.OPENTRIPMAP_API_KEY ?? null
  const geoKey  = process.env.NEXT_PUBLIC_GEOAPIFY_KEY ?? null

  if (!otmKey && !geoKey) {
    console.warn('[Enricher] nessuna API key configurata (OTM o Geoapify)')
    return {
      destination,
      enrichedActivities: activityNames.map(makeFallback),
      fetchedAt: new Date().toISOString(),
      partial: true,
    }
  }

  const source = otmKey ? 'OpenTripMap' : 'Geoapify (fallback)'
  console.log(`[Enricher] avviato — "${destination}", ${activityNames.length} attività [${source}]`)

  const enrichedActivities: EnrichedActivity[] = []
  let partial = false

  for (const name of activityNames) {
    try {
      const result = await enrichOne(name, destination, otmKey)
      enrichedActivities.push(result)
      if (!result.address && result.rating === 0) partial = true
    } catch (e) {
      console.error(`  ✗ ${name}:`, (e as Error).message)
      enrichedActivities.push(makeFallback(name))
      partial = true
    }
    // Pausa rispetta rate limit OTM (~2-3 req/s); Geoapify è più generoso ma condivide il delay
    if (otmKey) await new Promise(r => setTimeout(r, 400))
  }

  const found = enrichedActivities.filter(a => a.rating > 0 || a.address).length
  console.log(`[Enricher] completato — trovate: ${found}/${activityNames.length}${partial ? ' (parziale)' : ''}`)

  return {
    destination,
    enrichedActivities,
    fetchedAt: new Date().toISOString(),
    partial,
  }
}

// ── buildEnricherContext — serializza l'output per il Planner ─
export function buildEnricherContext(enricher: EnricherOutput): string {
  const real = enricher.enrichedActivities.filter(a => a.rating > 0 || a.address)
  if (!real.length) return ''

  const todayKey = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()

  const lines = real.map(a => {
    const stars   = a.rating > 0
      ? `interesse ${'★'.repeat(a.rating)}${'☆'.repeat(3 - a.rating)}`
      : ''
    const hours   = a.openingHours?.[todayKey]
    const hoursStr = hours ? `orari oggi: ${hours}` : ''
    const desc    = a.description
      ? `nota: "${a.description.slice(0, 100)}…"`
      : ''
    const parts = [
      stars,
      `durata ~${a.typicalDuration}min`,
      a.bestTimeOfDay !== 'any'
        ? `consigliata di ${a.bestTimeOfDay === 'morning' ? 'mattina'
            : a.bestTimeOfDay === 'afternoon' ? 'pomeriggio' : 'sera'}`
        : '',
      `ambiente: ${a.indoorOutdoor === 'indoor' ? 'al chiuso'
        : a.indoorOutdoor === 'outdoor' ? "all'aperto" : 'misto'}`,
      hoursStr,
      desc,
    ].filter(Boolean).join(' | ')

    return `- ${a.name} [${a.category}]: ${parts}`
  })

  return `DATI REALI ATTIVITÀ (OpenTripMap + OpenStreetMap):
${lines.join('\n')}${enricher.partial ? '\n(nota: alcuni luoghi non trovati — usa il tuo giudizio)' : ''}`
}
