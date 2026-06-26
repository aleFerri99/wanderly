// ============================================================
// src/app/dashboard/page.tsx
// Dashboard: lista viaggi dell'utente + crea/unisciti
// ============================================================
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateTripModal } from '@/components/trip/CreateTripModal'
import { JoinTripModal } from '@/components/trip/JoinTripModal'
import type { Profile, Trip, TripMember } from '@repo/shared/types/database'
import './dashboard.css'

// Service role bypassa la RLS self-referenziale su trip_members
// che nella nested query trips→trip_members restituisce solo 1 riga
function getSvcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Carica profilo
  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as Profile | null

  // 1. Trip IDs dell'utente tramite client autenticato (RLS corretto)
  const { data: membershipsRaw } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('user_id', user.id)

  const tripIds = (membershipsRaw ?? []).map((m: { trip_id: string }) => m.trip_id)

  // 2. Trip details + TUTTI i membri via service role
  //    Bypassa la RLS self-referenziale che nella nested query limitava a 1 riga
  const svc = getSvcClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tripsRaw } = tripIds.length
    ? await (svc as any)
        .from('trips')
        .select('*')
        .in('id', tripIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allMembersRaw } = tripIds.length
    ? await (svc as any)
        .from('trip_members')
        .select('id, trip_id, user_id, role, joined_at')
        .in('trip_id', tripIds)
    : { data: [] }

  // 3. Profili dei membri via query diretta (no join ambigua)
  const memberUserIds = [...new Set(
    ((allMembersRaw ?? []) as { user_id: string }[]).map(m => m.user_id)
  )]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profilesRaw } = memberUserIds.length
    ? await (svc as any)
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', memberUserIds)
    : { data: [] }

  type ProfileSnap = Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>
  const profileMap = new Map<string, ProfileSnap>(
    ((profilesRaw ?? []) as ProfileSnap[]).map(p => [p.id, p])
  )

  // 4. Assembla struttura TripWithMembers
  type MemberRow = { id: string; trip_id: string; user_id: string; role: string; joined_at: string }
  const membersByTrip = new Map<string, (TripMember & { profile: Profile })[]>()
  for (const m of ((allMembersRaw ?? []) as MemberRow[])) {
    if (!membersByTrip.has(m.trip_id)) membersByTrip.set(m.trip_id, [])
    membersByTrip.get(m.trip_id)!.push({
      id: m.id, trip_id: m.trip_id, user_id: m.user_id,
      role: m.role as 'owner' | 'editor' | 'viewer', joined_at: m.joined_at,
      profile: (profileMap.get(m.user_id) ?? {
        id: m.user_id, username: m.user_id.slice(0, 8), full_name: null, avatar_url: null,
      }) as Profile,
    })
  }

  const trips = ((tripsRaw ?? []) as Trip[]).map(t => ({
    ...t,
    trip_members: membersByTrip.get(t.id) ?? [],
  }))

  const initials = (profile?.full_name || profile?.username || 'U')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const tripCount = trips?.length ?? 0

  return (
    <div className="dashboard">
      {/* ── Hero greeting (sotto TopAppBar) ── */}
      <div className="dash-hero">
        <div className="dash-hero-inner">
          <p className="dash-hi">Ciao, {profile?.full_name?.split(' ')[0] || profile?.username} 👋</p>
          <h1 className="dash-title">
            {tripCount === 0 ? 'Pronti a partire?' : `${tripCount} ${tripCount === 1 ? 'viaggio' : 'viaggi'} in agenda`}
          </h1>
        </div>
      </div>

      {/* Main */}
      <main className="dash-main">

        {/* CTA buttons */}
        <div className="dash-actions">
          <CreateTripModal />
          <JoinTripModal />
        </div>
        <Link href="/import" className="dash-import-btn">
          📥 Importa itinerario
        </Link>

        {/* Trip list */}
        {!trips || trips.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🗺️</div>
            <h2>Nessun viaggio ancora</h2>
            <p>Crea il tuo primo viaggio o unisciti a uno tramite codice invito.</p>
          </div>
        ) : (
          <div className="trip-grid">
            {trips.map((trip) => {
              const memberCount = trip.trip_members?.length ?? 0
              const startDate = trip.start_date
                ? new Date(trip.start_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
                : null
              const endDate = trip.end_date
                ? new Date(trip.end_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
                : null

              return (
                <Link href={`/trip/${trip.id}`} key={trip.id} className="trip-card">
                  <div className="trip-cover">
                    {trip.cover_url ? (
                      <img src={trip.cover_url} alt={trip.name} />
                    ) : (
                      <div className="trip-cover-placeholder">
                        {trip.destination?.[0] || '✈'}
                      </div>
                    )}
                  </div>
                  <div className="trip-info">
                    <h3>{trip.name}</h3>
                    {trip.destination && <p className="trip-dest">📍 {trip.destination}</p>}
                    {startDate && (
                      <p className="trip-dates">
                        🗓 {startDate}{endDate ? ` → ${endDate}` : ''}
                      </p>
                    )}
                    <div className="trip-footer">
                      <div className="member-avatars">
                        {trip.trip_members?.slice(0, 4).map((m, i) => (
                          <div
                            key={m.id}
                            className="member-avatar"
                            style={{ zIndex: 4 - i }}
                            title={m.profile?.full_name || m.profile?.username}
                          >
                            {(m.profile?.full_name || m.profile?.username || '?')[0].toUpperCase()}
                          </div>
                        ))}
                        {memberCount > 4 && (
                          <div className="member-avatar member-more">+{memberCount - 4}</div>
                        )}
                      </div>
                      <span className="trip-member-count">{memberCount} {memberCount === 1 ? 'membro' : 'membri'}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
