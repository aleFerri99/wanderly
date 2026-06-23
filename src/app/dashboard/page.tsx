// ============================================================
// src/app/dashboard/page.tsx
// Dashboard: lista viaggi dell'utente + crea/unisciti
// ============================================================
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateTripModal } from '@/components/trip/CreateTripModal'
import { JoinTripModal } from '@/components/trip/JoinTripModal'
import type { TripWithMembers } from '@/types/database'
import './dashboard.css'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Carica profilo
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Carica viaggi con membri
  const { data: trips } = await supabase
    .from('trips')
    .select(`
      *,
      trip_members (
        id, role, joined_at,
        profile:profiles ( id, username, full_name, avatar_url )
      )
    `)
    .order('created_at', { ascending: false })
    .returns<TripWithMembers[]>()

  const initials = (profile?.full_name || profile?.username || 'U')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <span className="logo">✈️ Wanderly</span>
          <Link href="/profile" className="avatar-btn" title="Il mio profilo">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} />
            ) : (
              <span>{initials}</span>
            )}
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="dash-main">
        <div className="dash-greeting">
          <h1>Ciao, {profile?.full_name?.split(' ')[0] || profile?.username} 👋</h1>
          <p>I tuoi viaggi</p>
        </div>

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
