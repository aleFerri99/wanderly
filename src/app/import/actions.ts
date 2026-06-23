'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ExportTrip } from '@/app/trip/[id]/export/actions'

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
  // Usiamo il client tipizzato ma facciamo i cast espliciti sui risultati
  // per evitare l'errore "never[]" su insert + select in strict mode
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Deriva le date del viaggio dalla prima/ultima tappa con date
  const daysWithDates = Object.values(newDayDates).filter(d => d.date)
  const newTripStart = daysWithDates.reduce<string | null>(
    (min, d) => (!min || (d.date && d.date < min) ? d.date : min), null
  )
  const newTripEnd = daysWithDates.reduce<string | null>((max, d) => {
    const end = d.date_end ?? d.date
    return !max || (end && end > max) ? end : max
  }, null)

  // Cast del client per bypassare l'incompatibilità dei tipi Insert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Crea il viaggio
  const tripRes = await db
    .from('trips')
    .insert({
      name:        newTripName.trim() || template.name,
      destination: (newDestination.trim() || template.destination) ?? null,
      cover_url:   null,
      start_date:  newTripStart,
      end_date:    newTripEnd,
      created_by:  user.id,
    })
    .select()
    .single()

  const trip = tripRes.data as { id: string } | null
  if (tripRes.error || !trip) {
    return { error: tripRes.error?.message ?? 'Errore creazione viaggio' }
  }

  // Crea le tappe con le nuove date
  for (const [idx, day] of template.days.entries()) {
    const newDates = newDayDates[idx] ?? { date: null, date_end: null }

    let offsetDays = 0
    if (day.date && newDates.date) {
      offsetDays = Math.round(
        (new Date(newDates.date + 'T00:00:00').getTime() -
         new Date(day.date + 'T00:00:00').getTime()) / 86400000
      )
    }

    const dayRes = await db
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

    const createdDay = dayRes.data as { id: string } | null
    if (dayRes.error || !createdDay) continue

    if (day.activities.length > 0) {
      await db.from('activities').insert(
        day.activities.map((act: ExportTrip['days'][0]['activities'][0], actIdx: number) => ({
          trip_id:          trip.id,
          day_id:           createdDay.id,
          title:            act.title,
          notes:            act.notes,
          location:         act.location,
          time_start:       act.time_start,
          activity_date:    shiftDate(act.activity_date, offsetDays),
          duration_minutes: act.duration_minutes,
          status:           'todo',
          position:         actIdx,
          created_by:       user.id,
        }))
      )
    }
  }

  redirect(`/trip/${trip.id}`)
}
