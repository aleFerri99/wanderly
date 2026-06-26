'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { TOTAL_COUNTRIES, COUNTRIES_BY_CODE } from '@repo/shared/countries'
import type { VisitedCountry } from '@repo/shared/types/database'

// ── Geocodifica destinazione → country_code ISO Alpha-2 ──────
// Open-Meteo Geocoding API restituisce country_code nella risposta:
// già in uso in MapTab e weather.ts, nessuna dipendenza aggiuntiva.
async function geocodeToCountryCode(destination: string): Promise<string | null> {
  const city = destination.split(',')[0].trim()
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=it&format=json`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const code = data.results?.[0]?.country_code as string | undefined
    // Valida che il codice sia effettivamente un paese conosciuto
    return code && COUNTRIES_BY_CODE.has(code) ? code : null
  } catch {
    return null
  }
}

// ── Dati del passaporto ──────────────────────────────────────
export interface PassportData {
  countries:  VisitedCountry[]
  count:      number
  total:      number
  percentage: number
}

export async function getPassportData(): Promise<PassportData> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { countries: [], count: 0, total: TOTAL_COUNTRIES, percentage: 0 }

  const { data, count } = await supabase
    .from('user_visited_countries')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('visited_at', { ascending: false })

  const n = count ?? 0
  return {
    countries:  (data ?? []) as VisitedCountry[],
    count:      n,
    total:      TOTAL_COUNTRIES,
    percentage: Math.round((n / TOTAL_COUNTRIES) * 100),
  }
}

// ── Lazy sync: chiamata all'apertura del Passaporto ──────────
// Controlla tutti i viaggi terminati dell'utente e aggiunge
// automaticamente i paesi non ancora nel passaporto.
// Idempotente: ON CONFLICT DO NOTHING garantisce zero duplicati.
export async function syncPassportFromTrips(): Promise<{ synced: number }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { synced: 0 }

  const today = new Date().toISOString().split('T')[0]

  // Viaggi terminati dove l'utente è membro con destinazione nota
  const { data: memberships } = await supabase
    .from('trip_members')
    .select('trip_id, trip:trips!inner(id, destination, end_date)')
    .eq('user_id', user.id)

  type MemberRow = {
    trip_id: string
    trip: { id: string; destination: string | null; end_date: string | null }
  }

  const endedTrips = ((memberships ?? []) as MemberRow[]).filter(
    m => m.trip?.end_date && m.trip.end_date < today && m.trip.destination
  )

  if (!endedTrips.length) return { synced: 0 }

  // Paesi già registrati tramite viaggio (evita geocoding ripetuto)
  const { data: existing } = await supabase
    .from('user_visited_countries')
    .select('trip_id')
    .eq('user_id', user.id)
    .eq('source', 'trip')
    .not('trip_id', 'is', null)

  const processedTripIds = new Set(
    ((existing ?? []) as { trip_id: string | null }[])
      .map(r => r.trip_id)
      .filter(Boolean)
  )

  // Geocodifica solo i viaggi non ancora processati (risparmio API calls)
  const unprocessed = endedTrips.filter(m => !processedTripIds.has(m.trip_id))
  if (!unprocessed.length) return { synced: 0 }

  // Geocodifica in parallelo (max 3 alla volta per non saturare l'API)
  let synced = 0
  const chunks: MemberRow[][] = []
  for (let i = 0; i < unprocessed.length; i += 3) {
    chunks.push(unprocessed.slice(i, i + 3))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async m => {
      const code = await geocodeToCountryCode(m.trip.destination!)
      if (!code) return

      const { error } = await db.from('user_visited_countries').upsert({
        user_id:      user.id,
        country_code: code,
        source:       'trip',
        trip_id:      m.trip_id,
        visited_at:   m.trip.end_date,
      }, { onConflict: 'user_id,country_code', ignoreDuplicates: true })

      if (!error) synced++
    }))
  }

  return { synced }
}

// ── Aggiungi paese manualmente ────────────────────────────────
export async function addCountryManually(
  countryCode: string,
  visitedAt?: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  if (!COUNTRIES_BY_CODE.has(countryCode)) {
    return { error: 'Codice paese non valido' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('user_visited_countries')
    .upsert({
      user_id:      user.id,
      country_code: countryCode,
      source:       'manual',
      trip_id:      null,
      visited_at:   visitedAt ?? new Date().toISOString().split('T')[0],
    }, { onConflict: 'user_id,country_code', ignoreDuplicates: true })

  if (error) return { error: error.message }
  return { success: true }
}

// ── Rimuovi paese ─────────────────────────────────────────────
export async function removeCountry(
  countryCode: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('user_visited_countries')
    .delete()
    .eq('user_id', user.id)
    .eq('country_code', countryCode)

  if (error) return { error: error.message }
  return { success: true }
}
