// Edge Function "schedule" — porta scheduleDayActivities (web).
// Assegna orari ottimali alle attività SENZA orario di una giornata via LLM Groq
// (fallback matematico TSP + orari ideali). Niente geocoding sincrono: era lento
// (traduzione + Nominatim per ogni attività) e causava timeout; le coordinate per
// la mappa vengono già dall'autocomplete luoghi quando si aggiunge l'attività.
// Body: { tripId, dayId, dayTitle, targetDate }
import { corsHeaders, json } from '../_shared/cors.ts'
import { userClient, getUser } from '../_shared/client.ts'

type Act = {
  id: string; title: string; location: string | null; notes: string | null
  duration_minutes: number | null; lat: number | null; lng: number | null
  time_start: string | null; position: number
}
type ScheduleItem = { index: number; time_start: string; duration_minutes: number | null }

const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant']
async function callGroq(apiKey: string, system: string, user: string): Promise<{ schedule: ScheduleItem[]; summary: string }> {
  let lastErr: Error | null = null
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_object' }, temperature: 0.3, max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) throw new Error(`Groq ${model} ${res.status}`)
      const d = await res.json()
      const parsed = JSON.parse(d.choices?.[0]?.message?.content ?? '{}')
      if (!parsed.schedule || !Array.isArray(parsed.schedule)) throw new Error('bad schedule')
      return { schedule: parsed.schedule, summary: parsed.summary ?? '' }
    } catch (e) { lastErr = e as Error }
  }
  throw lastErr ?? new Error('Groq non disponibile')
}

async function scheduleWithLLM(activities: { index: number; title: string; location: string | null; notes: string | null; duration_minutes: number | null }[], anchors: { title: string; time_start: string; duration_minutes: number | null }[], dayTitle: string, targetDate: string | null) {
  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) throw new Error('GROQ_API_KEY mancante')
  const dateCtx = targetDate ? new Date(targetDate + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : null
  const system = `Sei un esperto pianificatore di itinerari di viaggio con profonda conoscenza geografica e culturale.
Il tuo compito è creare uno schedule giornaliero ottimale basandoti su ragionamento contestuale, NON su calcoli matematici.

Considera sempre:
- Orari di apertura reali dei luoghi (musei, mercati, ristoranti, ecc.)
- Momenti migliori per l'esperienza (meno affollato, luce migliore, temperatura ottimale)
- Prossimità geografica reale nella città (raggruppa luoghi vicini per minimizzare spostamenti)
- Flusso logico della giornata (colazione → mattina → pranzo → pomeriggio → aperitivo/cena)
- Clima e contesto locale
- Cultura locale e abitudini
- Durata realistica della visita per ogni tipo di luogo

Rispondi SOLO con JSON valido, nessun testo aggiuntivo.`
  const userContent = `Destinazione: ${dayTitle}${dateCtx ? `\nData: ${dateCtx}` : ''}

Attività da pianificare:
${JSON.stringify(activities, null, 2)}

${anchors.length > 0 ? `Attività già fissate (NON spostare):\n${JSON.stringify(anchors, null, 2)}` : 'Nessuna attività già fissata.'}

Crea lo schedule ottimale. Per ogni attività indica index, time_start (HH:MM), duration_minutes.
Output JSON: {"schedule":[{"index":0,"time_start":"HH:MM","duration_minutes":90}],"summary":"..."}`
  return await callGroq(apiKey, system, userContent)
}

// ── Fallback matematico ───────────────────────────────────────
function haversine(a1: number, o1: number, a2: number, o2: number): number {
  const R = 6371, rad = (x: number) => x * Math.PI / 180
  const dLat = rad(a2 - a1), dLon = rad(o2 - o1)
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(dLon / 2) ** 2))
}
function greedyTSP<T extends { lat: number | null; lng: number | null }>(items: T[]): T[] {
  const wc = items.filter(i => i.lat != null && i.lng != null)
  const nc = items.filter(i => i.lat == null || i.lng == null)
  if (wc.length === 0) return items
  const start = wc.reduce((b, c) => (c.lat! - c.lng!) > (b.lat! - b.lng!) ? c : b)
  const ordered = [start]; const rem = wc.filter(i => i !== start)
  while (rem.length > 0) {
    const last = ordered[ordered.length - 1]
    let ni = 0, md = Infinity
    rem.forEach((item, i) => { const dd = haversine(last.lat!, last.lng!, item.lat!, item.lng!); if (dd < md) { md = dd; ni = i } })
    ordered.push(rem.splice(ni, 1)[0])
  }
  return [...ordered, ...nc]
}
function idealStartMin(title: string, notes: string | null): number {
  const t = `${title} ${notes ?? ''}`.toLowerCase()
  if (/colazione|breakfast|café|caffè|bar\b/.test(t)) return 8 * 60
  if (/mercato|market|bazar/.test(t)) return 8 * 60 + 30
  if (/museo|museum|galleria|gallery|arte/.test(t)) return 9 * 60 + 30
  if (/tour|escursion|trekking|hiking/.test(t)) return 8 * 60
  if (/spiaggia|beach|mare|sea/.test(t)) return 10 * 60
  if (/pranzo|lunch|trattoria/.test(t)) return 12 * 60 + 30
  if (/aperitivo|cocktail/.test(t)) return 18 * 60 + 30
  if (/cena|dinner|ristorante|restaurant/.test(t)) return 19 * 60 + 30
  if (/night|club|disco/.test(t)) return 22 * 60
  return 9 * 60
}
const minToTime = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

function mathFallback(toSchedule: Act[], anchors: Act[]): ScheduleItem[] {
  const ordered = greedyTSP(toSchedule.map(a => ({ ...a })))
  const lastAnchorEnd = anchors.reduce<number>((mx, a) => a.time_start ? Math.max(mx, timeToMin(a.time_start) + (a.duration_minutes ?? 60)) : mx, -1)
  let cursor = lastAnchorEnd >= 0 ? lastAnchorEnd + 15 : -1
  return ordered.map((act, i) => {
    const ideal = idealStartMin(act.title, act.notes)
    let startMin: number
    if (i === 0) startMin = cursor >= 0 ? Math.max(ideal, cursor) : ideal
    else {
      const prev = ordered[i - 1]
      const prevEnd = timeToMin(prev.time_start ?? minToTime(ideal)) + (prev.duration_minutes ?? 60)
      const travel = (prev.lat != null && act.lat != null) ? Math.round(haversine(prev.lat, prev.lng!, act.lat!, act.lng!) / 4.5 * 60) : 15
      startMin = Math.max(ideal > prevEnd + travel ? ideal : prevEnd + travel, prevEnd + travel)
    }
    const originalIndex = toSchedule.findIndex(a => a.id === act.id)
    cursor = startMin + (act.duration_minutes ?? 60) + 15
    act.time_start = minToTime(startMin)
    return { index: originalIndex, time_start: minToTime(startMin), duration_minutes: act.duration_minutes }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await getUser(req)
    if (!user) return json({ error: 'Non autenticato' }, 401)
    const { tripId, dayId, dayTitle, targetDate } = await req.json().catch(() => ({})) as
      { tripId?: string; dayId?: string; dayTitle?: string; targetDate?: string | null }
    if (!tripId || !dayId) return json({ error: 'tripId/dayId mancanti' }, 400)

    const db = userClient(req)
    const { data: mem } = await db.from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).maybeSingle()
    if (!mem) return json({ error: 'Accesso negato' }, 403)

    // Tutte le attività della tappa (il day_id già la delimita). Niente filtro
    // activity_date: escludeva attività con una data diversa, lasciandone solo una.
    const { data: allRaw } = await db.from('activities').select('*').eq('day_id', dayId).order('position', { ascending: true })
    const all = (allRaw ?? []) as Act[]
    if (all.length === 0) return json({ error: 'Nessuna attività trovata' }, 400)

    const anchors    = all.filter(a => !!a.time_start)
    const toSchedule = all.filter(a => !a.time_start)
    if (toSchedule.length === 0) return json({ error: 'Tutte le attività hanno già un orario' }, 400)

    const isTime = (t: unknown): t is string => typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t)

    let schedule: ScheduleItem[]; let summary = ''
    const hasKey = !!Deno.env.get('GROQ_API_KEY')
    if (hasKey) {
      try {
        const r = await scheduleWithLLM(
          toSchedule.map((a, i) => ({ index: i, title: a.title, location: a.location, notes: a.notes, duration_minutes: a.duration_minutes })),
          anchors.map(a => ({ title: a.title, time_start: a.time_start!, duration_minutes: a.duration_minutes })),
          dayTitle ?? '', targetDate ?? null,
        )
        summary = r.summary
        // Normalizza (indici/orari possono arrivare malformati) e tieni solo voci valide
        const norm = (r.schedule ?? [])
          .map(s => ({ index: Number(s.index), time_start: String(s.time_start ?? ''), duration_minutes: s.duration_minutes ?? null }))
          .filter(s => Number.isInteger(s.index) && s.index >= 0 && s.index < toSchedule.length && isTime(s.time_start))
        // Un orario valido PER OGNI attività? altrimenti fallback matematico (le copre tutte)
        const covered = new Set(norm.map(s => s.index))
        schedule = covered.size === toSchedule.length ? norm : mathFallback(toSchedule, anchors)
      } catch { schedule = mathFallback(toSchedule, anchors) }
    } else {
      schedule = mathFallback(toSchedule, anchors)
    }

    let scheduled = 0
    for (const item of schedule) {
      const act = toSchedule[item.index]
      if (!act || !isTime(item.time_start)) continue
      const upd: Record<string, unknown> = { time_start: item.time_start, updated_at: new Date().toISOString() }
      if (item.duration_minutes) upd.duration_minutes = item.duration_minutes
      await db.from('activities').update(upd).eq('id', act.id)
      scheduled++
    }

    return json({ success: true, scheduled, summary })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
