import { useEffect, useState } from 'react'
import { View, ScrollView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getSharedItinerary, importSharedItinerary, type SharedItinerary } from '@repo/shared/supabase/queries/share'
import { Header, Txt, Card, Button, DateField, Skeleton } from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'

const todayISO = () => new Date().toISOString().split('T')[0]

export default function ImportScreen() {
  const router = useRouter()
  const { token } = useLocalSearchParams<{ token: string }>()
  const { session } = useAuth()

  const [itin,     setItin]     = useState<SharedItinerary | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [start,    setStart]    = useState(todayISO())
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!token) { setNotFound(true); setLoading(false); return }
      const it = await getSharedItinerary(supabase, token)
      if (!alive) return
      if (!it) setNotFound(true); else setItin(it)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [token])

  async function onImport() {
    if (!itin || !start) return
    if (!session) {  // serve l'accesso: salva il token e vai al login (ripreso dopo)
      await AsyncStorage.setItem('pending_import', token ?? '')
      router.replace('/(auth)/login')
      return
    }
    setBusy(true); setErr(null)
    const res = await importSharedItinerary(supabase, itin, start)
    setBusy(false)
    if (res.error || !res.tripId) { setErr(res.error ?? 'Errore durante l\'import'); return }
    router.replace(`/(app)/trip/${res.tripId}/overview`)
  }

  const totalDays = itin ? itin.stops.reduce((s, st) => s + Math.max(1, st.days), 0) : 0
  const totalActs = itin ? itin.stops.reduce((s, st) => s + st.activities.length, 0) : 0

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Importa itinerario" onBack={() => router.replace('/(app)')} />

      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}><Skeleton height={130} radius={radius.xl} /><Skeleton height={120} radius={radius.lg} /></View>
      ) : notFound ? (
        <View style={{ padding: space.lg, alignItems: 'center', paddingTop: 60 }}>
          <Txt style={{ fontSize: 44 }}>🔗</Txt>
          <Txt variant="heading" style={{ marginTop: space.md }}>Link non valido</Txt>
          <Txt variant="body" color={colors.textSoft} style={{ textAlign: 'center', marginTop: 4 }}>Questo itinerario non esiste più o il link è errato.</Txt>
          <Button title="Vai alla home" variant="secondary" onPress={() => router.replace('/(app)')} style={{ marginTop: space.lg }} />
        </View>
      ) : itin ? (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 40 }}>
          <Card gradient="party" style={{ marginBottom: space.md }}>
            <Txt variant="label" color="rgba(255,255,255,0.9)">ITINERARIO CONDIVISO</Txt>
            <Txt variant="title" color={colors.white}>{itin.name.toUpperCase()}</Txt>
            {itin.destination && <Txt variant="label" color="rgba(255,255,255,0.92)" style={{ marginTop: 2 }}>📍 {itin.destination}</Txt>}
            <Txt variant="caption" color="rgba(255,255,255,0.85)" style={{ marginTop: 6 }}>{itin.stops.length} tappe · {totalActs} attività · {totalDays} giorni</Txt>
          </Card>

          <Card elevation="soft" style={{ marginBottom: space.md }}>
            {itin.stops.map((st, i) => (
              <View key={i} style={{ paddingVertical: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                <Txt variant="bodyStrong">{i + 1}. {st.title}</Txt>
                <Txt variant="caption" color={colors.textSoft}>{st.days} giorn{st.days === 1 ? 'o' : 'i'} · {st.activities.length} attività</Txt>
              </View>
            ))}
          </Card>

          <DateField label="Data d'inizio del tuo viaggio" icon="calendar-blank-outline" value={start} onChange={setStart} />
          <Txt variant="caption" color={colors.textFaint} style={{ marginTop: 6 }}>
            Le date di tappe e attività verranno impostate in automatico a partire da questa data. Gli orari restano da definire.
          </Txt>

          {err && <Txt variant="label" color={colors.danger} style={{ marginTop: space.sm }}>❌ {err}</Txt>}
          {!session && <Txt variant="label" color={colors.textSoft} style={{ marginTop: space.sm }}>Accedi per importare l'itinerario nel tuo account.</Txt>}

          <Button title={session ? 'Importa viaggio' : 'Accedi e importa'} gradient="party" icon="tray-arrow-down" loading={busy} disabled={busy || !start} onPress={onImport} full style={{ marginTop: space.md }} />
        </ScrollView>
      ) : null}
    </View>
  )
}
