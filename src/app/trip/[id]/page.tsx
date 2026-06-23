// ============================================================
// src/app/trip/[id]/page.tsx  — Modulo D completo
// ============================================================
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { LivePresence } from '@/components/trip/LivePresence'
import { InviteCode } from '@/components/trip/InviteCode'
import { ExportButton } from '@/components/trip/ExportButton'
import { Timeline } from '@/components/trip/Timeline'
import { ExpensesTab } from '@/components/trip/ExpensesTab'
import { NotesTab } from '@/components/trip/NotesTab'
import { MapTab } from '@/components/trip/MapTab'
import { SuggestionsPanel } from '@/components/trip/SuggestionsPanel'
import type { TripWithMembers, DayWithActivities, Profile } from '@/types/database'
import './trip.css'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function TripPage({ params, searchParams }: Props) {
  const { id } = await params
  const { tab = 'timeline' } = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: trip, error } = await supabase
    .from('trips')
    .select(`*, trip_members(id, role, joined_at, user_id, profile:profiles(id, username, full_name, avatar_url))`)
    .eq('id', id)
    .single<TripWithMembers>()

  if (error || !trip) notFound()

  const myMembership = trip.trip_members?.find(m => m.user_id === user.id)
  if (!myMembership) redirect('/dashboard')

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: days } = await supabase
    .from('days')
    .select(`*, activities(*)`)
    .eq('trip_id', id)
    .order('position', { ascending: true })

  const initialDays = (days ?? []) as DayWithActivities[]
  const members = trip.trip_members?.map(m => m.profile).filter(Boolean) as Profile[]

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  // Immagine hero: cover_url manuale → Wikimedia Commons landscape search → Wikipedia page image
  let heroImgUrl: string | null = trip.cover_url ?? null
  if (!heroImgUrl && trip.destination) {
    const city = trip.destination.split(',')[0].trim()

    // ── 1. Wikimedia Commons: cerca foto paesaggistiche della destinazione ────
    // A differenza di Wikipedia page thumbnail (che per paesi restituisce mappe/bandiere),
    // Commons ha migliaia di foto reali filtrabili per orientamento orizzontale
    try {
      const params = new URLSearchParams({
        action:       'query',
        generator:    'search',
        gsrsearch:    `${city} landscape panorama`,
        gsrnamespace: '6',          // namespace File
        gsrlimit:     '20',
        prop:         'imageinfo',
        iiprop:       'url|dimensions',
        iiurlwidth:   '1200',       // thumbnail 1200px, ideale per banner mobile retina
        format:       'json',
        origin:       '*',
      })
      const commonsRes = await fetch(
        `https://commons.wikimedia.org/w/api.php?${params}`,
        { next: { revalidate: 86400 } }
      )
      const commonsData = await commonsRes.json()
      const pages = Object.values(commonsData.query?.pages ?? {}) as Array<{
        title?: string
        imageinfo?: Array<{ thumburl: string; width: number; height: number }>
      }>
      // Prima immagine con rapporto > 1.5:1 (chiaramente orizzontale/panoramica)
      // Esclude SVG (mappe vettoriali, stemmi) che hanno estensione nel titolo
      const landscape = pages.find(p => {
        if (p.title?.toLowerCase().endsWith('.svg')) return false
        const info = p.imageinfo?.[0]
        return info?.thumburl && info.width > info.height * 1.5
      })
      heroImgUrl = landscape?.imageinfo?.[0]?.thumburl ?? null
    } catch { /* ignora, prova il fallback */ }

    // ── 2. Fallback: Wikipedia page image (panoramica per le città) ───────────
    if (!heroImgUrl) {
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(city)}&prop=pageimages&piprop=thumbnail&pithumbsize=1000&format=json&origin=*`,
          { next: { revalidate: 86400 } }
        )
        const wikiData = await wikiRes.json()
        const pages = wikiData.query?.pages as Record<string, { thumbnail?: { source: string } }>
        if (pages) {
          const page = Object.values(pages)[0]
          heroImgUrl = page?.thumbnail?.source ?? null
        }
      } catch { /* nessuna immagine disponibile */ }
    }
  }

  // Conta suggerimenti attivi per badge sul tab AI
  const { data: suggestionsCount } = await supabase
    .from('trip_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', id)
  const aiCount = suggestionsCount ?? 0

  const tabs = [
    { id: 'timeline',     label: '📋', title: 'Timeline' },
    { id: 'mappa',        label: '🗺️', title: 'Mappa' },
    { id: 'spese',        label: '💰', title: 'Spese' },
    { id: 'note',         label: '📝', title: 'Note' },
    { id: 'gruppo',       label: '👥', title: 'Gruppo' },
    { id: 'suggerimenti', label: '💡', title: 'AI' },
  ]

  return (
    <div className="trip-page">
      <header className="trip-header">
        <div className="trip-header-inner">
          <a href="/dashboard" className="back-btn">← Viaggi</a>
          <div className="trip-header-title">{trip.name}</div>
          <Link href="/profile" className="trip-avatar-btn" title="Il mio profilo">
            {myProfile?.avatar_url
              ? <img src={myProfile.avatar_url} alt={myProfile.username} />
              : <span>{(myProfile?.full_name || myProfile?.username || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}</span>
            }
          </Link>
        </div>

        <div className="trip-hero">
          {heroImgUrl
            ? <img src={heroImgUrl} alt={trip.destination ?? trip.name} className="trip-hero-img" />
            : <div className="trip-hero-placeholder" />
          }
          <div className="trip-hero-overlay">
            <h1>{trip.name}</h1>
            {trip.destination && <p>📍 {trip.destination}</p>}
            {trip.start_date && (
              <p>🗓 {formatDate(trip.start_date)}{trip.end_date ? ` → ${formatDate(trip.end_date)}` : ''}</p>
            )}
          </div>
        </div>

        <div className="trip-presence">
          <LivePresence
            tripId={trip.id}
            currentUser={{ id: user.id, username: myProfile?.username || 'tu', avatar_url: myProfile?.avatar_url || null }}
          />
        </div>

        <div className="trip-tabs">
          {tabs.map(t => (
            <a key={t.id} href={`/trip/${id}?tab=${t.id}`} className={`trip-tab ${tab === t.id ? 'trip-tab-active' : ''}`}>
              <span className="tab-icon-wrap">
                <span className="tab-icon">{t.label}</span>
                {t.id === 'suggerimenti' && aiCount > 0 && (
                  <span className="tab-badge">{aiCount}</span>
                )}
              </span>
              <span className="tab-label">{t.title}</span>
            </a>
          ))}
        </div>
      </header>

      <main className="trip-main">
        {tab === 'timeline' && (
          <Timeline
            tripId={trip.id}
            initialDays={initialDays}
            tripStartDate={trip.start_date}
            tripName={trip.name}
            currentUserId={user.id}
            members={members}
          />
        )}

        {tab === 'mappa' && (
          <MapTab days={initialDays} tripDestination={trip.destination} />
        )}

        {tab === 'spese' && (
          <ExpensesTab
            tripId={trip.id}
            members={members}
            currentUserId={user.id}
          />
        )}

        {tab === 'note' && (
          <NotesTab tripId={trip.id} currentUserId={user.id} />
        )}

        {tab === 'gruppo' && (
          <div className="gruppo-tab">
            <div className="section">
              <InviteCode inviteCode={trip.invite_code} tripName={trip.name} />
            </div>
            <div className="section">
              <h2 className="section-title">Esporta itinerario</h2>
              <ExportButton tripId={trip.id} tripName={trip.name} />
            </div>
            <div className="section">
              <h2 className="section-title">
                Membri · {trip.trip_members?.length} {trip.trip_members?.length === 1 ? 'persona' : 'persone'}
              </h2>
              <div className="members-list">
                {trip.trip_members?.map((member) => {
                  const p = member.profile
                  const initials = (p?.full_name || p?.username || '?')
                    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
                  const isMe = member.user_id === user.id
                  return (
                    <div key={member.id} className="member-row">
                      <div className="member-avatar-wrap">
                        {p?.avatar_url
                          ? <img src={p.avatar_url} alt={p.username} className="member-avatar" />
                          : <div className="member-avatar member-initials">{initials}</div>
                        }
                      </div>
                      <div className="member-info">
                        <span className="member-name">
                          {p?.full_name || p?.username}
                          {isMe && <span className="badge-me">tu</span>}
                        </span>
                        <span className="member-username">@{p?.username}</span>
                      </div>
                      <span className={`role-badge role-${member.role}`}>
                        {member.role === 'owner' ? '👑 Owner' : member.role === 'editor' ? 'Editor' : 'Viewer'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'suggerimenti' && (
          <SuggestionsPanel
            tripId={trip.id}
            currentUserId={user.id}
            defaultDayId={initialDays[0]?.id}
          />
        )}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        {tabs.map(t => (
          <a key={t.id} href={`/trip/${id}?tab=${t.id}`} className={`nav-item ${tab === t.id ? 'nav-active' : ''}`}>
            <span>{t.label}</span>
            <span>{t.title}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
