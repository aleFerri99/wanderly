'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

// Struttura del file di esportazione (privacy: no testi recensioni, solo medie)
export interface ExportActivity {
  title: string
  notes: string | null
  location: string | null
  time_start: string | null
  activity_date: string | null
  duration_minutes: number | null
  status: string
  avg_score: number | null
}

export interface ExportDay {
  title: string
  date: string | null
  date_end: string | null
  position: number
  avg_score: number | null
  activities: ExportActivity[]
}

export interface ExportTrip {
  wanderly_version: '1.0'
  exported_at: string
  name: string
  destination: string | null
  start_date: string | null
  end_date: string | null
  days: ExportDay[]
}

function avgMap(
  rows: { id: string; score: number }[],
): Map<string, number> {
  const sums = new Map<string, { sum: number; count: number }>()
  rows.forEach(r => {
    const prev = sums.get(r.id) ?? { sum: 0, count: 0 }
    sums.set(r.id, { sum: prev.sum + r.score, count: prev.count + 1 })
  })
  const result = new Map<string, number>()
  sums.forEach((v, k) => result.set(k, Math.round((v.sum / v.count) * 10) / 10))
  return result
}

export async function generateExport(tripId: string): Promise<
  { error: string } | { data: ExportTrip }
> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Verifica membership
  const { data: membership } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!membership) return { error: 'Accesso negato' }

  const [tripRes, daysRes, actRevRes, dayRevRes] =
    await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).single(),
      supabase.from('days').select('*, activities(*)').eq('trip_id', tripId).order('position', { ascending: true }),
      supabase.from('reviews').select('activity_id, score').eq('trip_id', tripId).not('activity_id', 'is', null),
      supabase.from('reviews').select('day_id, score').eq('trip_id', tripId).not('day_id', 'is', null),
    ])

  const trip = tripRes.data as import('@repo/shared/types/database').Trip | null
  const days = daysRes.data as Array<import('@repo/shared/types/database').DayWithActivities> | null
  if (!trip) return { error: 'Viaggio non trovato' }

  // Cast esplicito per le select parziali con colonne nullable
  const actReviewsRaw = (actRevRes.data ?? []) as Array<{ activity_id: string | null; score: number }>
  const dayReviewsRaw = (dayRevRes.data ?? []) as Array<{ day_id: string | null; score: number }>

  // Calcola le medie (no testi, solo punteggi aggregati)
  const actAvg = avgMap(actReviewsRaw.map(r => ({ id: r.activity_id!, score: r.score })))
  const dayAvg = avgMap(dayReviewsRaw.map(r => ({ id: r.day_id!, score: r.score })))

  const exportData: ExportTrip = {
    wanderly_version: '1.0',
    exported_at: new Date().toISOString(),
    name: trip.name,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    days: (days ?? []).map(day => ({
      title: day.title,
      date: day.date,
      date_end: day.date_end,
      position: day.position,
      avg_score: dayAvg.get(day.id) ?? null,
      activities: (day.activities ?? [])
        .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
        .map((act: {
          title: string; notes: string | null; location: string | null
          time_start: string | null; activity_date: string | null
          duration_minutes: number | null; status: string; id: string
        }) => ({
          title: act.title,
          notes: act.notes,
          location: act.location,
          time_start: act.time_start,
          activity_date: act.activity_date,
          duration_minutes: act.duration_minutes,
          status: act.status,
          avg_score: actAvg.get(act.id) ?? null,
        })),
    })),
  }

  return { data: exportData }
}
