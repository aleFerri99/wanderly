'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ExportTrip } from '@/app/trip/[id]/export/actions'

// Aggiunge un offset in giorni a una data YYYY-MM-DD
function shiftDate(date: string | null, offsetDays: number): string | null {
  if (!date) return null
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function createFromTemplate(
  template: ExportTrip,
  newTripName: string,
  newDestination: string,
  newDayDates: Record<number, { date: string | null; date_end: string | null }>,
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Deriva le date del viaggio dalla prima/ultima tappa con date
  const daysWithDates = Object.values(newDayDates).filter(d => d.date)
  const newTripStart = daysWithDates.reduce<string | null>((min, d) =>
    !min || (d.date && d.date < min) ? d.date : min, null)
  const newTripEnd = daysWithDates.reduce<string | null>((max, d) => {
    const end = d.date_end ?? d.date
    return !max || (end && end > max) ? end : max
  }, null)

  // Crea il viaggio
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .insert({
      name:        newTripName.trim() || template.name,
      destination: newDestination.trim() || template.destination,
      start_date:  newTripStart,
      end_date:    newTripEnd,
      created_by:  user.id,
    })
    .select()
    .single()

  if (tripErr || !trip) return { error: tripErr?.message ?? 'Errore creazione viaggio' }

  // Crea le tappe con le nuove date
  for (const [idx, day] of template.days.entries()) {
    const newDates = newDayDates[idx] ?? { date: null, date_end: null }

    // Calcola l'offset rispetto alla data originale per shiftare le attività
    const originalDayStart = day.date
    const newDayStart      = newDates.date
    let offsetDays = 0
    if (originalDayStart && newDayStart) {
      offsetDays = Math.round(
        (new Date(newDayStart + 'T00:00:00').getTime() -
         new Date(originalDayStart + 'T00:00:00').getTime()) /
        86400000
      )
    }

    const { data: createdDay, error: dayErr } = await supabase
      .from('days')
      .insert({
        trip_id:  trip.id,
        title:    day.title,
        date:     newDates.date,
        date_end: newDates.date_end,
        position: day.position,
      })
      .select()
      .single()

    if (dayErr || !createdDay) continue

    // Crea le attività con date shiftate
    if (day.activities.length > 0) {
      await supabase.from('activities').insert(
        day.activities.map((act, actIdx) => ({
          trip_id:          trip.id,
          day_id:           createdDay.id,
          title:            act.title,
          notes:            act.notes,
          location:         act.location,
          time_start:       act.time_start,
          activity_date:    shiftDate(act.activity_date, offsetDays),
          duration_minutes: act.duration_minutes,
          status:           'todo',   // le attività importate ripartono da zero
          position:         actIdx,
          created_by:       user.id,
        }))
      )
    }
  }

  redirect(`/trip/${trip.id}`)
}
