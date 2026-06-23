// ============================================================
// src/lib/agents.ts
// Agenti LLM per il Modulo K — usa Groq (gratuito)
// ============================================================

import type { DayForecast, CONDITION_LABELS } from './weather'

// ── Chiamata LLM via Groq (riusa la stessa logica del scheduling) ──

async function callGroqAgent(
  system: string,
  user: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY non configurata')

  const models = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant']
  let lastErr: Error | null = null

  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user',   content: user },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          max_tokens:  2048,
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

// ── Tipi degli output agenti ───────────────────────────────────

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
  type:          'reschedule' | 'swap_indoor' | 'new_activity' | 'weather_alert'
  title:         string
  body:          string
  priority:      number  // 0 basso → 10 urgente
  activity_data?: {        // se type = 'new_activity' → aggiungibile con 1 clic
    title:    string
    notes:    string | null
    location: string | null
    time_start: string | null
  }
}

export interface TravelPlannerOutput {
  suggestions: ActivitySuggestion[]
}

export interface TravelerProfileOutput {
  adventure_level:   number   // 1-5
  cultural_interest: number   // 1-5
  food_focus:        number   // 1-5
  personality_tags:  string[]
  raw_analysis:      string
}

// ── Agente 2: Il Meteorologo ──────────────────────────────────
// Input: previsioni meteo + attività pianificate
// Output: conflitti identificati + severity

export async function runMeteorologoAgent(
  destination: string,
  forecasts:   DayForecast[],
  activities:  Array<{
    title:         string
    notes:         string | null
    location:      string | null
    time_start:    string | null
    activity_date: string | null
  }>,
): Promise<MeteorologoOutput> {
  const system = `Sei il Meteorologo esperto di un sistema di pianificazione viaggi.
Analizzi le previsioni meteo COMPLETE e identifichi rischi e conflitti per le attività pianificate.

Devi considerare TUTTI questi fattori, non solo il cielo:
- CONDIZIONE DEL CIELO: pioggia, temporale, neve, sole, nuvoloso
- TEMPERATURA REALE vs PERCEPITA: >35°C percepiti = rischio colpo di calore per attività intense; <5°C = disagio per visite all'aperto prolungate
- INDICE UV: >6 = protezione obbligatoria; >8 = rischio ustioni in 20 min per pelli chiare; evitare ore 11-15 in pieno sole
- VENTO: >40 km/h = disagio per passeggiate, instabilità strutture temporanee, fermate prendere mezzi pubblici
- PROBABILITÀ PIOGGIA: >50% = pianificare alternative; >80% = sconsigliato outdoor
- PRECIPITAZIONI TOTALI: >5mm = bagnato significativo; >20mm = allerta maltempo

Per ogni combinazione ragiona su: impatto reale sull'esperienza del viaggiatore, non solo sulla sicurezza.
Un giorno con 32°C percepiti e UV 9 non è "pericoloso" ma rende pessima la visita a rovine all'aperto alle 13:00.

Restituisci SOLO JSON valido.`

  const forecastText = forecasts.map(f =>
    `${f.date}: ${f.condition} | ` +
    `Temp: ${f.temp_min}°C-${f.temp_max}°C (percepita ${f.apparent_temp_min}°C-${f.apparent_temp_max}°C) | ` +
    `Pioggia: ${f.precipitation}mm (prob. ${f.precipitation_prob}%) | ` +
    `Vento: ${f.windspeed_max} km/h | ` +
    `UV: ${f.uv_index} | ` +
    `Comfort outdoor: ${f.comfort_score}/10`
  ).join('\n')

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
// Input: conflitti meteo + itinerario completo
// Output: suggerimenti prioritizzati

export async function runTravelPlannerWeatherAgent(
  destination:       string,
  meteoAnalysis:     MeteorologoOutput,
  allActivities:     Array<{ title: string; activity_date: string | null; time_start: string | null; location: string | null; notes: string | null }>,
  forecasts:         DayForecast[],
): Promise<TravelPlannerOutput> {
  if (meteoAnalysis.conflicts.length === 0) {
    return { suggestions: [] }
  }

  const system = `Sei il Travel Planner AI di Wanderly. Ricevi un'analisi meteo con conflitti e devi generare suggerimenti pratici per ottimizzare l'itinerario.

Per ogni conflitto proponi azioni concrete:
- "reschedule": sposta un'attività outdoor in una finestra meteo migliore
- "swap_indoor": sostituisci con un'alternativa al chiuso (museo, ristorante tipico, mercato coperto, spa)
- "new_activity": proponi una nuova attività indoor adatta alla destinazione e al meteo
- "weather_alert": avvisa l'utente senza suggerire modifiche (per conflitti lievi)

Priorità: 0 = informativo, 5 = consigliato, 10 = urgente

Restituisci SOLO JSON valido.`

  const conflictsText = JSON.stringify(meteoAnalysis.conflicts, null, 2)
  const itineraryText = allActivities.map(a =>
    `- "${a.title}" ${a.activity_date ?? 'data N/D'} ${a.time_start ?? ''}`
  ).join('\n')
  const goodDays = forecasts
    .filter(f => f.is_outdoor_safe)
    .map(f => `${f.date} (comfort ${f.comfort_score}/10, ${f.temp_max}°C percepiti ${f.apparent_temp_max}°C, UV ${f.uv_index})`)
    .join('; ')

  const user = `Destinazione: ${destination}
Giorni con meteo favorevole: ${goodDays || 'nessuno'}

Riassunto analisi meteo: ${meteoAnalysis.overall_summary}

Conflitti identificati:
${conflictsText}

Itinerario corrente:
${itineraryText}

Genera suggerimenti pratici e restituisci:
{
  "suggestions": [
    {
      "type": "reschedule|swap_indoor|new_activity|weather_alert",
      "title": "Titolo breve del suggerimento",
      "body": "Spiegazione dettagliata del suggerimento",
      "priority": 0-10,
      "activity_data": {
        "title": "Nome attività (solo per new_activity)",
        "notes": "Note",
        "location": "Luogo",
        "time_start": "HH:MM o null"
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

// ── Agente 1: Lo Psicologo (usato nel Modulo K) ───────────────
// Input: profilo utente completo
// Output: profilo viaggiatore strutturato

export async function runPsicologoAgent(
  profile: {
    full_name:        string | null
    nationality:      string | null
    birth_date:       string | null
    gender:           string | null
    languages:        string[]
    travel_interests: string[]
  },
): Promise<TravelerProfileOutput> {
  const system = `Sei uno psicologo specializzato nell'analisi dei profili dei viaggiatori.
Basandoti sui dati anagrafici e sugli interessi di viaggio dell'utente, costruisci un profilo
viaggiatore dettagliato che verrà usato per personalizzare le raccomandazioni di viaggio.

Restituisci SOLO JSON valido.`

  const user = `Analizza questo profilo viaggiatore:

Nome: ${profile.full_name ?? 'N/D'}
Nazionalità: ${profile.nationality ?? 'N/D'}
Data di nascita: ${profile.birth_date ?? 'N/D'}
Genere: ${profile.gender ?? 'N/D'}
Lingue: ${profile.languages.join(', ') || 'N/D'}
Interessi di viaggio: ${profile.travel_interests.join(', ') || 'N/D'}

Costruisci un profilo e restituisci:
{
  "adventure_level": 1-5,
  "cultural_interest": 1-5,
  "food_focus": 1-5,
  "personality_tags": ["explorer", "foodie", "history_buff", ecc.],
  "raw_analysis": "Analisi narrativa del profilo viaggiatore in italiano (2-3 frasi)"
}`

  try {
    const raw = await callGroqAgent(system, user)
    return JSON.parse(raw) as TravelerProfileOutput
  } catch {
    return {
      adventure_level: 3, cultural_interest: 3, food_focus: 3,
      personality_tags: [], raw_analysis: 'Profilo non disponibile.',
    }
  }
}
