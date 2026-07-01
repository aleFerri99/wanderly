// Edge Function "weather-cron" — porta il cron meteo (ex Vercel) su Supabase.
// Chiamata da pg_cron via pg_net (header x-cron-secret). Service-role, tutti i
// viaggi con tappe nei prossimi 2 giorni: Open-Meteo → agenti Groq → trip_suggestions.
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient } from '../_shared/client.ts'
import { fetchForecast } from '../_shared/weather.ts'
import { runMeteorologoAgent, runTravelPlannerWeatherAgent } from '../_shared/agents.ts'

type DayRow      = { trip_id: string; date: string | null; date_end: string | null }
type TripRow     = { id: string; name: string; destination: string | null }
type ActivityRow = { title: string; notes: string | null; location: string | null; time_start: string | null; activity_date: string | null; day?: { date: string | null; date_end: string | null } | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Autorizzazione cron: header segreto (il gateway è aperto via verify_jwt=false)
  const secret = Deno.env.get('CRON_SECRET')
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const db = adminClient()
  const results: string[] = []

  try {
    const today = new Date()
    const inTwoDays = new Date(today); inTwoDays.setDate(today.getDate() + 2)
    const todayStr     = today.toISOString().split('T')[0]
    const inTwoDaysStr = inTwoDays.toISOString().split('T')[0]

    // Pruning previsioni passate (contiene la crescita del DB)
    await db.from('weather_cache').delete().lt('forecast_date', todayStr)

    // Viaggi con tappe nei prossimi 2 giorni
    const { data: daysRaw } = await db
      .from('days').select('trip_id, date, date_end')
      .or(`date.gte.${todayStr},date_end.gte.${todayStr}`).lte('date', inTwoDaysStr)
    const days = (daysRaw ?? []) as DayRow[]
    if (days.length === 0) return json({ ok: true, message: 'Nessun viaggio nei prossimi 2 giorni' })

    const tripIds = [...new Set(days.map(d => d.trip_id))]

    for (const tripId of tripIds) {
      try {
        const { data: tripRaw } = await db.from('trips').select('id, name, destination').eq('id', tripId).single()
        const trip = tripRaw as TripRow | null
        if (!trip?.destination) { results.push(`[${tripId}] skip: nessuna destinazione`); continue }

        const forecasts = await fetchForecast(trip.destination, 7)
        if (forecasts.length === 0) { results.push(`[${trip.name}] previsioni non disponibili`); continue }

        await db.from('weather_cache').upsert(
          forecasts.map(f => ({
            trip_id: tripId, forecast_date: f.date, destination: trip.destination!,
            condition: f.condition, temp_max: f.temp_max, temp_min: f.temp_min,
            apparent_temp_max: f.apparent_temp_max, apparent_temp_min: f.apparent_temp_min,
            precipitation: f.precipitation, precipitation_prob: f.precipitation_prob,
            windspeed_max: f.windspeed_max, uv_index: f.uv_index, weather_code: f.weather_code,
            comfort_score: f.comfort_score, fetched_at: new Date().toISOString(),
          })),
          { onConflict: 'trip_id,forecast_date' },
        )

        const { data: activitiesRaw } = await db
          .from('activities').select('title, notes, location, time_start, activity_date, day:days!day_id ( date, date_end )').eq('trip_id', tripId)
        const activities = ((activitiesRaw ?? []) as ActivityRow[]).map(a => ({ ...a, activity_date: a.activity_date ?? a.day?.date ?? null }))
        if (activities.length === 0) { results.push(`[${trip.name}] nessuna attività — skip agenti`); continue }

        const meteoOutput   = await runMeteorologoAgent(trip.destination, forecasts, activities)
        const plannerOutput = await runTravelPlannerWeatherAgent(trip.destination, meteoOutput, activities, forecasts)

        await db.from('trip_suggestions').delete().eq('trip_id', tripId)
        const toInsert = [
          ...(meteoOutput.overall_summary ? [{
            trip_id: tripId, type: 'weather_alert', title: '🌤️ Previsioni aggiornate',
            body: meteoOutput.overall_summary, priority: 0,
          }] : []),
          ...plannerOutput.suggestions.map(s => ({
            trip_id: tripId, type: s.type, title: s.title, body: s.body,
            activity_data: s.activity_data ? { ...s.activity_data, replaces: s.replaces ?? null } : null,
            priority: s.priority,
          })),
        ]
        if (toInsert.length > 0) await db.from('trip_suggestions').insert(toInsert)

        results.push(`[${trip.name}] ✓ ${forecasts.length}gg · ${meteoOutput.conflicts.length} conflitti · ${plannerOutput.suggestions.length} suggerimenti`)
      } catch (tripErr) {
        results.push(`[${tripId}] errore: ${(tripErr as Error).message}`)
      }
    }

    return json({ ok: true, processed: tripIds.length, results })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
