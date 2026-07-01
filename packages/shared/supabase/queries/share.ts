// queries/share.ts — CLIENT-SAFE. Condivisione itinerario via link (token).
// Esporta solo la STRUTTURA dell'itinerario: tappe + attività (titolo, luogo,
// note, coordinate) e la DURATA di ogni tappa. Niente recensioni, orari, date
// assolute. All'import l'utente sceglie la data d'inizio e le date vengono
// ricostruite in sequenza.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { DayWithActivities } from '../../types/database'

export interface SharedActivity {
  title: string; location: string | null; notes: string | null
  lat: number | null; lng: number | null; dayOffset: number
}
export interface SharedStop {
  title: string; lat: number | null; lng: number | null
  days: number                 // durata della tappa in giorni (≥ 1)
  activities: SharedActivity[]
}
export interface SharedItinerary {
  name: string; destination: string | null; stops: SharedStop[]
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diffDays = (a: string, b: string) => Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)

// ── Costruisci il template spogliato dal viaggio ─────────────
export async function buildSharedItinerary(supabase: SupabaseLike, tripId: string): Promise<SharedItinerary | null> {
  const [tripRes, daysRes] = await Promise.all([
    supabase.from('trips').select('name, destination').eq('id', tripId).single(),
    supabase.from('days').select('*, activities(*)').eq('trip_id', tripId).order('position', { ascending: true }),
  ])
  const trip = tripRes.data as { name: string; destination: string | null } | null
  if (!trip) return null
  const days = (daysRes.data ?? []) as DayWithActivities[]

  const stops: SharedStop[] = days.map(d => {
    const dur = d.date && d.date_end && d.date_end > d.date ? diffDays(d.date_end, d.date) + 1 : 1
    const activities: SharedActivity[] = (d.activities ?? []).slice().sort((a, b) => a.position - b.position).map(a => {
      let off = 0
      if (d.date && a.activity_date) off = Math.min(Math.max(diffDays(a.activity_date, d.date), 0), dur - 1)
      return { title: a.title, location: a.location, notes: a.notes, lat: a.lat, lng: a.lng, dayOffset: off }
    })
    return { title: d.title, lat: d.lat, lng: d.lng, days: dur, activities }
  })
  return { name: trip.name, destination: trip.destination ?? null, stops }
}

// ── Crea un token condivisibile ──────────────────────────────
export async function createShareToken(supabase: SupabaseLike, tripId: string): Promise<{ token?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const itin = await buildSharedItinerary(supabase, tripId)
  if (!itin) return { error: 'Impossibile leggere il viaggio' }
  const { data, error } = await supabase.from('shared_itineraries')
    .insert({ created_by: user.id, name: itin.name, destination: itin.destination, data: itin })
    .select('token').single()
  if (error) return { error: error.message }
  return { token: (data as { token: string }).token }
}

// ── Leggi un itinerario condiviso dal token (RPC pubblica) ───
export async function getSharedItinerary(supabase: SupabaseLike, token: string): Promise<SharedItinerary | null> {
  const { data, error } = await supabase.rpc('get_shared_itinerary', { p_token: token })
  const rows = (data ?? []) as { name: string; destination: string | null; data: SharedItinerary }[]
  if (error || !rows.length) return null
  return rows[0].data
}

// ── Importa: crea un nuovo viaggio ricostruendo le date dalla data d'inizio ──
export async function importSharedItinerary(
  supabase: SupabaseLike, itin: SharedItinerary, startDate: string, name?: string,
): Promise<{ tripId?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const totalDays = itin.stops.reduce((s, st) => s + Math.max(1, st.days), 0)
  const start = new Date(startDate + 'T00:00:00')
  if (isNaN(start.getTime())) return { error: 'Data non valida' }
  const end = new Date(start); end.setDate(end.getDate() + Math.max(0, totalDays - 1))

  const tripRes = await supabase.from('trips').insert({
    name: (name?.trim() || itin.name), destination: itin.destination,
    start_date: iso(start), end_date: iso(end), created_by: user.id,
  }).select('id').single()
  const trip = tripRes.data as { id: string } | null
  if (tripRes.error || !trip) return { error: tripRes.error?.message ?? 'Errore creazione viaggio' }

  const cursor = new Date(start)
  for (let i = 0; i < itin.stops.length; i++) {
    const st = itin.stops[i]
    const dur = Math.max(1, st.days)
    const dStart = new Date(cursor)
    const dEnd = new Date(cursor); dEnd.setDate(dEnd.getDate() + dur - 1)
    const dayRes = await supabase.from('days').insert({
      trip_id: trip.id, title: st.title, date: iso(dStart), date_end: dur > 1 ? iso(dEnd) : null,
      position: i, lat: st.lat, lng: st.lng,
    }).select('id').single()
    const created = dayRes.data as { id: string } | null
    if (!dayRes.error && created && st.activities.length) {
      await supabase.from('activities').insert(st.activities.map((a, j) => {
        const ad = new Date(dStart); ad.setDate(ad.getDate() + Math.min(a.dayOffset, dur - 1))
        return {
          trip_id: trip.id, day_id: created.id, title: a.title, notes: a.notes, location: a.location,
          lat: a.lat, lng: a.lng, activity_date: iso(ad), time_start: null, status: 'todo', position: j, created_by: user.id,
        }
      }))
    }
    cursor.setDate(cursor.getDate() + dur)
  }
  return { tripId: trip.id }
}
