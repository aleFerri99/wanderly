// ============================================================
// src/app/api/cron/weather/route.ts
// Cron job giornaliero (12:00 ora italiana = 10:00 UTC)
// Configurato in vercel.json — chiamato da Vercel Cron
// ============================================================

import { NextResponse }              from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { fetchForecast }             from '@/lib/weather'
import { runMeteorologoAgent, runTravelPlannerWeatherAgent } from '@/lib/agents'

// Client senza generic <Database>: il service-role ha bisogno di accedere
// alle nuove tabelle (weather_cache, trip_suggestions) non ancora nel tipo.
// I tipi di ritorno vengono dichiarati inline dove necessario.
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Tipi locali per le query parziali
type DayRow  = { trip_id: string; date: string | null; date_end: string | null }
type TripRow = { id: string; name: string; destination: string | null }
type ActivityRow = {
  title: string; notes: string | null; location: string | null
  time_start: string | null; activity_date: string | null
}

export async function GET(request: Request) {
  // ── Autenticazione cron ────────────────────────────────────
  const authHeader = request.headers.get('Authorization')
  const secret     = process.env.CRON_SECRET
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const results: string[] = []

  try {
    // ── 1. Trova i viaggi con tappe nei prossimi 2 giorni ─────
    const today     = new Date()
    const inTwoDays = new Date(today)
    inTwoDays.setDate(today.getDate() + 2)
    const todayStr     = today.toISOString().split('T')[0]
    const inTwoDaysStr = inTwoDays.toISOString().split('T')[0]

    const { data: daysRaw } = await supabase
      .from('days')
      .select('trip_id, date, date_end')
      .or(`date.gte.${todayStr},date_end.gte.${todayStr}`)
      .lte('date', inTwoDaysStr)

    const days = (daysRaw ?? []) as DayRow[]
    if (days.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nessun viaggio nei prossimi 2 giorni' })
    }

    // Raggruppa per trip_id (un solo check per viaggio)
    const tripIds = [...new Set(days.map(d => d.trip_id))]

    for (const tripId of tripIds) {
      try {
        // ── 2. Carica info viaggio + destinazione ──────────────
        const { data: tripRaw } = await supabase
          .from('trips')
          .select('id, name, destination')
          .eq('id', tripId)
          .single()

        const trip = tripRaw as TripRow | null
        if (!trip?.destination) {
          results.push(`[${tripId}] Skipped: nessuna destinazione`)
          continue
        }

        // ── 3. Fetch previsioni Open-Meteo ─────────────────────
        const forecasts = await fetchForecast(trip.destination, 7)
        if (forecasts.length === 0) {
          results.push(`[${trip.name}] Errore: previsioni non disponibili`)
          continue
        }

        // ── 4. UPSERT weather_cache ────────────────────────────
        await supabase.from('weather_cache').upsert(
          forecasts.map(f => ({
            trip_id:            tripId,
            forecast_date:      f.date,
            destination:        trip.destination!,
            condition:          f.condition,
            temp_max:           f.temp_max,
            temp_min:           f.temp_min,
            apparent_temp_max:  f.apparent_temp_max,
            apparent_temp_min:  f.apparent_temp_min,
            precipitation:      f.precipitation,
            precipitation_prob: f.precipitation_prob,
            windspeed_max:      f.windspeed_max,
            uv_index:           f.uv_index,
            weather_code:       f.weather_code,
            comfort_score:      f.comfort_score,
            fetched_at:         new Date().toISOString(),
          })),
          { onConflict: 'trip_id,forecast_date' }
        )

        // ── 5. Carica attività del viaggio ─────────────────────
        const { data: activitiesRaw } = await supabase
          .from('activities')
          .select('title, notes, location, time_start, activity_date')
          .eq('trip_id', tripId)

        const activities = (activitiesRaw ?? []) as ActivityRow[]
        if (activities.length === 0) {
          results.push(`[${trip.name}] Nessuna attività — skip agenti`)
          continue
        }

        // ── 6. Agente Meteorologo ──────────────────────────────
        const meteoOutput = await runMeteorologoAgent(
          trip.destination,
          forecasts,
          activities,
        )

        // ── 7. Agente Travel Planner ───────────────────────────
        const plannerOutput = await runTravelPlannerWeatherAgent(
          trip.destination,
          meteoOutput,
          activities,
          forecasts,
        )

        // ── 8. DELETE + INSERT trip_suggestions ────────────────
        await supabase
          .from('trip_suggestions')
          .delete()
          .eq('trip_id', tripId)

        const suggestionsToInsert = [
          ...(meteoOutput.overall_summary ? [{
            trip_id:  tripId,
            type:     'weather_alert' as const,
            title:    '🌤️ Previsioni aggiornate',
            body:     meteoOutput.overall_summary,
            priority: 0,
          }] : []),
          ...plannerOutput.suggestions.map(s => ({
            trip_id:       tripId,
            type:          s.type,
            title:         s.title,
            body:          s.body,
            activity_data: s.activity_data ?? null,
            priority:      s.priority,
          })),
        ]

        if (suggestionsToInsert.length > 0) {
          await supabase.from('trip_suggestions').insert(suggestionsToInsert)
        }

        results.push(
          `[${trip.name}] ✓ ${forecasts.length} giorni meteo · ` +
          `${meteoOutput.conflicts.length} conflitti · ` +
          `${plannerOutput.suggestions.length} suggerimenti`
        )
      } catch (tripErr) {
        results.push(`[${tripId}] Errore: ${(tripErr as Error).message}`)
      }
    }

    return NextResponse.json({ ok: true, processed: tripIds.length, results })
  } catch (err) {
    console.error('[cron/weather]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
