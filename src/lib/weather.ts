// ============================================================
// src/lib/weather.ts
// Open-Meteo API — gratuita, nessuna chiave richiesta
// Documentazione: https://open-meteo.com/en/docs
// ============================================================

export type WeatherCondition =
  | 'clear' | 'cloudy' | 'foggy' | 'rainy' | 'showers' | 'snowy' | 'stormy'

export interface DayForecast {
  date:                  string
  condition:             WeatherCondition
  temp_max:              number
  temp_min:              number
  apparent_temp_max:     number   // temperatura percepita (feels-like)
  apparent_temp_min:     number
  precipitation:         number   // mm totali
  precipitation_prob:    number   // probabilità pioggia 0-100%
  windspeed_max:         number   // km/h
  uv_index:              number   // 0-11+
  weather_code:          number
  is_outdoor_safe:       boolean
  comfort_score:         number   // 1-10: qualità giornata per attività outdoor
}

// WMO Weather Interpretation Codes → condizione leggibile
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

export const CONDITION_LABELS: Record<WeatherCondition, string> = {
  clear:   '☀️ Sereno',
  cloudy:  '⛅ Nuvoloso',
  foggy:   '🌫️ Nebbia',
  rainy:   '🌧️ Pioggia',
  showers: '🌦️ Rovesci',
  snowy:   '❄️ Neve',
  stormy:  '⛈️ Temporale',
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

// Recupera le previsioni a 7 giorni per una destinazione
export async function fetchForecast(
  destination: string,
  daysAhead = 7,
): Promise<DayForecast[]> {
  const coords = await geocodeDestination(destination)
  if (!coords) return []

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude',      String(coords.lat))
    url.searchParams.set('longitude',     String(coords.lng))
    url.searchParams.set('daily', [
      'weathercode',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',   // temperatura percepita (caldo/freddo umido)
      'apparent_temperature_min',
      'precipitation_sum',          // mm totali
      'precipitation_probability_max', // probabilità pioggia 0-100
      'windspeed_10m_max',          // km/h
      'uv_index_max',               // indice UV 0-11+
    ].join(','))
    url.searchParams.set('timezone',      'auto')
    url.searchParams.set('forecast_days', String(daysAhead))

    const res = await fetch(url.toString())
    if (!res.ok) return []
    const data = await res.json()
    const d = data.daily

    return (d.time as string[]).map((date: string, i: number) => {
      const code       = d.weathercode[i]              as number
      const condition  = classifyWeatherCode(code)
      const precip     = (d.precipitation_sum[i]       as number) ?? 0
      const precipProb = (d.precipitation_probability_max[i] as number) ?? 0
      const wind       = (d.windspeed_10m_max[i]       as number) ?? 0
      const uvIdx      = (d.uv_index_max[i]            as number) ?? 0
      const appMax     = (d.apparent_temperature_max[i] as number) ?? d.temperature_2m_max[i]
      const appMin     = (d.apparent_temperature_min[i] as number) ?? d.temperature_2m_min[i]

      // Sicuro per attività outdoor: niente temporali/pioggia intensa,
      // vento moderato, temperatura percepita vivibile, UV non estremo
      const is_outdoor_safe =
        condition !== 'stormy' &&
        condition !== 'rainy'  &&
        precip     < 3         &&
        precipProb < 60        &&
        wind       < 50        &&  // raffica moderata
        appMax     < 40        &&  // non troppo caldo
        appMin     > -5        &&  // non troppo freddo
        uvIdx      < 9             // UV non pericoloso

      // Punteggio comfort 1-10 per aiutare il LLM a valutare la qualità
      let comfort = 10
      if (!is_outdoor_safe)     comfort -= 4
      if (uvIdx >= 7)           comfort -= 2
      else if (uvIdx >= 5)      comfort -= 1
      if (appMax >= 35)         comfort -= 2
      else if (appMax >= 30)    comfort -= 1
      if (wind >= 30)           comfort -= 1
      if (precipProb >= 40)     comfort -= 1
      comfort = Math.max(1, comfort)

      return {
        date,
        condition,
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
      }
    })
  } catch { return [] }
}
