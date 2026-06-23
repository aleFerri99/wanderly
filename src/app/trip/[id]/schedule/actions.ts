'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ── Geocoding (manteniamo per arricchire le coordinate sulla mappa) ────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function geocodeRaw(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
      { headers: { 'Accept-Language': 'it,en' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {}
  return null
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
  } catch {}
  return text
}

async function geocodeActivity(baseQuery: string, city: string): Promise<{ lat: number; lng: number } | null> {
  const translated = await translateToEnglish(baseQuery)
  await sleep(350)
  const r1 = await geocodeRaw(`${translated}, ${city}`)
  if (r1) return r1
  await sleep(350)
  return await geocodeRaw(translated)
}

// ── LLM scheduling via Google Gemini Flash (gratuito) ─────────────────
//
// COME OTTENERE LA CHIAVE GRATUITA:
//  1. Vai su https://aistudio.google.com/apikey
//  2. Crea una chiave API (nessuna carta di credito richiesta)
//  3. Aggiungila al file .env.local: GOOGLE_AI_KEY=la-tua-chiave
//
// Limiti gratuiti: 15 req/min · 1.000.000 token/min · 1.500 req/giorno

interface ActivityInput {
  index: number
  title: string
  location: string | null
  notes: string | null
  duration_minutes: number | null
}

interface AnchorInput {
  title: string
  time_start: string
  duration_minutes: number | null
}

interface ScheduleItem {
  index: number
  time_start: string
  duration_minutes: number | null
}

// ── Provider 1: Groq (gratuito, nessuna carta di credito) ─────
// Chiave gratuita su: https://console.groq.com
// Modelli disponibili: llama-3.3-70b-versatile, llama-3.1-8b-instant, ecc.
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
]

async function callGroq(
  apiKey: string,
  systemInstruction: string,
  userContent: string,
): Promise<{ schedule: ScheduleItem[]; summary: string }> {
  let lastErr: Error | null = null
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user',   content: userContent },
          ],
          response_format: { type: 'json_object' }, // Garantisce output JSON
          temperature: 0.3,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Groq API error ${res.status} (${model}): ${err}`)
      }

      const data = await res.json()
      const text: string = data.choices?.[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(text)
      if (!parsed.schedule || !Array.isArray(parsed.schedule)) {
        throw new Error(`Risposta non valida da ${model}`)
      }
      return { schedule: parsed.schedule, summary: parsed.summary ?? '' }
    } catch (err) {
      lastErr = err as Error
      console.warn(`[schedule] Groq ${model}:`, (err as Error).message)
    }
  }
  throw lastErr ?? new Error('Nessun modello Groq disponibile')
}

// ── Provider 2: Google Gemini (fallback, richiede quota free tier) ─────
const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
]

async function callGemini(
  model: string,
  apiKey: string,
  systemInstruction: string,
  userContent: string,
): Promise<{ schedule: ScheduleItem[]; summary: string }> {
  // Google AI Studio auth keys (AQ.*) → header x-goog-api-key
  // API keys classiche (AIza*) → query parameter ?key=
  const isAuthKey = apiKey.startsWith('AQ.')
  const url = isAuthKey
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (isAuthKey) headers['x-goog-api-key'] = apiKey

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 1024 },
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status} (${model}): ${err}`)
  }

  const data = await res.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  const parsed = JSON.parse(text)
  if (!parsed.schedule || !Array.isArray(parsed.schedule)) {
    throw new Error(`Risposta non valida dal modello ${model}`)
  }
  return { schedule: parsed.schedule, summary: parsed.summary ?? '' }
}

async function scheduleWithLLM(
  activities: ActivityInput[],
  anchors: AnchorInput[],
  dayTitle: string,
  targetDate: string | null,
): Promise<{ schedule: ScheduleItem[]; summary: string }> {
  const groqKey   = process.env.GROQ_API_KEY
  const googleKey = process.env.GOOGLE_AI_KEY
  if (!groqKey && !googleKey) throw new Error('Nessuna chiave LLM configurata')

  const dateContext = targetDate
    ? new Date(targetDate + 'T00:00:00').toLocaleDateString('it-IT', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  const systemInstruction = `Sei un esperto pianificatore di itinerari di viaggio con profonda conoscenza geografica e culturale.
Il tuo compito è creare uno schedule giornaliero ottimale basandoti su ragionamento contestuale, NON su calcoli matematici.

Considera sempre:
- Orari di apertura reali dei luoghi (musei, mercati, ristoranti, ecc.)
- Momenti migliori per l'esperienza (meno affollato, luce migliore, temperatura ottimale)
- Prossimità geografica reale nella città (raggruppa luoghi vicini per minimizzare spostamenti)
- Flusso logico della giornata (colazione → mattina → pranzo → pomeriggio → aperitivo/cena)
- Clima e contesto locale (es. evitare mercati all'aperto nelle ore più calde nei paesi tropicali)
- Cultura locale e abitudini (orari di punta dei trasporti, pause pranzo, ecc.)
- Durata realistica della visita per ogni tipo di luogo

Rispondi SOLO con JSON valido, nessun testo aggiuntivo.`

  const userContent = `Destinazione: ${dayTitle}${dateContext ? `\nData: ${dateContext}` : ''}

Attività da pianificare:
${JSON.stringify(activities, null, 2)}

${anchors.length > 0 ? `Attività già fissate (NON spostare):
${JSON.stringify(anchors, null, 2)}` : 'Nessuna attività già fissata.'}

Crea lo schedule ottimale. Per ogni attività indica:
- index: l'indice originale dell'attività
- time_start: orario di inizio nel formato HH:MM
- duration_minutes: durata stimata in minuti (usa il valore fornito se disponibile)

Output JSON richiesto:
{
  "schedule": [{"index": 0, "time_start": "HH:MM", "duration_minutes": 90}, ...],
  "summary": "Breve descrizione narrativa del piano della giornata"
}`

  // ── Cascata: Groq → Gemini ────────────────────────────────
  if (groqKey) {
    try {
      return await callGroq(groqKey, systemInstruction, userContent)
    } catch (err) {
      console.warn('[schedule] Groq non disponibile, provo Gemini:', (err as Error).message)
    }
  }

  if (googleKey) {
    let lastError: Error | null = null
    for (const model of GEMINI_MODELS) {
      try {
        return await callGemini(model, googleKey, systemInstruction, userContent)
      } catch (err) {
        lastError = err as Error
        console.warn(`[schedule] Modello ${model} non disponibile:`, (err as Error).message)
      }
    }
    throw lastError ?? new Error('Nessun modello Gemini disponibile')
  }

  throw new Error('Nessuna chiave LLM funzionante')
}

// ── Fallback matematico (usato se GOOGLE_AI_KEY non è configurata) ─────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const rad = (x: number) => x * Math.PI / 180
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1)
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon/2)**2))
}

function greedyTSP<T extends { lat: number | null; lng: number | null }>(items: T[]): T[] {
  const wc = items.filter(i => i.lat != null && i.lng != null)
  const nc = items.filter(i => i.lat == null || i.lng == null)
  if (wc.length === 0) return items
  const start = wc.reduce((b, c) => (c.lat! - c.lng!) > (b.lat! - b.lng!) ? c : b)
  const ordered = [start]
  const rem = wc.filter(i => i !== start)
  while (rem.length > 0) {
    const last = ordered[ordered.length - 1]
    let ni = 0, md = Infinity
    rem.forEach((item, i) => { const d = haversine(last.lat!, last.lng!, item.lat!, item.lng!); if (d < md) { md = d; ni = i } })
    ordered.push(rem.splice(ni, 1)[0])
  }
  return [...ordered, ...nc]
}

function idealStartMin(title: string, notes: string | null): number {
  const t = `${title} ${notes ?? ''}`.toLowerCase()
  if (/colazione|breakfast|café|caffè|bar\b/.test(t)) return 8 * 60
  if (/mercato|market|bazar/.test(t))                  return 8 * 60 + 30
  if (/museo|museum|galleria|gallery|arte/.test(t))     return 9 * 60 + 30
  if (/tour|escursion|trekking|hiking/.test(t))         return 8 * 60
  if (/spiaggia|beach|mare|sea/.test(t))               return 10 * 60
  if (/pranzo|lunch|trattoria/.test(t))                 return 12 * 60 + 30
  if (/aperitivo|cocktail/.test(t))                     return 18 * 60 + 30
  if (/cena|dinner|ristorante|restaurant/.test(t))      return 19 * 60 + 30
  if (/night|club|disco/.test(t))                       return 22 * 60
  return 9 * 60
}

function minToTime(m: number): string {
  const h = Math.floor((m % 1440) / 60), min = m % 60
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number); return h * 60 + m
}

function mathFallback(
  toSchedule: Array<{ lat: number | null; lng: number | null; title: string; notes: string | null; duration_minutes: number | null; time_start: string | null }>,
  anchors: Array<{ time_start: string | null; duration_minutes: number | null }>,
): ScheduleItem[] {
  const ordered = greedyTSP(toSchedule)
  const lastAnchorEnd = anchors.reduce<number>((mx, a) =>
    a.time_start ? Math.max(mx, timeToMin(a.time_start) + (a.duration_minutes ?? 60)) : mx, -1)
  let cursor = lastAnchorEnd >= 0 ? lastAnchorEnd + 15 : -1
  return ordered.map((act, i) => {
    const ideal = idealStartMin(act.title, act.notes)
    let startMin: number
    if (i === 0) {
      startMin = cursor >= 0 ? Math.max(ideal, cursor) : ideal
    } else {
      const prev = ordered[i - 1]
      const prevEnd = timeToMin(prev.time_start ?? minToTime(ideal)) + (prev.duration_minutes ?? 60)
      const travel = (prev.lat != null && act.lat != null)
        ? Math.round(haversine(prev.lat, prev.lng!, act.lat!, act.lng!) / 4.5 * 60)
        : 15
      startMin = Math.max(ideal > prevEnd + travel ? ideal : prevEnd + travel, prevEnd + travel)
    }
    const originalIndex = toSchedule.indexOf(act)
    cursor = startMin + (act.duration_minutes ?? 60) + 15
    act.time_start = minToTime(startMin)
    return { index: originalIndex, time_start: minToTime(startMin), duration_minutes: act.duration_minutes }
  })
}

// ── Azione principale ──────────────────────────────────────────────────

export async function scheduleDayActivities(
  tripId:     string,
  dayId:      string,
  dayTitle:   string,
  targetDate: string | null,
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from('activities').select('*').eq('day_id', dayId)
  if (targetDate) q = q.or(`activity_date.eq.${targetDate},activity_date.is.null`)
  const { data: allRaw } = await q.order('position', { ascending: true })
  const all = (allRaw ?? []) as import('@/types/database').Activity[]

  if (!all || all.length === 0) return { error: 'Nessuna attività trovata' }
  const anchors    = all.filter(a => !!a.time_start)
  const toSchedule = all.filter(a => !a.time_start)
  if (toSchedule.length === 0) return { error: 'Tutte le attività hanno già un orario' }

  // Geocoding di arricchimento (coordinate per la mappa, best-effort)
  for (const act of toSchedule) {
    if (act.lat != null && act.lng != null) continue
    const coords = await geocodeActivity(act.location?.trim() || act.title, dayTitle)
    if (coords) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('activities').update({ lat: coords.lat, lng: coords.lng }).eq('id', act.id)
      act.lat = coords.lat; act.lng = coords.lng
    }
  }

  // ── Scheduling: LLM → fallback matematico ─────────────────
  let schedule: ScheduleItem[]
  let summary = ''
  const hasApiKey = !!(process.env.GROQ_API_KEY || process.env.GOOGLE_AI_KEY)

  if (hasApiKey) {
    try {
      const result = await scheduleWithLLM(
        toSchedule.map((a, i) => ({
          index: i, title: a.title,
          location: a.location, notes: a.notes,
          duration_minutes: a.duration_minutes,
        })),
        anchors.map(a => ({
          title: a.title, time_start: a.time_start!,
          duration_minutes: a.duration_minutes,
        })),
        dayTitle,
        targetDate,
      )
      schedule = result.schedule
      summary  = result.summary
    } catch (err) {
      console.error('[schedule] Gemini non disponibile, uso fallback matematico:', err)
      schedule = mathFallback(toSchedule, anchors)
    }
  } else {
    schedule = mathFallback(toSchedule, anchors)
  }

  // Applica al DB
  for (const item of schedule) {
    const act = toSchedule[item.index]
    if (!act) continue
    const upd: Record<string, unknown> = { time_start: item.time_start, updated_at: new Date().toISOString() }
    if (item.duration_minutes) upd.duration_minutes = item.duration_minutes
    if (targetDate) upd.activity_date = targetDate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('activities').update(upd).eq('id', act.id)
  }

  revalidatePath(`/trip/${tripId}`)
  return {
    success: true,
    scheduled: schedule.length,
    summary,
    usedLLM: hasApiKey,
  }
}
