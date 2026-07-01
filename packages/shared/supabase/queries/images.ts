// queries/images.ts — CLIENT-SAFE. Copertina per destinazione.
// Strategia a strati: Unsplash (se chiave) → Wikipedia (keyless, foto del luogo).
// Risultati cachati in memoria per sessione.

const cache = new Map<string, string | null>()

async function wikiImage(lang: string, title: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const d = await res.json()
    if (d.type === 'disambiguation') return null
    return d.originalimage?.source ?? d.thumbnail?.source ?? null
  } catch {
    return null
  }
}

export async function fetchDestinationImage(
  destination: string,
  unsplashKey?: string | null,
): Promise<string | null> {
  const city = destination.split(',')[0].trim()
  if (!city) return null
  const key = city.toLowerCase()
  if (cache.has(key)) return cache.get(key)!

  let url: string | null = null

  // 1. Unsplash (stock curato) se la chiave è configurata
  if (unsplashKey) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(city)}&per_page=1&orientation=landscape&content_filter=high`,
        { headers: { Authorization: `Client-ID ${unsplashKey}` }, signal: AbortSignal.timeout(6000) },
      )
      if (res.ok) { const d = await res.json(); url = d.results?.[0]?.urls?.regular ?? null }
    } catch { /* fallthrough */ }
  }

  // 2. Wikipedia (keyless): foto reale del luogo
  if (!url) url = await wikiImage('it', city)
  if (!url) url = await wikiImage('en', city)

  cache.set(key, url)
  return url
}
