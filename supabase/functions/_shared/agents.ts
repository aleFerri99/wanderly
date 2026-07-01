// ============================================================
// Edge port di packages/shared/supabase/agents.ts (sezione suggerimenti).
// Differenza rispetto al sorgente web: GROQ_API_KEY letta da Deno.env.
// Mantieni i prompt in sync col sorgente web.
// ============================================================
import type { DayForecast } from './weather.ts'
import { buildEnricherContext, type EnricherOutput } from './enricher.ts'

async function callGroqAgent(system: string, user: string, maxTokens = 2048): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) throw new Error('GROQ_API_KEY non configurata')

  const models = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant']
  let lastErr: Error | null = null

  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user',   content: user },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          max_tokens:  maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Groq ${model} error ${res.status}: ${err}`)
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content ?? '{}'
    } catch (err) {
      lastErr = err as Error
    }
  }
  throw lastErr ?? new Error('Nessun modello Groq disponibile')
}

// ── Tipi ───────────────────────────────────────────────────────
export interface WeatherConflict {
  date:          string
  condition:     string
  activities_at_risk: Array<{ title: string; reason: string }>
  severity:      'low' | 'medium' | 'high'
}
export interface MeteorologoOutput {
  conflicts:       WeatherConflict[]
  overall_summary: string
}
export interface ActivitySuggestion {
  type:             'reschedule' | 'swap_indoor' | 'new_activity' | 'weather_alert' | 'activity_suggestion'
  title:            string
  body:             string
  priority:         number
  group_fit_reason?: string
  replaces?:        string | null   // titolo ESATTO dell'attività da rimuovere (swap/reschedule)
  activity_data?: {
    title:      string
    notes:      string | null
    location:   string | null
    time_start: string | null
    date:       string | null
  }
}
export interface TravelPlannerOutput {
  suggestions: ActivitySuggestion[]
}
export interface TravelerProfileOutput {
  adventure_level:   number
  cultural_interest: number
  food_focus:        number
  personality_tags:  string[]
  raw_analysis:      string
  pace_preference:   number
  social_openness:   number
  novelty_seeking:   number
  mobility_level:    'full' | 'moderate' | 'limited'
  travel_style:      'planner' | 'spontaneous' | 'mixed'
  language_comfort:  'local_only' | 'english_ok' | 'multilingual'
  pace_note:         string
}
export interface DayPlan {
  title:    string
  date:     string | null
  date_end: string | null
}

// ── Aggregatore profili gruppo ────────────────────────────────
function buildGroupAggregate(profiles: TravelerProfileOutput[]) {
  const avg = (key: 'adventure_level' | 'cultural_interest' | 'food_focus') =>
    profiles.reduce((sum, p) => sum + p[key], 0) / profiles.length

  const allTags = profiles.flatMap(p => p.personality_tags)
  const tagFrequency = allTags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const dominantTags = Object.entries(tagFrequency)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag]) => tag)

  const adventureLevels = profiles.map(p => p.adventure_level)
  const hasLowAdventure  = Math.min(...adventureLevels) <= 2
  const hasHighAdventure = Math.max(...adventureLevels) >= 4
  const isGroupDiverged  = hasLowAdventure && hasHighAdventure

  return {
    avg_adventure:  +avg('adventure_level').toFixed(1),
    avg_culture:    +avg('cultural_interest').toFixed(1),
    avg_food:       +avg('food_focus').toFixed(1),
    dominant_tags:  dominantTags,
    is_diverged:    isGroupDiverged,
    most_limiting:  profiles.find(p => p.adventure_level === Math.min(...adventureLevels)),
  }
}

// ── Agente 2: Il Meteorologo ──────────────────────────────────
export async function runMeteorologoAgent(
  destination: string,
  forecasts:   DayForecast[],
  activities:  Array<{
    title: string; notes: string | null; location: string | null
    time_start: string | null; activity_date: string | null
  }>,
): Promise<MeteorologoOutput> {
  const system = `Sei il Meteorologo esperto di un sistema di pianificazione viaggi.
Analizzi le previsioni meteo COMPLETE — dati giornalieri E fasce orarie (mattina/pomeriggio/sera) — e identifichi rischi e conflitti per le attività pianificate.

REGOLA FONDAMENTALE: ragiona SEMPRE a livello di fascia oraria, non solo sul giorno intero.
Se piove solo la sera, la mattina può essere perfetta per outdoor.
Se fa caldo solo nel pomeriggio, la mattina presto o la sera sono ideali per attività intense.

Fattori da considerare per ogni fascia:
- CONDIZIONE: pioggia/temporale = no outdoor; rovesci = valuta in base a probabilità e mm
- TEMPERATURA PERCEPITA: >35°C = rischio caldo; <5°C = disagio prolungato all'aperto
- INDICE UV: >6 protezione; >8 evitare esposizione ore 11-15
- VENTO: >40 km/h = disagio passeggiate, instabilità strutture
- PIOGGIA: prob >60% o >2mm/fascia = outdoor sconsigliato; prob <30% e <1mm = ok

Per le attività pianificate: abbina l'orario dell'attività alla fascia corrispondente.
Un'attività "mattina" è quella con time_start 06:00-11:59; "pomeriggio" 12:00-17:59; "sera" 18:00+.
Se l'attività non ha orario, considera l'intera giornata ma evidenzia quale fascia è problematica.

Restituisci SOLO JSON valido.`

  const SLOT_ICON: Record<string, string> = { mattina: '🌅', pomeriggio: '🌞', sera: '🌆' }
  const COND_ICON: Record<string, string> = {
    clear: '☀️', cloudy: '⛅', foggy: '🌫️', rainy: '🌧️', showers: '🌦️', snowy: '❄️', stormy: '⛈️',
  }

  const forecastText = forecasts.map(f => {
    const daily =
      `${f.date}: ${f.condition} | ` +
      `Temp: ${f.temp_min}°C-${f.temp_max}°C (percepita ${f.apparent_temp_min}°C-${f.apparent_temp_max}°C) | ` +
      `Pioggia: ${f.precipitation}mm (prob. ${f.precipitation_prob}%) | ` +
      `Vento: ${f.windspeed_max} km/h | UV: ${f.uv_index} | Comfort: ${f.comfort_score}/10`

    const slots = f.hourly_slots.length > 0
      ? f.hourly_slots.map(s =>
          `  ${SLOT_ICON[s.slot] ?? ''} ${s.slot.padEnd(11)} (${s.hours}): ` +
          `${COND_ICON[s.condition] ?? ''} ${s.condition} | ` +
          `${s.temp_avg}°C (percepita ${s.apparent_temp_avg}°C) | ` +
          `pioggia ${s.precipitation}mm (${s.precipitation_prob}%) | ` +
          `vento ${s.windspeed_max}km/h | UV ${s.uv_index_max} | ` +
          (s.is_outdoor_safe ? '✅ outdoor ok' : '🚫 indoor consigliato')
        ).join('\n')
      : ''

    return slots ? `${daily}\n${slots}` : daily
  }).join('\n')

  const actText = activities.map(a =>
    `- "${a.title}" ${a.activity_date ? `[${a.activity_date}]` : ''} ${a.time_start ?? ''} | luogo: ${a.location ?? 'N/D'} | note: ${a.notes ?? 'N/D'}`
  ).join('\n')

  const user = `Destinazione: ${destination}

Previsioni meteo:
${forecastText}

Attività pianificate:
${actText}

Identifica i conflitti meteo e restituisci:
{
  "conflicts": [
    {
      "date": "YYYY-MM-DD",
      "condition": "descrizione meteo",
      "activities_at_risk": [{"title": "nome attività", "reason": "perché è a rischio"}],
      "severity": "low|medium|high"
    }
  ],
  "overall_summary": "Riassunto complessivo dell'analisi meteo"
}`

  try {
    const raw = await callGroqAgent(system, user)
    return JSON.parse(raw) as MeteorologoOutput
  } catch {
    return { conflicts: [], overall_summary: 'Analisi meteo non disponibile.' }
  }
}

// ── Agente 3: Il Travel Planner (Orchestratore meteo) ─────────
export async function runTravelPlannerWeatherAgent(
  destination:       string,
  meteoAnalysis:     MeteorologoOutput,
  allActivities:     Array<{ title: string; activity_date: string | null; time_start: string | null; location: string | null; notes: string | null; day?: { date: string | null; date_end: string | null } | null }>,
  forecasts:         DayForecast[],
  travelerProfiles?: TravelerProfileOutput[],
  enricherOutput?:   EnricherOutput,
): Promise<TravelPlannerOutput> {
  if (meteoAnalysis.conflicts.length === 0) {
    return { suggestions: [] }
  }

  const hasProfiles = travelerProfiles && travelerProfiles.length > 0
  const enricherCtx = enricherOutput ? buildEnricherContext(enricherOutput) : ''

  let profilesContext = ''
  if (hasProfiles) {
    const agg = buildGroupAggregate(travelerProfiles!)
    profilesContext = `

PROFILO AGGREGATO GRUPPO:
- Avventura media: ${agg.avg_adventure}/5${agg.is_diverged ? ' ⚠️ gruppo divergente' : ''}
- Cultura media: ${agg.avg_culture}/5
- Cibo medio: ${agg.avg_food}/5
- Tag dominanti: ${agg.dominant_tags.join(', ')}
${agg.is_diverged && agg.most_limiting
  ? `- Membro più prudente: "${agg.most_limiting.raw_analysis}"`
  : ''}

PROFILI INDIVIDUALI:
${travelerProfiles!.map((p, i) =>
  `- Viaggiatore ${i + 1}: avv ${p.adventure_level}/5, cult ${p.cultural_interest}/5, cibo ${p.food_focus}/5 | ${p.personality_tags.join(', ')} | "${p.raw_analysis}"`
).join('\n')}`.trim()
  }

  const system = `Sei il Travel Planner AI di Wanderly. Il tuo obiettivo è generare suggerimenti che siano al tempo stesso meteorologicamente sicuri E profondamente personalizzati per il gruppo specifico.

STEP 1 — LEGGI IL GRUPPO
Prima di tutto, analizza i profili e costruisci mentalmente il "profilo aggregato":
- Chi ha esigenze fisiche o meteo più critiche? (es. bassa avventura = evita caldo/pioggia)
- Qual è il livello medio di avventura, cultura, cibo del gruppo?
- Ci sono outlier che potrebbero sentirsi esclusi da un'attività di gruppo?

Usa i punteggi numerici (1–5) come soglie decisionali:
- adventure_level ≥ 4 → accetta attività outdoor anche con vento/caldo moderato
- adventure_level ≤ 2 → priorità assoluta a comfort e riparo
- cultural_interest ≥ 4 → preferisci musei, siti storici, gallerie come indoor swap
- food_focus ≥ 4 → ristoranti/mercati locali sono sempre una swap valida
- Se i punteggi del gruppo divergono molto → proponi attività con split opzionale

STEP 1b — LEGGI I DATI REALI DELLE ATTIVITÀ (se presenti)
Se ricevi "DATI REALI ATTIVITÀ (OpenTripMap + OpenStreetMap)" nel contesto, usali come sorgente di verità:
- interesse ★★★ (popularity ≥ 66) → luogo molto popolare, visita mattina presto (entro 10:00) o dopo 16:00
- interesse ★★ (popularity 33–65) → moderatamente affollato, orario flessibile
- interesse ★ o n/d (popularity < 33) → poco affollato, nessuna priorità speciale
- indoorOutdoor = "indoor" → candidato ideale per swap_indoor in caso di pioggia
- bestTimeOfDay → rispetta l'orario consigliato quando suggerisci reschedule
- orari oggi presenti → non schedulare l'attività fuori da quella fascia oraria
- orari oggi assenti → assumi aperto (dato mancante, non posto chiuso)
- typicalDuration → usala con pace_preference per non sovraccaricare la giornata
  (avg_pace ≤ 2 → max 240min/fascia; pace 3 → max 360min; pace ≥ 4 → max 480min)
- description (Wikipedia) → usala per arricchire il campo "body" del suggerimento

STEP 2 — RISOLVI I CONFLITTI METEO
Per ogni conflitto, scegli il tipo di azione filtrando le opzioni attraverso il profilo aggregato del gruppo:
- "reschedule": sposta in finestra meteo migliore
- "swap_indoor": sostituisci con alternativa al chiuso scelta in base ai profili
  → high cultural_interest → museo/sito storico
  → high food_focus → mercato/ristorante tipico
  → mixed → attività con componente sia culturale che gastronomica
- "new_activity": nuova attività coerente con i tag dominanti del gruppo
- "weather_alert": per conflitti lievi, avvisa senza modifiche

STEP 3 — PERSONALIZZA LA MOTIVAZIONE
Per ogni suggerimento, spiega brevemente perché è adatto a questo gruppo specifico, non alla destinazione in generale. Cita esplicitamente i profili nel campo "group_fit_reason".
Esempio: "Ideale per il gruppo: Marco apprezza l'aspetto storico, Giulia può esplorare il mercato interno."

SOSTITUZIONE / SPOSTAMENTO (campo "replaces")
- Per "swap_indoor" (sostituisci un'attività con un'alternativa) e per "reschedule" (sposta la stessa attività): imposta "replaces" con il TITOLO ESATTO dell'attività originale che viene rimossa/spostata (prendilo dall'itinerario, copiato identico). Per "swap_indoor" "activity_data.title" è la NUOVA attività; per "reschedule" coincide con l'originale.
- Per "new_activity" e "weather_alert": "replaces" deve essere null.

VINCOLO DATE — TAPPE (OBBLIGATORIO, RAGIONA SEMPRE COSÌ)
Il viaggio è diviso in TAPPE, ognuna con un intervallo di date e un luogo diverso. Ogni attività appartiene alla tappa il cui intervallo contiene la sua data (nell'itinerario è indicato "[tappa: <date>]").
- "reschedule": la NUOVA data DEVE restare DENTRO l'intervallo della tappa a cui appartiene l'attività. Non spostare MAI un'attività a una data di un'altra tappa: significherebbe farla in un altro luogo, è un errore grave.
- Se dentro l'intervallo della tappa NON c'è una fascia meteo buona, allora NON fare "reschedule": usa "swap_indoor" (alternativa al chiuso nello stesso luogo/giorni) oppure "weather_alert".
- "new_activity": la data deve cadere dentro l'intervallo di una tappa esistente, coerente con il luogo di quella tappa.
- Considera "Giorni con meteo favorevole" solo se cadono dentro l'intervallo della tappa giusta; scarta gli altri.

PRIORITÀ: 0 = informativo, 5 = consigliato, 10 = urgente

Restituisci SOLO JSON valido.`

  const conflictsText = JSON.stringify(meteoAnalysis.conflicts, null, 2)
  const stopRange = (s: { date: string | null; date_end: string | null }) =>
    s.date ? (s.date_end && s.date_end > s.date ? `${s.date} → ${s.date_end}` : s.date) : null
  // Tappe uniche (dalle attività) per elencare i vincoli di date
  const stopMap = new Map<string, { date: string | null; date_end: string | null }>()
  for (const a of allActivities) {
    if (a.day?.date) { const k = `${a.day.date}|${a.day.date_end ?? ''}`; if (!stopMap.has(k)) stopMap.set(k, { date: a.day.date, date_end: a.day.date_end }) }
  }
  const stops = [...stopMap.values()].sort((x, y) => (x.date ?? '').localeCompare(y.date ?? ''))
  const stopsText = stops.length
    ? stops.map((s, i) => `Tappa ${i + 1}: ${stopRange(s)}`).join('\n')
    : 'Nessuna data impostata sulle tappe.'
  const itineraryText = allActivities.map(a => {
    const range = a.day ? stopRange(a.day) : null
    return `- "${a.title}" ${a.activity_date ?? 'data N/D'} ${a.time_start ?? ''}${range ? ` [tappa: ${range}]` : ''}`
  }).join('\n')

  const goodSlots: string[] = []
  for (const f of forecasts) {
    for (const s of f.hourly_slots) {
      if (s.is_outdoor_safe) {
        goodSlots.push(`${f.date} ${s.slot} (${s.hours}): ${s.condition}, ${s.temp_avg}°C, pioggia ${s.precipitation}mm`)
      }
    }
  }
  const goodDays = goodSlots.length > 0 ? goodSlots.join('; ') : forecasts
    .filter(f => f.is_outdoor_safe)
    .map(f => `${f.date} (comfort ${f.comfort_score}/10)`)
    .join('; ')

  const user = `Destinazione: ${destination}
Giorni con meteo favorevole: ${goodDays || 'nessuno'}
${profilesContext ? profilesContext + '\n' : ''}
Riassunto analisi meteo: ${meteoAnalysis.overall_summary}

Conflitti identificati:
${conflictsText}
${enricherCtx ? '\n' + enricherCtx + '\n' : ''}
Tappe del viaggio (una attività può stare SOLO nelle date della sua tappa):
${stopsText}

Itinerario corrente (con la tappa di ogni attività):
${itineraryText}

Genera suggerimenti pratici e restituisci:
{
  "suggestions": [
    {
      "type": "reschedule|swap_indoor|new_activity|weather_alert",
      "title": "Titolo breve del suggerimento",
      "body": "Spiegazione dettagliata del suggerimento",
      "priority": 0-10,
      "group_fit_reason": "Perché questo suggerimento è adatto a questo gruppo specifico (cita i profili)",
      "replaces": "titolo esatto dell'attività da rimuovere per swap_indoor/reschedule, altrimenti null",
      "activity_data": {
        "title": "Nome attività da aggiungere all'itinerario",
        "notes": "Note aggiuntive o null",
        "location": "Luogo specifico o null",
        "time_start": "HH:MM o null",
        "date": "YYYY-MM-DD — DEVE cadere dentro l'intervallo della tappa dell'attività (mai in un'altra tappa)"
      }
    }
  ]
}`

  try {
    const raw = await callGroqAgent(system, user)
    return JSON.parse(raw) as TravelPlannerOutput
  } catch {
    return { suggestions: [] }
  }
}

// ── Agente 4: Itinerary Planner ───────────────────────────────
export async function runItineraryPlannerAgent(
  destination:       string,
  days:              DayPlan[],
  forecasts:         DayForecast[],
  travelerProfiles?: TravelerProfileOutput[],
  enricherOutput?:   EnricherOutput,
): Promise<TravelPlannerOutput> {
  const hasProfiles = travelerProfiles && travelerProfiles.length > 0
  const enricherCtx = enricherOutput ? buildEnricherContext(enricherOutput) : ''

  let profileCtx = ''
  if (hasProfiles) {
    const agg = buildGroupAggregate(travelerProfiles!)
    const activitiesPerDay = agg.avg_adventure >= 4 ? '5-6' : agg.avg_adventure <= 2 ? '3-4' : '4-5'
    profileCtx = `
PROFILO GRUPPO:
- Avventura ${agg.avg_adventure}/5 | Cultura ${agg.avg_culture}/5 | Cibo ${agg.avg_food}/5
- Tag dominanti: ${agg.dominant_tags.join(', ')}
- Attività consigliate per giornata: ${activitiesPerDay}
${travelerProfiles!.map((p, i) =>
  `- Viaggiatore ${i + 1}: ${p.pace_note || p.raw_analysis}`
).join('\n')}`.trim()
  }

  type Transition = { date: string; from: string; to: string }
  const transitions: Transition[] = []
  for (let i = 0; i < days.length - 1; i++) {
    const curr = days[i]
    const next = days[i + 1]
    const currEnd   = curr.date_end ?? curr.date
    const nextStart = next.date
    if (currEnd && nextStart && currEnd === nextStart) {
      transitions.push({ date: currEnd, from: curr.title, to: next.title })
    }
  }

  const forecastByDate = new Map(forecasts.map(f => [f.date, f]))

  const daysText = days.map(d => {
    const endDate    = d.date_end && d.date_end > (d.date ?? '') ? d.date_end : d.date
    const dateRange  = endDate !== d.date ? `${d.date} → ${endDate}` : (d.date ?? 'data N/D')
    const f = d.date ? forecastByDate.get(d.date) : null
    const weather = f
      ? `meteo: ${f.condition}, ${f.temp_min}°-${f.temp_max}°C, pioggia ${f.precipitation_prob}%`
      : 'meteo: N/D'
    const transitNote = transitions.find(t => t.date === endDate && t.from === d.title)
      ? ` ⚠️ ultimo giorno = giorno di trasferimento verso "${transitions.find(t => t.date === endDate && t.from === d.title)!.to}"`
      : ''
    return `- "${d.title}" [${dateRange}] | ${weather}${transitNote}`
  }).join('\n')

  const transitionsText = transitions.length > 0
    ? `\n⚠️ GIORNI DI TRASFERIMENTO IN AUTO:\n` + transitions.map(t =>
        `- ${t.date}: "${t.from}" → "${t.to}"\n` +
        `  Stima tempo di guida in base alla distanza reale tra le due città.\n` +
        `  Su quel giorno (${t.date}) suggerisci SOLO:\n` +
        `    • Mattina (08:00-12:00): 1-2 attività leggere a "${t.from}" → date: ${t.date}, time_start ≤ 12:00\n` +
        `    • Sera (19:00+): 1 attività a "${t.to}" SE la guida lo permette → date: ${t.date}, time_start ≥ 19:00\n` +
        `  NON suggerire attività nel blocco orario della guida.\n` +
        `  Le attività mattutine appartengono alla tappa "${t.from}", quelle serali a "${t.to}".`
      ).join('\n')
    : ''

  const system = `Sei un esperto pianificatore di itinerari di viaggio. Ricevi un elenco di tappe senza attività e devi creare un piano giornaliero completo che copra l'intera giornata per ogni tappa.

REGOLE GENERALI:
- Genera 3-5 attività per giornata (adatta al profilo del gruppo se disponibile)
- Copri le fasce: mattina (08:00-13:00), pomeriggio (14:00-18:00), sera (19:00+)
- Ogni attività deve avere un orario preciso (time_start HH:MM)
- Attività geograficamente sensate: non fare saltare il gruppo da un quartiere all'altro
- Per tappe multi-giorno distribuisci le attività sui giorni nell'intervallo
- Non mettere attività outdoor se pioggia probabile >60%
- Ritmo lento → qualità vs quantità, includi pause pranzo esplicite
- type sempre "activity_suggestion", priority: 5

GIORNI DI TRASFERIMENTO (CRITICO):
Quando una data è un giorno di trasferimento in auto tra due città:
- Suggerisci SOLO attività leggere la mattina nella città di PARTENZA (time_start ≤ 12:00)
- Stima il tempo di guida in macchina tra le due città
- Se la guida finisce in tempo utile, suggerisci UNA sola attività serale (≥ 19:00) nella città di ARRIVO
- NON suggerire mai attività nel blocco orario dedicato alla guida
- Le attività mattutine vanno datate con la data di trasferimento (appartengono alla tappa di partenza)
- Le attività serali di arrivo vanno datate con la stessa data di trasferimento (appartengono alla tappa di arrivo)

Restituisci SOLO JSON valido.`

  const user = `Destinazione principale: ${destination}

Tappe da pianificare:
${daysText}
${transitionsText}
${profileCtx ? '\n' + profileCtx : ''}
${enricherCtx ? '\n' + enricherCtx : ''}

Crea un itinerario completo rispettando i vincoli dei giorni di trasferimento e restituisci:
{
  "suggestions": [
    {
      "type": "activity_suggestion",
      "title": "Titolo breve della card",
      "body": "Descrizione e motivazione",
      "priority": 5,
      "group_fit_reason": "Perché adatta al gruppo (ometti se nessun profilo)",
      "activity_data": {
        "title": "Nome attività",
        "notes": "Consigli pratici o null",
        "location": "Luogo specifico",
        "time_start": "HH:MM",
        "date": "YYYY-MM-DD"
      }
    }
  ]
}`

  try {
    const raw = await callGroqAgent(system, user, 4000)
    return JSON.parse(raw) as TravelPlannerOutput
  } catch {
    return { suggestions: [] }
  }
}

// ── Agente 1: Lo Psicologo ────────────────────────────────────
// Input: profilo utente completo → Output: profilo viaggiatore strutturato.
function validatePsychologistOutput(raw: unknown): TravelerProfileOutput {
  const p = raw as Record<string, unknown>

  const numericFields = [
    'adventure_level', 'cultural_interest', 'food_focus',
    'pace_preference', 'social_openness', 'novelty_seeking',
  ] as const
  for (const field of numericFields) {
    const val = p[field]
    if (typeof val !== 'number' || val < 1 || val > 5) p[field] = 3
  }

  if (!['full', 'moderate', 'limited'].includes(p.mobility_level as string)) p.mobility_level = 'moderate'
  if (!['planner', 'spontaneous', 'mixed'].includes(p.travel_style as string)) p.travel_style = 'mixed'
  if (!['local_only', 'english_ok', 'multilingual'].includes(p.language_comfort as string)) p.language_comfort = 'english_ok'
  if (!Array.isArray(p.personality_tags) || p.personality_tags.length === 0) p.personality_tags = ['explorer']
  if (typeof p.raw_analysis !== 'string' || p.raw_analysis.trim() === '') p.raw_analysis = 'Profilo non disponibile.'
  if (typeof p.pace_note !== 'string' || p.pace_note.trim() === '') p.pace_note = 'Ritmo standard, equilibrio tra attività e riposo.'

  return p as unknown as TravelerProfileOutput
}

export async function runPsicologoAgent(
  profile: {
    full_name:        string | null
    nationality:      string | null
    birth_date:       string | null
    gender:           string | null
    languages:        string[]
    travel_interests: string[]
    trip_notes?:      string | null
  },
): Promise<TravelerProfileOutput> {
  const age = profile.birth_date
    ? `${new Date().getFullYear() - parseInt(profile.birth_date)} anni`
    : 'N/D'

  const system = `Sei lo Psicologo di viaggio AI di Wanderly. Il tuo compito è analizzare il profilo di un viaggiatore e restituire una valutazione strutturata che verrà usata da un Travel Planner AI per personalizzare suggerimenti di attività e ritmo delle giornate.

Ricevi questi dati per ogni viaggiatore:
- Età
- Nazionalità
- Lingue parlate
- Interessi generali
- Interessi specifici per questo viaggio (testo libero)

Devi restituire ESCLUSIVAMENTE un oggetto JSON valido, senza testo prima o dopo, senza backtick, senza markdown. Nessun commento. Solo JSON.

La struttura è questa:

{
  "adventure_level":   <numero 1-5>,
  "cultural_interest": <numero 1-5>,
  "food_focus":        <numero 1-5>,
  "pace_preference":   <numero 1-5>,
  "social_openness":   <numero 1-5>,
  "novelty_seeking":   <numero 1-5>,
  "mobility_level":    <"full" | "moderate" | "limited">,
  "travel_style":      <"planner" | "spontaneous" | "mixed">,
  "language_comfort":  <"local_only" | "english_ok" | "multilingual">,
  "personality_tags":  <array di 3-5 stringhe in inglese minuscolo>,
  "raw_analysis":      <stringa: 2-3 frasi in italiano sul profilo generale>,
  "pace_note":         <stringa: 1 frase in italiano sul ritmo preferito>
}

GUIDA PER I PUNTEGGI NUMERICI (1-5):

adventure_level
  1 = preferisce attività sicure, note, senza rischi fisici
  3 = aperto a qualche attività dinamica se non troppo impegnativa
  5 = ama sfide fisiche, trekking, sport, esperienze estreme

cultural_interest
  1 = indifferente a musei e storia, preferisce esperienze pratiche
  3 = apprezza la cultura se presentata in modo accessibile
  5 = appassionato di storia, arte, architettura, musei

food_focus
  1 = il cibo è solo nutrimento, non una priorità del viaggio
  3 = ama mangiare bene ma non organizza il viaggio attorno al cibo
  5 = il cibo è centrale: cerca ristoranti tipici, mercati, corsi di cucina

pace_preference
  1 = ritmo lento, una cosa alla volta, molte pause, giornate corte
  3 = equilibrio tra attività e riposo
  5 = giornate intense e piene, vuole vedere e fare il massimo possibile

social_openness
  1 = preferisce esperienze private, tranquille, senza interazione con estranei
  3 = aperto all'interazione se spontanea, non ama essere forzato
  5 = ama conoscere locals, tour di gruppo, esperienze condivise

novelty_seeking
  1 = preferisce il familiare e confortevole, evita l'ignoto
  3 = curioso ma con una base di sicurezza
  5 = cerca attivamente esperienze insolite, fuori dai circuiti turistici

GUIDA PER I CAMPI CATEGORICI:

mobility_level
  "full"     = nessuna limitazione fisica, qualsiasi attività è accessibile
  "moderate" = preferisce evitare lunghe camminate, salite impegnative, scale
  "limited"  = ha bisogno di percorsi accessibili, pause frequenti, niente sforzo
  → Inferisci da: età avanzata (>65), età molto giovane (<10), menzioni di stanchezza/lentezza/relax negli interessi, o indicazioni dirette

travel_style
  "planner"     = organizza tutto in anticipo, ama ottimizzare il tempo
  "spontaneous" = preferisce scoprire sul momento, senza programma rigido
  "mixed"       = vuole una struttura di base con spazio per l'improvvisazione
  → Inferisci dal tono del testo libero: "ottimizzare", "programmare", "lista" → planner. "Scoprire", "perdersi", "libero" → spontaneous

language_comfort
  "local_only"   = parla solo la lingua madre, difficoltà con lingue straniere
  "english_ok"   = parla inglese, può accedere a tour/esperienze in inglese
  "multilingual" = parla 3+ lingue, nessuna barriera linguistica
  → Usa il campo lingue parlate

GUIDA PER I CAMPI NARRATIVI:

personality_tags: array di 3-5 tag in inglese minuscolo. Scegli tra questi o inventane di appropriati:
  explorer, foodie, history_buff, art_lover, nature_lover, slow_traveler, adventure_seeker, culture_vulture, spontaneous, planner, social_butterfly, introvert, luxury_seeker, budget_traveler, photographer, shopper, wellness_seeker, nightlife_lover, family_oriented, romantic

raw_analysis: 2-3 frasi in italiano sul profilo generale. Non ripetere i numeri, aggiungi sfumature.

pace_note: 1 frase in italiano sul ritmo ideale della giornata. Deve essere actionable per il Planner. Esempio: "Preferisce una mattina con un'attività principale e pomeriggio libero per esplorare a piedi senza fretta."

REGOLE GENERALI:
- Non inventare informazioni non deducibili dai dati: usa il valore centrale (3 per i numerici, "mixed"/"moderate" per i categorici) se non hai elementi sufficienti
- Se gli interessi specifici per il viaggio contraddicono il profilo generale, hanno PRIORITÀ ASSOLUTA
- raw_analysis e pace_note in italiano, personality_tags in inglese minuscolo
- Output: solo JSON, nessun altro testo`

  const tripNotesLine = profile.trip_notes?.trim()
    ? `Interessi specifici per questo viaggio: ${profile.trip_notes.trim()}`
    : 'Interessi specifici per questo viaggio: N/D'

  const user = `Analizza questo viaggiatore e restituisci il JSON del profilo:

Nome: ${profile.full_name ?? 'N/D'}
Età: ${age}
Nazionalità: ${profile.nationality ?? 'N/D'}
Lingue parlate: ${profile.languages.join(', ') || 'N/D'}
Interessi generali: ${profile.travel_interests.join(', ') || 'N/D'}
${tripNotesLine}`

  const fallback: TravelerProfileOutput = {
    adventure_level: 3, cultural_interest: 3, food_focus: 3,
    pace_preference: 3, social_openness: 3, novelty_seeking: 3,
    mobility_level: 'moderate', travel_style: 'mixed',
    language_comfort: 'english_ok', personality_tags: ['explorer'],
    raw_analysis: 'Profilo non disponibile.',
    pace_note: 'Ritmo standard, equilibrio tra attività e riposo.',
  }

  try {
    const raw = await callGroqAgent(system, user, 600)
    return validatePsychologistOutput(JSON.parse(raw))
  } catch {
    return fallback
  }
}

// ── Agente 5: Packing Assistant ───────────────────────────────
const PACKING_FALLBACK = [
  '🛂 Documenti (passaporto/carta d\'identità)', '💳 Carte e contanti',
  '🔌 Caricabatterie e power bank', '🔄 Adattatore prese elettriche',
  '💊 Farmaci personali', '🪥 Necessaire (spazzolino, dentifricio…)',
  '👕 Cambi di vestiti', '🧥 Giacca adatta al meteo',
  '🕶️ Occhiali da sole / crema solare', '📱 SIM/eSIM o piano dati',
  '🎧 Auricolari', '🧴 Articoli da bagno',
]
const MONTHS_IT = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']

export async function runPackingAgent(
  destination: string, startDate: string | null, endDate: string | null,
): Promise<string[]> {
  let durationDays = 0
  let monthHint = ''
  if (startDate) {
    const s = new Date(startDate + 'T00:00:00')
    monthHint = MONTHS_IT[s.getMonth()]
    if (endDate) {
      const e = new Date(endDate + 'T00:00:00')
      durationDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
    }
  }

  const system = `Sei un assistente di viaggio esperto nel preparare la valigia.
Genera una checklist di cose da portare PERSONALIZZATA in base a:
- la destinazione (clima, tipo di luogo: mare/montagna/città/…)
- la durata del viaggio (quantità di vestiti/articoli)
- il clima TIPICO del periodo indicato (ragiona sul mese/stagione, non su una previsione precisa)

REGOLE:
- 12-18 voci, ognuna breve e concreta, in italiano
- ogni voce inizia con un'emoji pertinente
- includi abbigliamento adatto al meteo del periodo (es. dicembre a Vienna → cappotto, sciarpa, guanti)
- adatta le quantità alla durata (es. viaggio lungo → più cambi)
- includi sempre essenziali: documenti, denaro, caricabatterie, farmaci, necessaire
- NON aggiungere spiegazioni, restituisci SOLO JSON

Formato: {"items": ["🛂 ...", "🧥 ...", ...]}`

  const user = `Destinazione: ${destination || 'N/D'}
Periodo: ${startDate ? `dal ${startDate}${endDate ? ` al ${endDate}` : ''}` : 'N/D'}${monthHint ? ` (mese: ${monthHint})` : ''}
Durata: ${durationDays > 0 ? `${durationDays} giorni` : 'N/D'}

Genera la checklist valigia.`

  try {
    const raw    = await callGroqAgent(system, user, 1200)
    const parsed = JSON.parse(raw) as { items?: unknown }
    const items  = Array.isArray(parsed.items)
      ? parsed.items.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : []
    return items.length >= 6 ? items.slice(0, 18) : PACKING_FALLBACK
  } catch {
    return PACKING_FALLBACK
  }
}
