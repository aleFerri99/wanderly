// queries/export.ts — CLIENT-SAFE. Assembla i dati del viaggio per l'export
// (stesso formato del web) e produce un testo itinerario condivisibile.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { Trip, DayWithActivities } from '../../types/database'

export interface ExportTrip {
  wanderly_version: '1.0'
  exported_at: string
  name: string
  destination: string | null
  start_date: string | null
  end_date: string | null
  days: {
    title: string; date: string | null; date_end: string | null; position: number; avg_score: number | null
    activities: {
      title: string; notes: string | null; location: string | null; time_start: string | null
      activity_date: string | null; duration_minutes: number | null; status: string; avg_score: number | null
    }[]
  }[]
}

function avgMap(rows: { id: string; score: number }[]): Map<string, number> {
  const sums = new Map<string, { sum: number; count: number }>()
  for (const r of rows) { const p = sums.get(r.id) ?? { sum: 0, count: 0 }; sums.set(r.id, { sum: p.sum + r.score, count: p.count + 1 }) }
  const out = new Map<string, number>()
  sums.forEach((v, k) => out.set(k, Math.round((v.sum / v.count) * 10) / 10))
  return out
}

export async function buildExport(supabase: SupabaseLike, tripId: string): Promise<ExportTrip | null> {
  const [tripRes, daysRes, actRev, dayRev] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).single(),
    supabase.from('days').select('*, activities(*)').eq('trip_id', tripId).order('position', { ascending: true }),
    supabase.from('reviews').select('activity_id, score').eq('trip_id', tripId).not('activity_id', 'is', null),
    supabase.from('reviews').select('day_id, score').eq('trip_id', tripId).not('day_id', 'is', null),
  ])
  const trip = tripRes.data as Trip | null
  if (!trip) return null
  const days = (daysRes.data ?? []) as DayWithActivities[]
  const actAvg = avgMap(((actRev.data ?? []) as { activity_id: string; score: number }[]).map(r => ({ id: r.activity_id, score: r.score })))
  const dayAvg = avgMap(((dayRev.data ?? []) as { day_id: string; score: number }[]).map(r => ({ id: r.day_id, score: r.score })))

  return {
    wanderly_version: '1.0',
    exported_at: new Date().toISOString(),
    name: trip.name, destination: trip.destination, start_date: trip.start_date, end_date: trip.end_date,
    days: days.map(d => ({
      title: d.title, date: d.date, date_end: d.date_end, position: d.position, avg_score: dayAvg.get(d.id) ?? null,
      activities: (d.activities ?? []).slice().sort((a, b) => a.position - b.position).map(a => ({
        title: a.title, notes: a.notes, location: a.location, time_start: a.time_start,
        activity_date: a.activity_date, duration_minutes: a.duration_minutes, status: a.status, avg_score: actAvg.get(a.id) ?? null,
      })),
    })),
  }
}

// Crea un nuovo viaggio clonando un template (ExportTrip). Le date dei giorni
// usano i nuovi valori se forniti, altrimenti quelle originali del template.
export async function createFromTemplate(
  supabase: SupabaseLike,
  template: ExportTrip,
  opts: { name?: string; destination?: string; dayDates?: Record<number, { date: string | null; date_end: string | null }> } = {},
): Promise<{ tripId?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const dayDates = opts.dayDates ?? Object.fromEntries(template.days.map((d, i) => [i, { date: d.date, date_end: d.date_end }]))
  const withDates = Object.values(dayDates).filter(d => d.date)
  const start = withDates.reduce<string | null>((min, d) => (!min || (d.date && d.date < min) ? d.date : min), null)
  const end   = withDates.reduce<string | null>((max, d) => { const e = d.date_end ?? d.date; return !max || (e && e > max) ? e : max }, null)

  const tripRes = await supabase.from('trips').insert({
    name: (opts.name?.trim() || template.name), destination: (opts.destination?.trim() || template.destination) ?? null,
    start_date: start, end_date: end, created_by: user.id,
  }).select('id').single()
  const trip = tripRes.data as { id: string } | null
  if (tripRes.error || !trip) return { error: tripRes.error?.message ?? 'Errore creazione viaggio' }

  for (const [idx, day] of template.days.entries()) {
    const nd = dayDates[idx] ?? { date: null, date_end: null }
    let offset = 0
    if (day.date && nd.date) offset = Math.round((new Date(nd.date + 'T00:00:00').getTime() - new Date(day.date + 'T00:00:00').getTime()) / 86400000)
    const dayRes = await supabase.from('days').insert({ trip_id: trip.id, title: day.title, date: nd.date, date_end: nd.date_end, position: day.position }).select('id').single()
    const created = dayRes.data as { id: string } | null
    if (dayRes.error || !created) continue
    if (day.activities.length > 0) {
      await supabase.from('activities').insert(day.activities.map((a, i) => ({
        trip_id: trip.id, day_id: created.id, title: a.title, notes: a.notes, location: a.location,
        time_start: a.time_start, activity_date: shiftDate(a.activity_date, offset),
        duration_minutes: a.duration_minutes, status: 'todo', position: i, created_by: user.id,
      })))
    }
  }
  return { tripId: trip.id }
}

function shiftDate(date: string | null, offsetDays: number): string | null {
  if (!date) return null
  const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

// Itinerario leggibile (per Share/condivisione).
export function exportToText(t: ExportTrip): string {
  const lines: string[] = []
  lines.push(`🧳 ${t.name}`)
  if (t.destination) lines.push(`📍 ${t.destination}`)
  if (t.start_date) lines.push(`🗓️ ${fmtD(t.start_date)}${t.end_date ? ` → ${fmtD(t.end_date)}` : ''}`)
  lines.push('')
  for (const d of t.days) {
    lines.push(`── ${d.title}${d.date ? ` · ${fmtD(d.date)}` : ''} ──`)
    if (d.activities.length === 0) lines.push('  (nessuna attività)')
    for (const a of d.activities) {
      const check = a.status === 'done' ? '✅' : '▫️'
      const time  = a.time_start ? `${a.time_start.slice(0, 5)} ` : ''
      const loc   = a.location ? ` @ ${a.location}` : ''
      const star  = a.avg_score != null ? ` ★${a.avg_score}` : ''
      lines.push(`  ${check} ${time}${a.title}${loc}${star}`)
      if (a.notes) lines.push(`     ↳ ${a.notes}`)
    }
    lines.push('')
  }
  lines.push('— creato con Wanderly')
  return lines.join('\n')
}
