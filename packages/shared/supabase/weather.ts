// ============================================================
// src/lib/weather.ts
// Open-Meteo API — gratuita, nessuna chiave richiesta
// Dati giornalieri + orari per analisi fascia-per-fascia
// ============================================================

export type WeatherCondition =
  | 'clear' | 'cloudy' | 'foggy' | 'rainy' | 'showers' | 'snowy' | 'stormy'

export interface TimeSlot {
  slot:               'mattina' | 'pomeriggio' | 'sera'
  hours:              string          // "06:00-12:00"
  condition:          WeatherCondition
  temp_avg:           number          // °C media nello slot
  apparent_temp_avg:  number          // percepita media
  precipitation:      number          // mm totali nello slot
  precipitation_prob: number          // prob max nello slot (0-100)
  windspeed_max:      number          // km/h max
  uv_index_max:       number
  is_outdoor_safe:    boolean
}

export interface DayForecast {
  date:                  string
  condition:             WeatherCondition
  temp_max:              number
  temp_min:              number
  apparent_temp_max:     number
  apparent_temp_min:     number
  precipitation:         number
  precipitation_prob:    number
  windspeed_max:         number
  uv_index:              number
  weather_code:          number
  is_outdoor_safe:       boolean
  comfort_score:         number        // 1-10
  hourly_slots:          TimeSlot[]    // mattina / pomeriggio / sera
}

// WMO Weather Interpretation Codes → condizione
export function classifyWeatherCode(code: number): WeatherCondition {
  if (code === 0)                        return 'clear'
  if (code <= 3)                         return 'cloudy'
  if (code === 45 || code === 48)        return 'foggy'
  if (code >= 51 && code <= 67)         return 'rainy'
  if (code >= 71 && code <= 77)         return 'snowy'
  if (code >= 80 && code <= 82)         return 'showers'
  if (code >= 95)                        return 'stormy'
  return 'cloudy'
}

// Severità numerica di un codice WMO (per trovare la condizione peggiore nello slot)
function codeSeverity(code: number): number {
  if (code >= 95) return 6   // stormy
  if (code >= 80) return 5   // showers
  if (code >= 51) return 4   // rainy
  if (code >= 71) return 3   // snowy
  if (code === 45 || code === 48) return 2  // foggy
  if (code <= 3)  return 1   // clear/cloudy
  return 1
}

export const CONDITION_LABELS: Record<WeatherCondition, string> = {
  clear:   '☀️ Sereno',
  cloudy:  '⛅ Nuvoloso',
  foggy:   '🌫️ Nebbia',
  rainy:   '🌧️ Pioggia',
  showers: '🌦️ Rovesci',
  snowy:   '❄️ Neve',
  stormy:  '⛈️ Temporale',
}

const SLOT_DEFS: { slot: TimeSlot['slot']; startH: number; endH: number }[] = [
  { slot: 'mattina',    startH: 6,  endH: 12 },
  { slot: 'pomeriggio', startH: 12, endH: 18 },
  { slot: 'sera',       startH: 18, endH: 24 },
]

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
}

// Calcola le 3 fasce orarie per un giorno specifico
function computeSlots(
  dayDate:   string,
  times:     string[],   // "YYYY-MM-DDTHH:00"
  temp:      number[],
  apparent:  number[],
  precip:    number[],
  precipProb: number[],
  wind:      number[],
  uv:        number[],
  codes:     number[],
): TimeSlot[] {
  return SLOT_DEFS.map(({ slot, startH, endH }) => {
    const idx: number[] = []
    for (let i = 0; i < times.length; i++) {
      const [date, time] = times[i].split('T')
      const h = parseInt(time?.split(':')[0] ?? '0', 10)
      if (date === dayDate && h >= startH && h < endH) idx.push(i)
    }

    const hours = `${String(startH).padStart(2, '0')}:00-${endH === 24 ? '00' : String(endH).padStart(2, '0')}:00`

    if (idx.length === 0) {
      return { slot, hours, condition: 'clear', temp_avg: 20, apparent_temp_avg: 20,
               precipitation: 0, precipitation_prob: 0, windspeed_max: 0, uv_index_max: 0, is_outdoor_safe: true }
    }

    const temps      = idx.map(i => temp[i] ?? 0)
    const apparents  = idx.map(i => apparent[i] ?? temp[i] ?? 0)
    const precipVals = idx.map(i => precip[i] ?? 0)
    const precipProbs= idx.map(i => precipProb[i] ?? 0)
    const winds      = idx.map(i => wind[i] ?? 0)
    const uvs        = idx.map(i => uv[i] ?? 0)
    const codeVals   = idx.map(i => codes[i] ?? 0)

    const worstCode = codeVals.reduce((w, c) => codeSeverity(c) > codeSeverity(w) ? c : w, codeVals[0])
    const condition          = classifyWeatherCode(worstCode)
    const temp_avg           = Math.round(avg(temps) * 10) / 10
    const apparent_temp_avg  = Math.round(avg(apparents) * 10) / 10
    const precipitation      = Math.round(precipVals.reduce((s, v) => s + v, 0) * 10) / 10
    const precipitation_prob = Math.max(...precipProbs)
    const windspeed_max      = Math.round(Math.max(...winds))
    const uv_index_max       = Math.round(Math.max(...uvs) * 10) / 10

    const is_outdoor_safe =
      condition !== 'stormy' &&
      condition !== 'rainy'  &&
      precipitation      < 2   &&
      precipitation_prob < 60  &&
      windspeed_max      < 50  &&
      apparent_temp_avg  < 40  &&
      apparent_temp_avg  > -5  &&
      uv_index_max       < 9

    return { slot, hours, condition, temp_avg, apparent_temp_avg,
             precipitation, precipitation_prob, windspeed_max, uv_index_max, is_outdoor_safe }
  })
}

// Geocodifica la destinazione → coordinate (Open-Meteo Geocoding API)
export async function geocodeDestination(
  destination: string,
): Promise<{ lat: number; lng: number } | null> {
  const city = destination.split(',')[0].trim()
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=it&format=json`
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data.results?.[0]) return null
    return { lat: data.results[0].latitude, lng: data.results[0].longitude }
  } catch { return null }
}

// Previsioni fino a 16 giorni: dati giornalieri + orari per analisi a fasce
export async function fetchForecast(
  destination: string,
  daysAhead = 7,
): Promise<DayForecast[]> {
  const coords = await geocodeDestination(destination)
  if (!coords) return []

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude',  String(coords.lat))
    url.searchParams.set('longitude', String(coords.lng))
    url.searchParams.set('daily', [
      'weathercode', 'temperature_2m_max', 'temperature_2m_min',
      'apparent_temperature_max', 'apparent_temperature_min',
      'precipitation_sum', 'precipitation_probability_max',
      'windspeed_10m_max', 'uv_index_max',
    ].join(','))
    url.searchParams.set('hourly', [
      'temperature_2m', 'apparent_temperature',
      'precipitation', 'precipitation_probability',
      'windspeed_10m', 'uv_index', 'weathercode',
    ].join(','))
    url.searchParams.set('timezone',      'auto')
    url.searchParams.set('forecast_days', String(daysAhead))

    const res = await fetch(url.toString())
    if (!res.ok) return []
    const data = await res.json()
    const d = data.daily
    const h = data.hourly   // dati orari paralleli

    return (d.time as string[]).map((date: string, i: number) => {
      const code       = d.weathercode[i]                    as number
      const condition  = classifyWeatherCode(code)
      const precip     = (d.precipitation_sum[i]             as number) ?? 0
      const precipProb = (d.precipitation_probability_max[i] as number) ?? 0
      const wind       = (d.windspeed_10m_max[i]             as number) ?? 0
      const uvIdx      = (d.uv_index_max[i]                  as number) ?? 0
      const appMax     = (d.apparent_temperature_max[i]       as number) ?? d.temperature_2m_max[i]
      const appMin     = (d.apparent_temperature_min[i]       as number) ?? d.temperature_2m_min[i]

      const is_outdoor_safe =
        condition !== 'stormy' && condition !== 'rainy' &&
        precip < 3 && precipProb < 60 && wind < 50 &&
        appMax < 40 && appMin > -5 && uvIdx < 9

      let comfort = 10
      if (!is_outdoor_safe)  comfort -= 4
      if (uvIdx >= 7)        comfort -= 2
      else if (uvIdx >= 5)   comfort -= 1
      if (appMax >= 35)      comfort -= 2
      else if (appMax >= 30) comfort -= 1
      if (wind >= 30)        comfort -= 1
      if (precipProb >= 40)  comfort -= 1
      comfort = Math.max(1, comfort)

      const hourly_slots = h?.time ? computeSlots(
        date,
        h.time              as string[],
        h.temperature_2m    as number[],
        h.apparent_temperature as number[],
        h.precipitation     as number[],
        h.precipitation_probability as number[],
        h.windspeed_10m     as number[],
        h.uv_index          as number[],
        h.weathercode       as number[],
      ) : []

      return {
        date, condition,
        temp_max:           d.temperature_2m_max[i] as number,
        temp_min:           d.temperature_2m_min[i] as number,
        apparent_temp_max:  appMax,
        apparent_temp_min:  appMin,
        precipitation:      precip,
        precipitation_prob: precipProb,
        windspeed_max:      wind,
        uv_index:           uvIdx,
        weather_code:       code,
        is_outdoor_safe,
        comfort_score:      comfort,
        hourly_slots,
      }
    })
  } catch { return [] }
}
