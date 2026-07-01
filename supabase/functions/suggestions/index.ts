// Edge Function "suggestions" — porta refreshTripSuggestions (web) su Supabase.
// Orchestrazione: meteo (Open-Meteo) → agenti Groq → scrive trip_suggestions.
// Tutte le letture/scritture passano per il client user-scoped (RLS): l'utente
// deve essere membro del viaggio (come nell'action web). Nessun service-role.
// Body: { tripId: string }
import { corsHeaders, json } from '../_shared/cors.ts'
import { userClient, getUser } from '../_shared/client.ts'
import { fetchForecast } from '../_shared/weather.ts'
import { runEnricher } from '../_shared/enricher.ts'
import {
  runMeteorologoAgent, runTravelPlannerWeatherAgent, runItineraryPlannerAgent,
  type TravelerProfileOutput,
} from '../_shared/agents.ts'

// Limite attività da arricchire: l'enricher fa chiamate sequenziali (Overpass
// fino a 12s l'una). Cap per restare nei limiti di tempo della Edge Function.
const ENRICH_CAP = 12

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await getUser(req)
    if (!user) return json({ error: 'Non autenticato' }, 401)

    const { tripId } = await req.json().catch(() => ({})) as { tripId?: string }
    if (!tripId) return json({ error: 'tripId mancante' }, 400)

    const db = userClient(req)

    // Membership
    const { data: mem } = await db
      .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).maybeSingle()
    if (!mem) return json({ error: 'Accesso negato' }, 403)

    // Trip
    const { data: tripRaw } = await db
      .from('trips').select('id, name, destination, start_date, end_date').eq('id', tripId).single()
    const trip = tripRaw as {
      id: string; name: string; destination: string | null
      start_date: string | null; end_date: string | null
    } | null
    if (!trip?.destination) return json({ error: 'Nessuna destinazione impostata per questo viaggio' }, 400)

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    let forecastDays = 7
    if (trip.end_date) {
      const tripEnd = new Date(trip.end_date + 'T00:00:00')
      const daysUntilEnd = Math.ceil((tripEnd.getTime() - today.getTime()) / 86400000)
      forecastDays = Math.min(Math.max(daysUntilEnd + 1, 3), 16)
    }

    // Profili obbligatori
    const { count: profileCount } = await db
      .from('traveler_profiles').select('*', { count: 'exact', head: true }).eq('trip_id', tripId)
    if (!profileCount || profileCount === 0) return json({ error: 'MISSING_PROFILES' }, 400)

    const forecasts = await fetchForecast(trip.destination, forecastDays)
    if (forecasts.length === 0) return json({ error: 'Previsioni meteo non disponibili per questa destinazione' }, 400)

    // Attività + data effettiva (dal giorno genitore se mancante)
    const { data: activitiesRaw } = await db
      .from('activities')
      .select('title, notes, location, time_start, activity_date, day:days!day_id ( date, date_end )')
      .eq('trip_id', tripId)

    type ActivityRow = {
      title: string; notes: string | null; location: string | null
      time_start: string | null; activity_date: string | null
      day: { date: string | null; date_end: string | null } | null
    }
    const activities: ActivityRow[] = ((activitiesRaw ?? []) as ActivityRow[]).map(a => ({
      ...a,
      activity_date: a.activity_date ?? a.day?.date ?? null,
    }))

    const forecastDates = new Set(forecasts.map(f => f.date))
    const activitiesInForecast = activities.filter(
      a => !a.activity_date || forecastDates.has(a.activity_date),
    )

    // Viaggio lontano (>7gg) → avviso informativo
    if (trip.start_date && trip.start_date > todayStr) {
      const daysToTrip = Math.ceil(
        (new Date(trip.start_date + 'T00:00:00').getTime() - today.getTime()) / 86400000,
      )
      if (daysToTrip > 7) {
        await db.from('trip_suggestions').delete().eq('trip_id', tripId)
        await db.from('trip_suggestions').insert([{
          trip_id: tripId, type: 'weather_alert', title: '📅 Viaggio in arrivo',
          body: `Il tuo viaggio inizia tra ${daysToTrip} giorni. Le previsioni meteo affidabili saranno disponibili entro 7 giorni dalla partenza — riapri questa sezione più vicino alla data.`,
          priority: 0,
        }])
        return json({ success: true, count: 1 })
      }
    }

    // Profili viaggiatori
    const { data: profilesRaw } = await db
      .from('traveler_profiles')
      .select('adventure_level, cultural_interest, food_focus, personality_tags, raw_analysis')
      .eq('trip_id', tripId)

    type ProfileRow = {
      adventure_level: number | null; cultural_interest: number | null
      food_focus: number | null; personality_tags: string[]; raw_analysis: string | null
    }
    const travelerProfiles: TravelerProfileOutput[] = ((profilesRaw ?? []) as ProfileRow[]).map(p => ({
      adventure_level:   p.adventure_level   ?? 3,
      cultural_interest: p.cultural_interest ?? 3,
      food_focus:        p.food_focus        ?? 3,
      personality_tags:  p.personality_tags  ?? [],
      raw_analysis:      p.raw_analysis      ?? '',
      pace_preference:   3,
      social_openness:   3,
      novelty_seeking:   3,
      mobility_level:    'moderate',
      travel_style:      'mixed',
      language_comfort:  'english_ok',
      pace_note:         '',
    }))

    // ── Branch A: itinerario vuoto → pianificazione completa ──────
    if (activitiesInForecast.length === 0) {
      const { data: daysRaw } = await db
        .from('days').select('title, date, date_end').eq('trip_id', tripId)
        .order('position', { ascending: true })

      if (!daysRaw?.length) {
        return json({ error: 'Aggiungi almeno una tappa alla timeline prima di generare suggerimenti.' }, 400)
      }

      const days = daysRaw as { title: string; date: string | null; date_end: string | null }[]
      const enricherA = await runEnricher(days.map(d => d.title).slice(0, ENRICH_CAP), trip.destination)

      const itineraryOutput = await runItineraryPlannerAgent(
        trip.destination,
        days,
        forecasts,
        travelerProfiles.length > 0 ? travelerProfiles : undefined,
        enricherA,
      )

      await db.from('trip_suggestions').delete().eq('trip_id', tripId)
      const toInsert = itineraryOutput.suggestions.map(s => ({
        trip_id: tripId, type: s.type, title: s.title,
        body: s.group_fit_reason ? `${s.body}\n\n{{group_fit}}${s.group_fit_reason}` : s.body,
        activity_data: s.activity_data ?? null, priority: s.priority,
      }))
      if (toInsert.length > 0) await db.from('trip_suggestions').insert(toInsert)
      return json({ success: true, count: toInsert.length })
    }

    // ── Branch B: itinerario esistente → suggerimenti meteo ───────
    const activityNames = activities.map(a => a.title).slice(0, ENRICH_CAP)
    const [meteoOutput, enricherOutput] = await Promise.all([
      runMeteorologoAgent(trip.destination, forecasts, activities),
      runEnricher(activityNames, trip.destination),
    ])
    const plannerOutput = await runTravelPlannerWeatherAgent(
      trip.destination, meteoOutput, activities, forecasts,
      travelerProfiles.length > 0 ? travelerProfiles : undefined,
      enricherOutput,
    )

    await db.from('trip_suggestions').delete().eq('trip_id', tripId)

    const toInsert = [
      ...(meteoOutput.overall_summary ? [{
        trip_id: tripId, type: 'weather_alert', title: '🌤️ Analisi meteo',
        body: meteoOutput.overall_summary,
        priority: meteoOutput.conflicts.length > 0 ? 5 : 0,
      }] : []),
      ...plannerOutput.suggestions.map(s => ({
        trip_id: tripId, type: s.type, title: s.title,
        body: s.group_fit_reason ? `${s.body}\n\n{{group_fit}}${s.group_fit_reason}` : s.body,
        activity_data: s.activity_data ? { ...s.activity_data, replaces: s.replaces ?? null } : null,
        priority: s.priority,
      })),
    ]

    if (toInsert.length > 0) await db.from('trip_suggestions').insert(toInsert)

    const enricherStats = {
      found:   enricherOutput.enrichedActivities.filter(a => a.rating > 0 || a.address).length,
      total:   enricherOutput.enrichedActivities.length,
      partial: enricherOutput.partial,
    }
    return json({ success: true, count: toInsert.length, enricher: enricherStats })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
