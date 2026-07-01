// queries/places.ts — CLIENT-SAFE. Autocomplete luoghi per il form attività.
// Geoapify se la chiave è passata, altrimenti fallback Nominatim (no chiave).
// La chiave va passata dal chiamante: web NEXT_PUBLIC_GEOAPIFY_KEY, mobile EXPO_PUBLIC_GEOAPIFY_KEY.

export interface PlaceSuggestion {
  placeId: string
  name:    string
  address: string
  lat?:    number
  lng?:    number
}

interface GeoapifyResult {
  place_id?: string; name?: string; formatted?: string
  address_line1?: string; address_line2?: string; lat: number; lon: number
}

async function geoapifyRun(query: string, destination: string, apiKey: string, type?: string | null): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    text: `${query} ${destination}`.trim(), format: 'json', limit: '6', lang: 'it', apiKey,
  })
  if (type) params.set('type', type)   // 'amenity' = solo POI; 'city' = località; omesso = tutto
  const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  if (!data.results?.length) return []
  return (data.results as GeoapifyResult[]).map(r => ({
    placeId: r.place_id ?? `${r.lat}-${r.lon}`,
    name:    r.name ?? r.address_line1 ?? r.formatted ?? query,
    address: r.formatted ?? r.address_line2 ?? '',
    lat:     r.lat,
    lng:     r.lon,
  }))
}

async function geoapify(query: string, destination: string, apiKey: string, type?: string | null): Promise<PlaceSuggestion[]> {
  try {
    const out = await geoapifyRun(query, destination, apiKey, type)
    // Ibrido: se il tipo filtrato (es. 'city') non trova nulla, riprova senza filtro
    // così i quartieri/luoghi (es. "Balduina") vengono comunque trovati.
    if (out.length === 0 && type) return await geoapifyRun(query, destination, apiKey, null)
    return out
  } catch { return [] }
}

let _last = 0
async function nominatim(query: string, destination: string): Promise<PlaceSuggestion[]> {
  const wait = 1100 - (Date.now() - _last)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  _last = Date.now()
  try {
    const q = `${query} ${destination}`.trim()
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,
      { headers: { 'Accept-Language': 'it,en' } },
    )
    if (!res.ok) return []
    const data = await res.json() as Array<{ place_id: number; display_name: string; lat: string; lon: string }>
    return data.map(r => {
      const parts = r.display_name.split(',')
      return {
        placeId: String(r.place_id),
        name:    parts[0].trim(),
        address: parts.slice(1, 4).join(',').trim(),
        lat:     parseFloat(r.lat),
        lng:     parseFloat(r.lon),
      }
    })
  } catch { return [] }
}

export async function fetchPlaceSuggestions(
  query: string, destination: string, apiKey?: string | null,
  type: string | null = 'amenity',   // 'amenity' per attività; null = ampia (città/quartieri) per tappe
): Promise<PlaceSuggestion[]> {
  if (!query || query.trim().length < 2) return []
  return apiKey ? geoapify(query, destination, apiKey, type) : nominatim(query, destination)
}
