'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchForecast } from '@/lib/weather'
import { runMeteorologoAgent, runTravelPlannerWeatherAgent } from '@/lib/agents'

type ActivityRow = {
  title: string; notes: string | null; location: string | null
  time_start: string | null; activity_date: string | null
}

export async function refreshTripSuggestions(tripId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Verifica membership
  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { error: 'Accesso negato' }

  // Carica destinazione
  const { data: tripRaw } = await supabase
    .from('trips').select('id, name, destination').eq('id', tripId).single()
  const trip = tripRaw as { id: string; name: string; destination: string | null } | null
  if (!trip?.destination) return { error: 'Nessuna destinazione impostata per questo viaggio' }

  // Fetch meteo
  const forecasts = await fetchForecast(trip.destination, 7)
  if (forecasts.length === 0) return { error: 'Previsioni meteo non disponibili per questa destinazione' }

  // Carica attività
  const { data: activitiesRaw } = await supabase
    .from('activities').select('title, notes, location, time_start, activity_date').eq('trip_id', tripId)
  const activities = (activitiesRaw ?? []) as ActivityRow[]

  // Agenti LLM
  const meteoOutput = await runMeteorologoAgent(trip.destination, forecasts, activities)
  const plannerOutput = await runTravelPlannerWeatherAgent(trip.destination, meteoOutput, activities, forecasts)

  // DELETE + INSERT trip_suggestions (mantiene solo il set più recente)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  await db.from('trip_suggestions').delete().eq('trip_id', tripId)

  const toInsert = [
    ...(meteoOutput.overall_summary ? [{
      trip_id: tripId, type: 'weather_alert',
      title: '🌤️ Previsioni aggiornate', body: meteoOutput.overall_summary, priority: 0,
    }] : []),
    ...plannerOutput.suggestions.map(s => ({
      trip_id: tripId, type: s.type, title: s.title,
      body: s.body, activity_data: s.activity_data ?? null, priority: s.priority,
    })),
  ]

  if (toInsert.length > 0) {
    await db.from('trip_suggestions').insert(toInsert)
  }

  return { success: true, count: toInsert.length }
}
