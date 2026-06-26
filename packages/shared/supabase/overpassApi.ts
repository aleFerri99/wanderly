// ============================================================
// overpassApi.ts — Orari di apertura da Overpass (OpenStreetMap)
// Nessuna API key richiesta. Timeout 10s per query complesse.
// ============================================================

import { SimpleCache } from './cache'

const hoursCache = new SimpleCache<string | null>(240) // 4 ore

// ── Fetch orari di apertura ───────────────────────────────────
export async function fetchOpeningHours(
  placeName:   string,
  destination: string,
): Promise<string | null> {
  const key    = SimpleCache.key(placeName, destination)
  const cached = hoursCache.get(key)
  if (cached !== null) return cached   // null è un valore valido ("non trovato")

  // Sfugge i caratteri speciali per Overpass QL
  const safeName = placeName.replace(/"/g, '\\"').replace(/\\/g, '\\\\')
  const safeDest = destination.split(',')[0].trim().replace(/"/g, '\\"')

  const query = `
[out:json][timeout:10];
area[name~"${safeDest}",i][place~"city|town|village"]->.a;
(
  node["name"~"${safeName}",i]["opening_hours"](area.a);
  way["name"~"${safeName}",i]["opening_hours"](area.a);
);
out tags 1;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
      signal:  AbortSignal.timeout(12000),
    })
    if (!res.ok) { hoursCache.set(key, null); return null }

    const data  = await res.json()
    const hours = (data?.elements?.[0]?.tags?.opening_hours as string) ?? null
    hoursCache.set(key, hours)
    return hours
  } catch {
    hoursCache.set(key, null)
    return null
  }
}

// ── Parser formato OSM opening_hours ─────────────────────────
// es. "Mo-Fr 09:00-18:00; Sa 10:00-14:00"
// → { monday: "09:00-18:00", ..., saturday: "10:00-14:00", sunday: null }
export function parseOpeningHours(raw: string | null): Record<string, string | null> {
  const days: Record<string, string | null> = {
    monday: null, tuesday: null, wednesday: null, thursday: null,
    friday: null, saturday: null, sunday: null,
  }
  if (!raw) return days
  if (raw.trim() === '24/7') {
    return Object.fromEntries(Object.keys(days).map(d => [d, '00:00-24:00']))
  }

  const order  = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  const dayMap: Record<string, string> = {
    Mo: 'monday', Tu: 'tuesday', We: 'wednesday', Th: 'thursday',
    Fr: 'friday', Sa: 'saturday', Su: 'sunday',
  }

  function expandRange(seg: string): string[] {
    const [s, e] = seg.split('-')
    if (!e) return [s]
    const si = order.indexOf(s), ei = order.indexOf(e)
    return si >= 0 && ei >= 0 ? order.slice(si, ei + 1) : [s]
  }

  for (const part of raw.split(';').map(p => p.trim())) {
    const m = part.match(/^([A-Za-z,\-]+)\s+([\d:,\-]+)$/)
    if (!m) continue
    const [, daysPart, times] = m
    for (const seg of daysPart.split(',')) {
      for (const abbr of expandRange(seg.trim())) {
        const full = dayMap[abbr]
        if (full) days[full] = times.trim()
      }
    }
  }
  return days
}

export function isOpenOnDay(
  hours:     Record<string, string | null>,
  dayOfWeek: string,
): boolean {
  return hours[dayOfWeek.toLowerCase()] !== null
}
