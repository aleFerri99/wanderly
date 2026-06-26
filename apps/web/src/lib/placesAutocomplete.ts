// ============================================================
// lib/placesAutocomplete.ts
// Autocomplete luoghi per il form attività.
// Usa Geoapify Geocoding Autocomplete API se la chiave è configurata,
// altrimenti fallback a Nominatim (nessuna chiave richiesta).
// ============================================================

export interface PlaceSuggestion {
  placeId:  string
  name:     string    // nome principale, es. "Colosseo"
  address:  string    // indirizzo completo formattato
  city:     string    // città del viaggio
  lat?:     number
  lng?:     number
}

// Tipo interno per la risposta Geoapify
interface GeoapifyResult {
  place_id?:      string
  name?:          string
  formatted?:     string
  address_line1?: string
  address_line2?: string
  lat:            number
  lon:            number
}

// ── Geoapify Geocoding Autocomplete ──────────────────────────

async function geoapifyAutocomplete(query: string, destination: string): Promise<PlaceSuggestion[]> {
  const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY
  if (!apiKey) return []

  try {
    const params = new URLSearchParams({
      text:   `${query} ${destination}`,
      format: 'json',
      limit:  '5',
      lang:   'it',
      type:   'amenity',
      apiKey,
    })
    const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    if (!data.results?.length) return []

    return (data.results as GeoapifyResult[]).map(r => ({
      placeId: r.place_id ?? `${r.lat}-${r.lon}`,
      name:    r.name ?? r.address_line1 ?? r.formatted ?? query,
      address: r.formatted ?? r.address_line2 ?? '',
      city:    destination,
      lat:     r.lat,
      lng:     r.lon,
    }))
  } catch {
    return []
  }
}

async function geoapifyDetails(placeId: string): Promise<Partial<PlaceSuggestion>> {
  const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY
  if (!apiKey) return {}

  try {
    const res = await fetch(
      `https://api.geoapify.com/v2/place-details?id=${encodeURIComponent(placeId)}&apiKey=${apiKey}`
    )
    if (!res.ok) return {}
    const data = await res.json()
    const f = data.features?.[0]?.properties
    if (!f) return {}
    return {
      name:    f.name,
      address: f.formatted,
      lat:     f.lat,
      lng:     f.lon,
    }
  } catch {
    return {}
  }
}

// ── Nominatim fallback ────────────────────────────────────────

let _lastCall = 0
async function nominatimFetch(q: string): Promise<PlaceSuggestion[]> {
  const now = Date.now()
  const wait = 1100 - (now - _lastCall)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  _lastCall = Date.now()

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,
      { headers: { 'Accept-Language': 'it,en' } }
    )
    if (!res.ok) return []
    const data = await res.json() as Array<{
      place_id: number; display_name: string; lat: string; lon: string
    }>
    return data.map(r => {
      const parts   = r.display_name.split(',')
      const name    = parts[0].trim()
      const address = parts.slice(1, 4).join(',').trim()
      return {
        placeId: String(r.place_id),
        name,
        address,
        city:    '',
        lat:     parseFloat(r.lat),
        lng:     parseFloat(r.lon),
      }
    })
  } catch {
    return []
  }
}

// ── API pubblica ──────────────────────────────────────────────

export async function fetchPlaceSuggestions(
  query:       string,
  destination: string,
): Promise<PlaceSuggestion[]> {
  if (!query || query.length < 2) return []
  const key = process.env.NEXT_PUBLIC_GEOAPIFY_KEY
  if (key) return geoapifyAutocomplete(query, destination)
  return nominatimFetch(`${query} ${destination}`)
}

// Con Geoapify lat/lng sono già presenti nel suggestion — fetchPlaceDetails
// è un arricchimento opzionale. Se il fallback ha già le coordinate, ritorna subito.
export async function fetchPlaceDetails(
  placeId:  string,
  existing?: Partial<PlaceSuggestion>,
): Promise<Partial<PlaceSuggestion>> {
  if (existing?.lat && existing?.lng) return existing
  const key = process.env.NEXT_PUBLIC_GEOAPIFY_KEY
  if (key) return geoapifyDetails(placeId)
  return existing ?? {}
}
