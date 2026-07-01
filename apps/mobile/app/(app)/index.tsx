import { useCallback, useEffect, useState } from 'react'
import { View, FlatList, StyleSheet, RefreshControl, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getUserTrips, createTrip, joinTrip, backfillTripCovers, type TripWithMembers } from '@repo/shared/supabase/queries/trips'
import {
  Screen, Txt, Avatar, PressableScale, Skeleton, FAB, Sheet, Input, Button, Appear, DateField, Segmented,
} from '@/components/ui'
import { colors, gradients, radius, space, shadow } from '@/lib/tokens'

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : null

const UNSPLASH_KEY = process.env.EXPO_PUBLIC_UNSPLASH_KEY ?? null

export default function Dashboard() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { session } = useAuth()

  const [trips,      setTrips]      = useState<TripWithMembers[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [sheet, setSheet] = useState<'create' | 'join' | null>(null)
  const [cName, setCName] = useState(''); const [cDest, setCDest] = useState('')
  const [cStart, setCStart] = useState(''); const [cEnd, setCEnd] = useState('')
  const [jCode, setJCode] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')

  const name = (session?.user?.user_metadata?.full_name as string | undefined)?.split(' ')[0]
    ?? (session?.user?.user_metadata?.username as string | undefined) ?? 'viaggiatore'

  const load = useCallback(async () => {
    if (!session?.user) return
    const t = await getUserTrips(supabase, session.user.id)
    setTrips(t); setLoading(false); setRefreshing(false)
    // Copertine: cerca e salva una foto per i viaggi che non ce l'hanno (one-time)
    backfillTripCovers(supabase, t, UNSPLASH_KEY).then(updated => { if (updated !== t) setTrips(updated) })
  }, [session?.user])

  useEffect(() => { load() }, [load])

  function close() { setSheet(null); setErr(null); setCName(''); setCDest(''); setCStart(''); setCEnd(''); setJCode('') }

  async function onCreate() {
    if (!cName.trim()) return
    setBusy(true); setErr(null)
    const res = await createTrip(supabase, { name: cName, destination: cDest, startDate: cStart || null, endDate: cEnd || null })
    setBusy(false)
    if (res.error || !res.tripId) { setErr(res.error ?? 'Errore'); return }
    close(); router.push(`/(app)/trip/${res.tripId}`)
  }
  async function onJoin() {
    if (!jCode.trim()) return
    setBusy(true); setErr(null)
    const res = await joinTrip(supabase, jCode)
    setBusy(false)
    if (res.error || !res.tripId) { setErr(res.error ?? 'Codice non valido'); return }
    close(); router.push(`/(app)/trip/${res.tripId}`)
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const isPast = (t: TripWithMembers) => !!t.end_date && t.end_date < todayStr
  const upcoming = trips.filter(t => !isPast(t)).sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'))
  const past = trips.filter(isPast).sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))
  const shown = view === 'past' ? past : upcoming

  return (
    <Screen bg={colors.bg}>
      {/* Barra logo */}
      <View style={styles.topBar}>
        <View style={{ width: 40 }} />
        <View style={styles.logo}>
          <View style={styles.logoIcon}>
            <LinearGradient colors={gradients.party} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <MaterialCommunityIcons name="airplane" size={16} color={colors.white} />
          </View>
          <Txt variant="heading" style={{ letterSpacing: 0.3 }}>Wanderly</Txt>
        </View>
        <PressableScale onPress={() => router.push('/(app)/profile')}>
          <Avatar name={name} size={40} />
        </PressableScale>
      </View>

      {/* Saluto + titolo */}
      <View style={styles.greet}>
        <Txt variant="label" color={colors.textSoft}>Ciao, {name} 👋</Txt>
        <Txt variant="display" style={{ marginTop: 2 }}>
          {loading ? 'I tuoi viaggi' : trips.length === 0 ? 'Pronti a partire?' : `Hai ${upcoming.length} viagg${upcoming.length === 1 ? 'io' : 'i'} in programma`}
        </Txt>
      </View>

      {/* Menu In programma / Passati */}
      {!loading && trips.length > 0 && (
        <View style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>
          <Segmented value={view} onChange={setView} options={[
            { value: 'upcoming', label: `In programma · ${upcoming.length}`, icon: 'calendar-star' },
            { value: 'past', label: `Passati · ${past.length}`, icon: 'history' },
          ]} />
        </View>
      )}

      {loading ? (
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <Skeleton height={150} radius={radius.xl} />
          <Skeleton height={150} radius={radius.xl} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={t => t.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + 110, paddingTop: space.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={colors.primary} />}
          ListEmptyComponent={
            trips.length === 0 ? (
              <Appear style={{ alignItems: 'center', paddingTop: 60 }}>
                <Txt style={{ fontSize: 52 }}>🗺️</Txt>
                <Txt variant="heading" style={{ marginTop: space.md }}>Nessun viaggio ancora</Txt>
                <Txt variant="body" color={colors.textSoft} style={{ textAlign: 'center', marginTop: 4, maxWidth: 260 }}>
                  Tocca + per creare un viaggio o unirti con un codice invito.
                </Txt>
              </Appear>
            ) : (
              <Appear style={{ alignItems: 'center', paddingTop: 50 }}>
                <Txt style={{ fontSize: 44 }}>{view === 'past' ? '🗄️' : '🧳'}</Txt>
                <Txt variant="body" color={colors.textSoft} style={{ marginTop: space.sm, textAlign: 'center', maxWidth: 260 }}>
                  {view === 'past' ? 'Nessun viaggio passato.' : 'Nessun viaggio in programma. Tocca + per crearne uno.'}
                </Txt>
              </Appear>
            )
          }
          renderItem={({ item, index }) => {
            const start = fmtDate(item.start_date)
            const end   = fmtDate(item.end_date)
            const grad  = (['party', 'ocean', 'sunset', 'teal'] as const)[index % 4]
            return (
              <Appear index={index}>
                <PressableScale onPress={() => router.push(`/(app)/trip/${item.id}/overview`)} style={{ marginBottom: space.md }}>
                  <View style={[{ borderRadius: radius.xl }, shadow.card]}>
                    <View style={styles.tripCard}>
                      {item.cover_url
                        ? <Image source={{ uri: item.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        : <LinearGradient colors={gradients[grad]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                      <LinearGradient colors={['rgba(20,28,18,0.05)', 'rgba(20,28,18,0.82)']} style={StyleSheet.absoluteFill} />

                      <View style={styles.tripBody}>
                        <View style={styles.tripTop}>
                          <MaterialCommunityIcons name="arrow-top-right" size={20} color={colors.white} style={styles.tripArrow} />
                        </View>
                        <View>
                          <Txt variant="title" color={colors.white} numberOfLines={1}>{item.name.toUpperCase()}</Txt>
                          {item.destination && <Txt variant="label" color="rgba(255,255,255,0.92)" style={{ marginTop: 1 }}>📍 {item.destination}</Txt>}
                          <View style={styles.tripFooter}>
                            {start && (
                              <View style={styles.pill}>
                                <MaterialCommunityIcons name="calendar-blank" size={12} color={colors.white} />
                                <Txt variant="caption" color={colors.white}>{start}{end ? ` → ${end}` : ''}</Txt>
                              </View>
                            )}
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              {item.members.slice(0, 4).map((m, i) => (
                                <Avatar key={m.id} name={m.full_name || m.username} size={26} bg="rgba(255,255,255,0.25)" color={colors.white} style={{ marginLeft: i === 0 ? 0 : -8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' }} />
                              ))}
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                </PressableScale>
              </Appear>
            )
          }}
        />
      )}

      {/* Azioni: due FAB impilati */}
      <FAB icon="account-multiple-plus" gradient="ocean" onPress={() => setSheet('join')} style={{ right: space.lg, bottom: insets.bottom + 86 }} />
      <FAB icon="plus" label="Viaggio" gradient="party" onPress={() => setSheet('create')} style={{ right: space.lg, bottom: insets.bottom + 22 }} />

      {/* Sheet crea */}
      <Sheet visible={sheet === 'create'} onClose={close} title="Nuovo viaggio ✨">
        <View style={{ gap: space.md }}>
          <Input label="Nome viaggio" icon="tag-heart-outline" value={cName} onChangeText={setCName} placeholder="Estate a Vienna" />
          <Input label="Destinazione" icon="map-marker-outline" value={cDest} onChangeText={setCDest} placeholder="Vienna, Austria" />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <DateField label="Dal" icon="calendar-blank-outline" value={cStart} onChange={setCStart} containerStyle={{ flex: 1 }} />
            <DateField label="Al" icon="calendar-check-outline" value={cEnd} onChange={setCEnd} containerStyle={{ flex: 1 }} />
          </View>
          {err && <Txt variant="label" color={colors.danger}>❌ {err}</Txt>}
          <Button title="Crea viaggio" gradient="party" icon="rocket-launch" loading={busy} disabled={!cName.trim()} onPress={onCreate} full style={{ marginTop: space.sm }} />
        </View>
      </Sheet>

      {/* Sheet unisciti */}
      <Sheet visible={sheet === 'join'} onClose={close} title="Unisciti a un viaggio">
        <View style={{ gap: space.md }}>
          <Input label="Codice invito" icon="key-variant" value={jCode} onChangeText={t => setJCode(t.toUpperCase())} autoCapitalize="characters" placeholder="ABC123" />
          {err && <Txt variant="label" color={colors.danger}>❌ {err}</Txt>}
          <Button title="Unisciti" gradient="ocean" icon="login" loading={busy} disabled={!jCode.trim()} onPress={onJoin} full style={{ marginTop: space.sm }} />
        </View>
      </Sheet>

    </Screen>
  )
}

const styles = StyleSheet.create({
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.sm },
  logo:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoIcon:   { width: 30, height: 30, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  greet:      { paddingHorizontal: space.lg, paddingBottom: space.md },
  tripCard:   { height: 188, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.primary },
  tripBody:   { ...StyleSheet.absoluteFillObject, padding: space.lg, justifyContent: 'space-between' },
  tripTop:    { flexDirection: 'row', justifyContent: 'flex-end' },
  tripArrow:  { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.pill, padding: 6, overflow: 'hidden' },
  pill:       { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  tripFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
})
