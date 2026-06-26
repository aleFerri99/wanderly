'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchForecast } from '@repo/shared/supabase/weather'
import { runMeteorologoAgent, runTravelPlannerWeatherAgent, runItineraryPlannerAgent } from '@repo/shared/supabase/agents'
import { runEnricher } from '@repo/shared/supabase/enricher'

export async function refreshTripSuggestions(tripId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Verifica membership
  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { error: 'Accesso negato' }

  // Carica destinazione e date del viaggio
  const { data: tripRaw } = await supabase
    .from('trips').select('id, name, destination, start_date, end_date').eq('id', tripId).single()
  const trip = tripRaw as {
    id: string; name: string; destination: string | null
    start_date: string | null; end_date: string | null
  } | null
  if (!trip?.destination) return { error: 'Nessuna destinazione impostata per questo viaggio' }

  // Calcola quanti giorni di previsione servono a partire da oggi
  // Open-Meteo supporta max 16 giorni. Se il viaggio inizia dopo 16 giorni
  // le previsioni non sono ancora disponibili (normale comportamento meteo).
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  let forecastDays = 7 // default
  if (trip.end_date) {
    const tripEnd = new Date(trip.end_date + 'T00:00:00')
    const daysUntilEnd = Math.ceil((tripEnd.getTime() - today.getTime()) / 86400000)
    forecastDays = Math.min(Math.max(daysUntilEnd + 1, 3), 16) // max 16 giorni (limite Open-Meteo)
  }

  // Verifica che il profilo del gruppo esista (obbligatorio per i suggerimenti)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: profileCount } = await (supabase as any)
    .from('traveler_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('trip_id', tripId)
  if (!profileCount || profileCount === 0) {
    return { error: 'MISSING_PROFILES' }
  }

  const [forecasts] = await Promise.all([
    fetchForecast(trip.destination, forecastDays),
  ])
  if (forecasts.length === 0) return { error: 'Previsioni meteo non disponibili per questa destinazione' }

  // Carica attività JOIN con il giorno genitore per avere le date delle tappe
  // Anche le attività senza activity_date (tappe singolo-giorno) ricevono
  // la data del giorno genitore come data effettiva
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: activitiesRaw } = await (supabase as any)
    .from('activities')
    .select(`
      title, notes, location, time_start, activity_date,
      day:days!day_id ( date, date_end )
    `)
    .eq('trip_id', tripId)

  type ActivityRow = {
    title: string; notes: string | null; location: string | null
    time_start: string | null; activity_date: string | null
    day: { date: string | null; date_end: string | null } | null
  }

  const activities: ActivityRow[] = (activitiesRaw ?? []).map((a: ActivityRow) => ({
    ...a,
    // Se l'attività non ha activity_date (tappa singolo-giorno) usa la data del giorno genitore
    activity_date: a.activity_date ?? a.day?.date ?? null,
  }))

  // Filtra solo attività con date che rientrano nel periodo di previsione
  const forecastDates = new Set(forecasts.map(f => f.date))
  const activitiesInForecast = activities.filter(
    a => !a.activity_date || forecastDates.has(a.activity_date)
  )

  // Se il viaggio inizia tra più di 7 giorni le previsioni sono poco attendibili
  // → mostra un messaggio informativo invece di analizzare dati imprecisi
  if (trip.start_date && trip.start_date > todayStr) {
    const daysToTrip = Math.ceil(
      (new Date(trip.start_date + 'T00:00:00').getTime() - today.getTime()) / 86400000
    )
    if (daysToTrip > 7) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      await db.from('trip_suggestions').delete().eq('trip_id', tripId)
      await db.from('trip_suggestions').insert([{
        trip_id: tripId,
        type:     'weather_alert',
        title:    '📅 Viaggio in arrivo',
        body:     `Il tuo viaggio inizia tra ${daysToTrip} giorni. Le previsioni meteo affidabili saranno disponibili entro 7 giorni dalla partenza — riapri questa sezione più vicino alla data.`,
        priority: 0,
      }])
      return { success: true, count: 1 }
    }
  }

  // Carica profili viaggiatori (Modulo K) per personalizzare i suggerimenti
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profilesRaw } = await (supabase as any)
    .from('traveler_profiles')
    .select('adventure_level, cultural_interest, food_focus, personality_tags, raw_analysis')
    .eq('trip_id', tripId)

  type ProfileRow = {
    adventure_level:   number | null; cultural_interest: number | null
    food_focus:        number | null; personality_tags:  string[]; raw_analysis: string | null
  }
  // I campi nuovi (pace_preference, ecc.) potrebbero non essere ancora nel DB —
  // vengono riempiti con i default finché non viene eseguita la migrazione corrispondente
  const travelerProfiles = ((profilesRaw ?? []) as ProfileRow[]).map(p => ({
    adventure_level:   p.adventure_level   ?? 3,
    cultural_interest: p.cultural_interest ?? 3,
    food_focus:        p.food_focus        ?? 3,
    personality_tags:  p.personality_tags  ?? [],
    raw_analysis:      p.raw_analysis      ?? '',
    pace_preference:   3,
    social_openness:   3,
    novelty_seeking:   3,
    mobility_level:    'moderate' as const,
    travel_style:      'mixed'    as const,
    language_comfort:  'english_ok' as const,
    pace_note:         '',
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Branch A: itinerario vuoto → pianificazione completa ──────
  if (activitiesInForecast.length === 0) {
    const { data: daysRaw } = await db
      .from('days')
      .select('title, date, date_end')
      .eq('trip_id', tripId)
      .order('position', { ascending: true })

    if (!daysRaw?.length) {
      return { error: 'Aggiungi almeno una tappa alla timeline prima di generare suggerimenti.' }
    }

    // Enricher sui titoli delle tappe in parallelo con la pianificazione
    const dayTitles        = (daysRaw as { title: string }[]).map(d => d.title)
    const enricherOutputA  = await runEnricher(dayTitles, trip.destination)

    const itineraryOutput = await runItineraryPlannerAgent(
      trip.destination,
      daysRaw,
      forecasts,
      travelerProfiles.length > 0 ? travelerProfiles : undefined,
      enricherOutputA,
    )

    await db.from('trip_suggestions').delete().eq('trip_id', tripId)
    const toInsert = itineraryOutput.suggestions.map(s => ({
      trip_id: tripId, type: s.type, title: s.title,
      body: s.group_fit_reason
        ? `${s.body}\n\n{{group_fit}}${s.group_fit_reason}`
        : s.body,
      activity_data: s.activity_data ?? null, priority: s.priority,
    }))
    if (toInsert.length > 0) await db.from('trip_suggestions').insert(toInsert)
    return { success: true, count: toInsert.length }
  }

  // ── Branch B: itinerario esistente → suggerimenti meteo ───────
  // Meteorologo e Enricher girano in parallelo (indipendenti tra loro)
  const activityNames = activities.map(a => a.title)
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
      trip_id: tripId, type: 'weather_alert',
      title: '🌤️ Analisi meteo',
      body: meteoOutput.overall_summary,
      priority: meteoOutput.conflicts.length > 0 ? 5 : 0,
    }] : []),
    ...plannerOutput.suggestions.map(s => ({
      trip_id: tripId, type: s.type, title: s.title,
      body: s.group_fit_reason
        ? `${s.body}\n\n{{group_fit}}${s.group_fit_reason}`
        : s.body,
      activity_data: s.activity_data ?? null, priority: s.priority,
    })),
  ]

  if (toInsert.length > 0) {
    await db.from('trip_suggestions').insert(toInsert)
  }

  const enricherStats = {
    found:   enricherOutput.enrichedActivities.filter(a => a.rating > 0 || a.address).length,
    total:   enricherOutput.enrichedActivities.length,
    partial: enricherOutput.partial,
  }

  return { success: true, count: toInsert.length, enricher: enricherStats }
}
