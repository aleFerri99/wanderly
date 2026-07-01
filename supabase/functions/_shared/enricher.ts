// Edge port di packages/shared/supabase/enricher.ts (Agente 4: Enricher).
// Primario OpenTripMap (OPENTRIPMAP_API_KEY), fallback Geoapify (GEOAPIFY_KEY),
// orari via Overpass (no key). Env letti da Deno.env. Sync col sorgente web.
import {
  fetchOTMPlace, mapOTMKinds,
  inferIndoorOutdoor, inferTypicalDuration, inferBestTimeOfDay,
} from './openTripMap.ts'
import { fetchOpeningHours, parseOpeningHours } from './overpassApi.ts'
import { SimpleCache } from './cache.ts'

const GEOAPIFY_CATEGORY_MAP: Record<string, string> = {
  'tourism.sights.museum':  'museum',
  'tourism.attraction':     'landmark',
  'tourism.sights':         'landmark',
  'catering.restaurant':    'restaurant',
  'catering.cafe':          'restaurant',
  'catering.bar':           'restaurant',
  'leisure.park':           'outdoor',
  'natural':                'outdoor',
  'sport':                  'sport',
  'commercial.shopping':    'shopping',
  'commercial.supermarket': 'shopping',
}

function mapGeoapifyCategory(categories: string[]): string {
  for (const cat of categories) {
    for (const [key, val] of Object.entries(GEOAPIFY_CATEGORY_MAP)) {
      if (cat.startsWith(key)) return val
    }
  }
  return 'general'
}

interface GeoapifyPlace { name: string; category: string; address: string; lat: number; lon: number }

const geoCache = new SimpleCache<GeoapifyPlace>(120)

async function fetchGeoapifyPlace(name: string, destination: string): Promise<GeoapifyPlace | null> {
  const apiKey = Deno.env.get('GEOAPIFY_KEY')
  if (!apiKey) return null

  const key    = SimpleCache.key('geo', name, destination)
  const cached = geoCache.get(key)
  if (cached) return cached

  try {
    const params = new URLSearchParams({ text: `${name} ${destination}`, limit: '1', lang: 'it', apiKey })
    const res = await fetch(
      `https://api.geoapify.com/v1/geocode/search?${params}`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    const f    = data.features?.[0]?.properties
    if (!f) return null

    const cats     = (f.categories ?? []) as string[]
    const result: GeoapifyPlace = {
      name: f.name ?? name, category: mapGeoapifyCategory(cats),
      address: f.formatted ?? '', lat: f.lat, lon: f.lon,
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
  rating:          number
  reviewCount:     number
  priceLevel:      1 | 2 | 3 | 4 | null
  tags:            string[]
  indoorOutdoor:   'indoor' | 'outdoor' | 'both'
  typicalDuration: number
  bestTimeOfDay:   'morning' | 'afternoon' | 'evening' | 'any'
  address:         string
  lat?:            number
  lon?:            number
  description:     string
  openingHours:    Record<string, string | null> | null
  popularity:      number
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
  name: string, destination: string, otmApiKey: string | null,
): Promise<EnrichedActivity> {
  const [otm, rawHours] = await Promise.all([
    otmApiKey ? fetchOTMPlace(name, destination, otmApiKey) : Promise.resolve(null),
    fetchOpeningHours(name, destination),
  ])

  const geo = !otm ? await fetchGeoapifyPlace(name, destination) : null

  const category = otm ? mapOTMKinds(otm.kinds) : geo?.category ?? 'general'

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

export async function runEnricher(
  activityNames: string[], destination: string,
): Promise<EnricherOutput> {
  if (!activityNames.length) {
    return { destination, enrichedActivities: [], fetchedAt: new Date().toISOString(), partial: false }
  }

  const otmKey = Deno.env.get('OPENTRIPMAP_API_KEY') ?? null
  const geoKey = Deno.env.get('GEOAPIFY_KEY') ?? null

  if (!otmKey && !geoKey) {
    return {
      destination,
      enrichedActivities: activityNames.map(makeFallback),
      fetchedAt: new Date().toISOString(),
      partial: true,
    }
  }

  const enrichedActivities: EnrichedActivity[] = []
  let partial = false

  for (const name of activityNames) {
    try {
      const result = await enrichOne(name, destination, otmKey)
      enrichedActivities.push(result)
      if (!result.address && result.rating === 0) partial = true
    } catch {
      enrichedActivities.push(makeFallback(name))
      partial = true
    }
    if (otmKey) await new Promise(r => setTimeout(r, 400))
  }

  return { destination, enrichedActivities, fetchedAt: new Date().toISOString(), partial }
}

// Serializza l'output per il Planner (identico al web).
export function buildEnricherContext(enricher: EnricherOutput): string {
  const real = enricher.enrichedActivities.filter(a => a.rating > 0 || a.address)
  if (!real.length) return ''

  const todayKey = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()

  const lines = real.map(a => {
    const stars = a.rating > 0 ? `interesse ${'★'.repeat(a.rating)}${'☆'.repeat(3 - a.rating)}` : ''
    const hours = a.openingHours?.[todayKey]
    const hoursStr = hours ? `orari oggi: ${hours}` : ''
    const desc = a.description ? `nota: "${a.description.slice(0, 100)}…"` : ''
    const parts = [
      stars,
      `durata ~${a.typicalDuration}min`,
      a.bestTimeOfDay !== 'any'
        ? `consigliata di ${a.bestTimeOfDay === 'morning' ? 'mattina' : a.bestTimeOfDay === 'afternoon' ? 'pomeriggio' : 'sera'}`
        : '',
      `ambiente: ${a.indoorOutdoor === 'indoor' ? 'al chiuso' : a.indoorOutdoor === 'outdoor' ? "all'aperto" : 'misto'}`,
      hoursStr,
      desc,
    ].filter(Boolean).join(' | ')

    return `- ${a.name} [${a.category}]: ${parts}`
  })

  return `DATI REALI ATTIVITÀ (OpenTripMap + OpenStreetMap):
${lines.join('\n')}${enricher.partial ? '\n(nota: alcuni luoghi non trovati — usa il tuo giudizio)' : ''}`
}
