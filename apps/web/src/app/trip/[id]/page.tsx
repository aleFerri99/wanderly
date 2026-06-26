// ============================================================
// src/app/trip/[id]/page.tsx  — Modulo D completo
// ============================================================
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { LivePresence } from '@/components/trip/LivePresence'
import { InviteCode } from '@/components/trip/InviteCode'
import { ExportButton } from '@/components/trip/ExportButton'
import { Timeline } from '@/components/trip/Timeline'
import { ExpensesTab } from '@/components/trip/ExpensesTab'
import { GroupBoard } from '@/components/trip/GroupBoard'
import { DocumentsTab } from '@/components/trip/DocumentsTab'
import { MapTab } from '@/components/trip/MapTab'
import { SuggestionsPanel } from '@/components/trip/SuggestionsPanel'
import { GamificationTab } from '@/components/trip/GamificationTab'
import { PsicologoSection } from '@/components/trip/PsicologoSection'
import { TripSetter } from '@/components/layout/TripSetter'
import { DeleteTripButton } from '@/components/trip/DeleteTripButton'
import { MvpVotePrompt }       from '@/components/trip/MvpVotePrompt'
import { BadgeUnlockToast }    from '@/components/trip/BadgeUnlockToast'
import type { TripWithMembers, DayWithActivities, Profile } from '@repo/shared/types/database'
import './trip.css'

// Sub-tab del gruppo Itinerario (navigazione secondaria)
const ITINERARIO_SUB = [
  { id: 'timeline',  icon: '📋', label: 'Timeline'  },
  { id: 'mappa',     icon: '🗺️', label: 'Mappa'     },
  { id: 'spese',     icon: '💰', label: 'Spese'     },
  { id: 'note',      icon: '📝', label: 'Note'      },
  { id: 'documenti', icon: '📄', label: 'Documenti' },
  { id: 'gruppo',    icon: '👥', label: 'Gruppo'    },
]
const ITINERARIO_IDS = ITINERARIO_SUB.map(t => t.id)

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

  const { data: myProfileRaw } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const myProfile = myProfileRaw as Profile | null

  const { data: days } = await supabase
    .from('days')
    .select(`*, activities(*)`)
    .eq('trip_id', id)
    .order('position', { ascending: true })

  const initialDays = (days ?? []) as DayWithActivities[]

  // Carica i membri con service role (bypassa la RLS self-referenziale su trip_members
  // che in alcuni contesti Supabase restituisce solo 1 riga invece di tutte)
  const svcClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: allMembersRaw } = await svcClient
    .from('trip_members')
    .select('id, role, joined_at, user_id, profile:profiles(id, username, full_name, avatar_url)')
    .eq('trip_id', id)

  type MemberRow = { id: string; role: string; joined_at: string; user_id: string; profile: Profile | null }
  const allTripMembers = (allMembersRaw ?? []) as unknown as MemberRow[]
  const members = allTripMembers.map(m => m.profile).filter(Boolean) as Profile[]

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  // Immagine hero: cover_url manuale → Wikimedia Commons landscape search → Wikipedia page image
  let heroImgUrl: string | null = trip.cover_url ?? null
  if (!heroImgUrl && trip.destination) {
    const city = trip.destination.split(',')[0].trim()

    // Wikimedia Commons e Wikipedia sono in inglese: traduciamo il nome della città
    // (es. "Parigi" → "Paris", "Roma" → "Rome") con MyMemory (gratuito, già usato in MapTab)
    let cityEn = city
    try {
      const trRes = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(city)}&langpair=it|en`,
        { signal: AbortSignal.timeout(3000), next: { revalidate: 86400 } }
      )
      if (trRes.ok) {
        const trData = await trRes.json()
        const t: string | undefined = trData?.responseData?.translatedText
        if (t && t.trim() && !t.toUpperCase().includes('MYMEMORY') && t.toLowerCase() !== city.toLowerCase()) {
          cityEn = t.trim()
        }
      }
    } catch { /* usa il nome originale */ }

    // ── 1. Wikimedia Commons: cerca foto paesaggistiche della destinazione ────
    // A differenza di Wikipedia page thumbnail (che per paesi restituisce mappe/bandiere),
    // Commons ha migliaia di foto reali filtrabili per orientamento orizzontale
    try {
      const params = new URLSearchParams({
        action:       'query',
        generator:    'search',
        gsrsearch:    `${cityEn} landscape panorama`,
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

    // ── 2. Fallback: Wikipedia page image (usa nome in inglese per en.wikipedia) ──
    if (!heroImgUrl) {
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(cityEn)}&prop=pageimages&piprop=thumbnail&pithumbsize=1000&format=json&origin=*`,
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

  // Badge AI per BottomNav
  const { count: suggestionsCount } = await supabase
    .from('trip_suggestions')
    .select('*', { count: 'exact', head: true })
    .eq('trip_id', id)
  const aiCount = suggestionsCount ?? 0

  const isItinerario = ITINERARIO_IDS.includes(tab)

  return (
    <div className="trip-page">
      {/* Imposta il viaggio nel context */}
      <TripSetter tripId={trip.id} tripName={trip.name} />

      {/* Animazione badge sbloccato — si attiva via Realtime ovunque nell'app */}
      <BadgeUnlockToast tripId={trip.id} userId={user.id} />

      {/* Sondaggio MVP bloccante — si apre automaticamente dal 2° giorno dopo le 09:00 */}
      <MvpVotePrompt
        tripId={trip.id}
        currentUserId={user.id}
        members={members}
        tripStartDate={trip.start_date}
      />

      {/* ── Sub-tab bar Itinerario (sotto la TopAppBar) ── */}
      {isItinerario && (
        <nav className="trip-sub-tabs">
          {ITINERARIO_SUB.map(t => (
            <a key={t.id} href={`/trip/${id}?tab=${t.id}`}
              className={`trip-sub-tab${tab === t.id ? ' trip-sub-tab-active' : ''}`}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </a>
          ))}
        </nav>
      )}

      {/* ── Hero image — solo nella Timeline ── */}
      {tab === 'timeline' && (
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
      )}

      {/* ── Presenza live ── */}
      {tab === 'timeline' && (
        <div className="trip-presence">
          <LivePresence
            tripId={trip.id}
            currentUser={{ id: user.id, username: myProfile?.username || 'tu', avatar_url: myProfile?.avatar_url || null }}
          />
        </div>
      )}

      <main className={`trip-main${!isItinerario ? ' trip-main-full' : ''}`}>
        {tab === 'timeline' && (
          <Timeline
            tripId={trip.id}
            initialDays={initialDays}
            tripStartDate={trip.start_date}
            tripName={trip.name}
            tripDestination={trip.destination}
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
          <GroupBoard tripId={trip.id} currentUserId={user.id} members={members} />
        )}

        {tab === 'documenti' && (
          <DocumentsTab tripId={trip.id} currentUserId={user.id} />
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
                Membri · {allTripMembers.length} {allTripMembers.length === 1 ? 'persona' : 'persone'}
              </h2>
              <div className="members-list">
                {allTripMembers.map((member) => {
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
                          {p?.full_name || p?.username || member.user_id.slice(0, 8)}
                          {isMe && <span className="badge-me">tu</span>}
                        </span>
                        {p?.username && <span className="member-username">@{p.username}</span>}
                      </div>
                      <span className={`role-badge role-${member.role}`}>
                        {member.role === 'owner' ? '👑 Owner' : member.role === 'editor' ? 'Editor' : 'Viewer'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="section">
              <PsicologoSection tripId={trip.id} currentUserId={user.id} members={members} />
            </div>

            {/* Elimina viaggio — solo owner */}
            {myMembership?.role === 'owner' && (
              <div className="section">
                <DeleteTripButton tripId={trip.id} tripName={trip.name} />
              </div>
            )}
          </div>
        )}

        {tab === 'classifica' && (
          <GamificationTab
            tripId={trip.id}
            currentUserId={user.id}
            members={members}
            tripEndDate={trip.end_date}
            destination={trip.destination}
          />
        )}

        {tab === 'suggerimenti' && (
          <SuggestionsPanel
            tripId={trip.id}
            currentUserId={user.id}
            days={initialDays}
          />
        )}
      </main>

    </div>
  )
}
