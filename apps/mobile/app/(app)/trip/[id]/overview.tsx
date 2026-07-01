import { useCallback, useState } from 'react'
import { View, ScrollView, StyleSheet, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGlobalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { getTripDays } from '@repo/shared/supabase/queries/timeline'
import { getExpenses } from '@repo/shared/supabase/queries/expenses'
import { getTripGroup, refreshTripCover } from '@repo/shared/supabase/queries/trips'
import { getBoardItems } from '@repo/shared/supabase/queries/board'
import { Txt, Card, IconButton, ProgressRing, ProgressBar, Skeleton, PressableScale, Appear } from '@/components/ui'
import { MvpPollSheet } from '@/components/trip/MvpPollSheet'
import { colors, gradients, radius, space, shadow } from '@/lib/tokens'
import type { DayWithActivities } from '@repo/shared/types/database'

const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
const todayStr = () => new Date().toISOString().split('T')[0]
const UNSPLASH_KEY = process.env.EXPO_PUBLIC_UNSPLASH_KEY ?? null

interface TripInfo { name: string; destination: string | null; start: string | null; end: string | null; cover: string | null }

export default function Overview() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useGlobalSearchParams<{ id: string }>()

  const [trip,    setTrip]    = useState<TripInfo | null>(null)
  const [days,    setDays]    = useState<DayWithActivities[]>([])
  const [total,   setTotal]   = useState(0)
  const [members, setMembers] = useState(0)
  const [packDone, setPackDone] = useState(0)
  const [packTot,  setPackTot]  = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [t, d, exp, g, board] = await Promise.all([
      supabase.from('trips').select('name, destination, start_date, end_date, cover_url').eq('id', id).single(),
      getTripDays(supabase, id), getExpenses(supabase, id), getTripGroup(supabase, id), getBoardItems(supabase, id),
    ])
    const td = t.data as { name: string; destination: string | null; start_date: string | null; end_date: string | null; cover_url: string | null } | null
    if (td) {
      setTrip({ name: td.name, destination: td.destination, start: td.start_date, end: td.end_date, cover: td.cover_url })
      // Scarica/aggiorna la copertina (promuove le foto Wikipedia a Unsplash se c'è la chiave)
      refreshTripCover(supabase, id, td.destination, td.cover_url, UNSPLASH_KEY)
        .then(url => { if (url && url !== td.cover_url) setTrip(p => p && { ...p, cover: url }) })
    }
    setDays(d)
    setTotal((exp as { amount_eur?: number; amount: number }[]).reduce((s, e) => s + (e.amount_eur ?? e.amount), 0))
    setMembers(g.members.length)
    const pack = board.filter(b => b.content_type === 'packing')
    setPackTot(pack.length); setPackDone(pack.filter(p => p.is_completed).length)
    setLoading(false)
  }, [id])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const acts = days.flatMap(d => d.activities ?? [])
  const done = acts.filter(a => a.status === 'done').length
  const progress = acts.length ? Math.round((done / acts.length) * 100) : 0
  const packPct = packTot ? Math.round((packDone / packTot) * 100) : 0

  // Prossima attività da fare (per data+ora)
  const nextUp = days.flatMap(d => (d.activities ?? []).map(a => ({ a, dayTitle: d.title, date: a.activity_date ?? d.date })))
    .filter(x => x.a.status !== 'done')
    .sort((p, q) => `${p.date ?? '9999'}${p.a.time_start ?? '99'}`.localeCompare(`${q.date ?? '9999'}${q.a.time_start ?? '99'}`))[0]

  const tripDates = trip?.start ? `${fmtDate(trip.start)}${trip.end ? ` → ${fmtDate(trip.end)}` : ''}` : null
  const ready = progress === 100 ? 'Tutto fatto! 🎉' : progress >= 60 ? 'Ci siamo quasi' : progress > 0 ? 'In corso' : 'Si parte!'

  const ACTIONS: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; route: string; tint: string; ink: string }[] = [
    { icon: 'lightbulb-on-outline', label: 'Suggerimenti', route: 'suggestions', tint: colors.secondarySoft, ink: colors.secondary },
    { icon: 'trophy-outline',       label: 'Classifica',   route: 'leaderboard', tint: colors.primarySoft,   ink: colors.primary },
    { icon: 'brain',                label: 'Psicologo',    route: 'psicologo',   tint: colors.tertiarySoft,  ink: colors.tertiary },
    { icon: 'puzzle-outline',       label: 'Trivia',       route: 'trivia',      tint: colors.pinkSoft,      ink: colors.pink },
  ]

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 50, paddingHorizontal: space.lg, gap: space.md }}><Skeleton height={120} radius={radius.xl} /><Skeleton height={150} radius={radius.xl} /><Skeleton height={90} radius={radius.xl} /></View>
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: insets.bottom + 110 }}>
        {/* Hero */}
        {trip?.cover ? (
          <Appear>
            <View style={[styles.heroCard, shadow.card]}>
              <Image source={{ uri: trip.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <LinearGradient colors={['rgba(20,28,18,0.15)', 'rgba(20,28,18,0.85)']} style={StyleSheet.absoluteFill} />
              <View style={styles.heroCardTop}>
                <IconButton icon="home-outline" size={22} bg="rgba(255,255,255,0.25)" color={colors.white} onPress={() => router.navigate('/(app)')} />
                <IconButton icon="cog-outline" size={20} bg="rgba(255,255,255,0.25)" color={colors.white} onPress={() => router.push(`/(app)/trip/${id}/group`)} />
              </View>
              <View style={styles.heroCardBottom}>
                <Txt variant="display" color={colors.white} numberOfLines={2}>{trip.name}</Txt>
                <View style={styles.heroMeta}>
                  {trip.destination && <Txt variant="label" color="rgba(255,255,255,0.92)">📍 {trip.destination}</Txt>}
                  {tripDates && <Txt variant="label" color="rgba(255,255,255,0.92)">🗓️ {tripDates}</Txt>}
                </View>
              </View>
            </View>
          </Appear>
        ) : (
          <>
            <View style={styles.heroTop}>
              <IconButton icon="home-outline" size={22} bg={colors.card} onPress={() => router.navigate('/(app)')} />
              <IconButton icon="cog-outline" size={20} bg={colors.card} color={colors.textSoft} onPress={() => router.push(`/(app)/trip/${id}/group`)} />
            </View>
            <Appear>
              <Txt variant="display" style={{ marginTop: space.sm }}>{trip?.name ?? 'Viaggio'}</Txt>
              <View style={styles.heroMeta}>
                {trip?.destination && <Txt variant="label" color={colors.textSoft}>📍 {trip.destination}</Txt>}
                {tripDates && <Txt variant="label" color={colors.textSoft}>🗓️ {tripDates}</Txt>}
              </View>
            </Appear>
          </>
        )}

        {/* Trip readiness */}
        <Appear index={1}>
          <View style={[{ borderRadius: radius.xl, marginTop: space.lg }, shadow.card]}>
            <LinearGradient colors={gradients.party} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ready}>
              <ProgressRing progress={acts.length ? done / acts.length : 0} size={84} stroke={9} color={colors.white} track="rgba(255,255,255,0.28)">
                <Txt variant="bodyStrong" color={colors.white} style={{ fontSize: 18 }}>{progress}%</Txt>
              </ProgressRing>
              <View style={{ flex: 1 }}>
                <Txt variant="caption" color="rgba(255,255,255,0.85)">PREPARAZIONE VIAGGIO</Txt>
                <Txt variant="title" color={colors.white}>{ready}</Txt>
                <View style={styles.readyChecks}>
                  <View style={styles.check}><MaterialCommunityIcons name="check-circle" size={14} color={colors.white} /><Txt variant="caption" color={colors.white}>{done}/{acts.length} attività</Txt></View>
                  <View style={styles.check}><MaterialCommunityIcons name="bag-personal" size={14} color={colors.white} /><Txt variant="caption" color={colors.white}>Valigia {packPct}%</Txt></View>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Appear>

        {/* Prossima attività */}
        {nextUp && (
          <Appear index={2}>
            <PressableScale haptic="light" onPress={() => router.push(`/(app)/trip/${id}`)}>
              <Card elevation="soft" style={{ marginTop: space.md }}>
                <View style={styles.nextRow}>
                  <View style={styles.nextIcon}><MaterialCommunityIcons name="map-marker-radius" size={22} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" color={colors.textFaint}>PROSSIMA TAPPA</Txt>
                    <Txt variant="bodyStrong">{nextUp.a.title}</Txt>
                    <Txt variant="caption" color={colors.textSoft}>
                      {nextUp.dayTitle}{nextUp.a.time_start ? ` · ${nextUp.a.time_start.slice(0, 5)}` : ''}{nextUp.date ? ` · ${fmtDate(nextUp.date)}` : ''}
                    </Txt>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
                </View>
              </Card>
            </PressableScale>
          </Appear>
        )}

        {/* Stat rapide */}
        <Appear index={3}>
          <View style={styles.statRow}>
            <Card elevation="soft" padded={false} style={styles.statCard}><MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} /><Txt variant="bodyStrong" style={{ marginTop: 4 }}>{total.toFixed(0)} €</Txt><Txt variant="caption" color={colors.textFaint}>spese</Txt></Card>
            <Card elevation="soft" padded={false} style={styles.statCard}><MaterialCommunityIcons name="account-group-outline" size={18} color={colors.primary} /><Txt variant="bodyStrong" style={{ marginTop: 4 }}>{members}</Txt><Txt variant="caption" color={colors.textFaint}>membri</Txt></Card>
            <Card elevation="soft" padded={false} style={styles.statCard}><MaterialCommunityIcons name="calendar-outline" size={18} color={colors.primary} /><Txt variant="bodyStrong" style={{ marginTop: 4 }}>{days.length}</Txt><Txt variant="caption" color={colors.textFaint}>tappe</Txt></Card>
          </View>
        </Appear>

        {packTot > 0 && (
          <Appear index={4}>
            <Card elevation="soft" style={{ marginTop: space.md }}>
              <View style={styles.nextRow}>
                <Txt variant="bodyStrong" style={{ flex: 1 }}>🎒 Valigia</Txt>
                <Txt variant="label" color={colors.textSoft}>{packDone}/{packTot}</Txt>
              </View>
              <View style={{ marginTop: space.sm }}><ProgressBar progress={packTot ? packDone / packTot : 0} color={colors.secondary} track={colors.secondarySoft} height={7} /></View>
            </Card>
          </Appear>
        )}

        {/* Azioni rapide */}
        <Txt variant="heading" style={{ marginTop: space.xl, marginBottom: space.sm }}>Azioni rapide</Txt>
        <Appear index={5}>
          <View style={styles.actions}>
            {[ACTIONS.slice(0, 2), ACTIONS.slice(2, 4)].map((row, ri) => (
              <View key={ri} style={styles.actionRow}>
                {row.map(a => (
                  <PressableScale key={a.route} haptic="light" onPress={() => router.push(`/(app)/trip/${id}/${a.route}`)} style={styles.actionTile}>
                    <View style={[styles.actionIcon, { backgroundColor: a.tint }]}><MaterialCommunityIcons name={a.icon} size={24} color={a.ink} /></View>
                    <Txt variant="label" style={{ textAlign: 'center' }}>{a.label}</Txt>
                  </PressableScale>
                ))}
              </View>
            ))}
          </View>
        </Appear>
      </ScrollView>

      <MvpPollSheet tripId={id} />
    </View>
  )
}

const styles = StyleSheet.create({
  heroTop:    { flexDirection: 'row', justifyContent: 'space-between' },
  heroCard:   { height: 230, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.primary, justifyContent: 'space-between' },
  heroCardTop:{ flexDirection: 'row', justifyContent: 'space-between', padding: space.md },
  heroCardBottom: { padding: space.lg },
  heroMeta:   { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: 4 },
  ready:      { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: radius.xl, padding: space.lg },
  readyChecks:{ flexDirection: 'row', gap: space.md, marginTop: space.sm },
  check:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextRow:    { flexDirection: 'row', alignItems: 'center', gap: space.md },
  nextIcon:   { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  statRow:    { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  statCard:   { flex: 1, alignItems: 'center', paddingVertical: space.md },
  actions:    { gap: space.sm },
  actionRow:  { flexDirection: 'row', gap: space.sm },
  actionTile: { flex: 1, alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: space.lg, paddingHorizontal: space.md, ...shadow.soft },
  actionIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
})
