// ============================================================
// openTripMap.ts — Fetch dati turistici da OpenTripMap
// Free tier: 5.000 req/giorno, caching permesso.
// 3 chiamate sequenziali per attività: geoname → autosuggest → xid
// Le coordinate della destinazione sono cachate (stesse per tutte le attività).
// ============================================================

import { SimpleCache } from './cache'

export interface OTMPlace {
  xid:         string
  name:        string
  kinds:       string   // categorie separate da virgola es. "museums,cultural"
  rate:        number   // 0–3 stelle di interesse turistico
  description: string   // da Wikipedia, può essere vuota
  lat:         number
  lon:         number
  address:     string
}

// Cache per evitare chiamate ripetute nella stessa sessione server
const placeCache  = new SimpleCache<OTMPlace>(120)      // 2 ore
const coordsCache = new SimpleCache<{ lat: number; lon: number }>(240) // 4 ore

// ── Mappa kinds OTM → categoria interna Wanderly ─────────────
export function mapOTMKinds(kinds: string): string {
  const k = kinds.toLowerCase()
  if (k.includes('museum'))                                return 'museum'
  if (k.includes('historic') || k.includes('heritage'))   return 'landmark'
  if (k.includes('architecture') || k.includes('religion')) return 'landmark'
  if (k.includes('natural') || k.includes('park'))        return 'outdoor'
  if (k.includes('restaurants') || k.includes('food'))    return 'restaurant'
  if (k.includes('sport'))                                 return 'sport'
  if (k.includes('shop') || k.includes('market'))         return 'shopping'
  return 'general'
}

export function inferIndoorOutdoor(category: string): 'indoor' | 'outdoor' | 'both' {
  if (['museum', 'restaurant', 'shopping'].includes(category)) return 'indoor'
  if (['outdoor', 'sport'].includes(category))                 return 'outdoor'
  return 'both'
}

export function inferTypicalDuration(category: string): number {
  const map: Record<string, number> = {
    museum: 120, landmark: 60, outdoor: 180,
    restaurant: 90, sport: 120, shopping: 90, general: 60,
  }
  return map[category] ?? 60
}

export function inferBestTimeOfDay(category: string): 'morning' | 'afternoon' | 'evening' | 'any' {
  if (category === 'restaurant') return 'evening'
  if (category === 'outdoor')    return 'morning'
  if (category === 'museum')     return 'morning'
  return 'any'
}

// ── Step 1: coordinate della destinazione (cachate) ──────────
async function getDestinationCoords(
  destination: string,
  apiKey:      string,
): Promise<{ lat: number; lon: number } | null> {
  const key    = SimpleCache.key('geoname', destination)
  const cached = coordsCache.get(key)
  if (cached) return cached

  const res = await fetch(
    `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(destination)}&apikey=${apiKey}`,
    { signal: AbortSignal.timeout(6000) }
  )
  if (!res.ok) return null
  const geo = await res.json()
  if (!geo.lat || !geo.lon) return null

  const coords = { lat: Number(geo.lat), lon: Number(geo.lon) }
  coordsCache.set(key, coords)
  return coords
}

// ── Fetch completo per una singola attività ───────────────────
export async function fetchOTMPlace(
  activityName: string,
  destination:  string,
  apiKey:       string,
): Promise<OTMPlace | null> {
  const cacheKey = SimpleCache.key(activityName, destination)
  const cached   = placeCache.get(cacheKey)
  if (cached) return cached

  try {
    // Step 1: coordinate destinazione
    const coords = await getDestinationCoords(destination, apiKey)
    if (!coords) return null

    // Step 2: cerca il posto per nome vicino alle coordinate
    const searchRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/autosuggest` +
      `?name=${encodeURIComponent(activityName)}` +
      `&lat=${coords.lat}&lon=${coords.lon}&radius=15000` +
      `&limit=1&format=json&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const xid        = searchData?.features?.[0]?.properties?.xid
    if (!xid) return null

    // Step 3: dettagli completi inclusa descrizione Wikipedia
    const detailRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/xid/${xid}?apikey=${apiKey}`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!detailRes.ok) return null
    const d = await detailRes.json()

    const result: OTMPlace = {
      xid,
      name:        d.name ?? activityName,
      kinds:       d.kinds ?? '',
      rate:        typeof d.rate === 'number' ? d.rate : 0,
      description: d.wikipedia_extracts?.text ?? '',
      lat:         d.point?.lat ?? coords.lat,
      lon:         d.point?.lon ?? coords.lon,
      address:     [d.address?.road, d.address?.house_number, d.address?.city]
                     .filter(Boolean).join(', '),
    }

    placeCache.set(cacheKey, result)
    return result
  } catch {
    return null
  }
}
