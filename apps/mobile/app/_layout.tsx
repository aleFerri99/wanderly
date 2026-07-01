import { useEffect, type ReactNode } from 'react'
import { View, Platform, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  useFonts,
  PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors } from '@/lib/tokens'
import { Skeleton } from '@/components/ui'
import { AuthProvider, useAuth } from '@/lib/auth'
import { registerForPush, listenForPushTaps } from '@/lib/push'

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  })

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <PhoneFrame>
          {fontsLoaded ? (
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          ) : (
            <View style={{ flex: 1, backgroundColor: colors.bg }} />
          )}
        </PhoneFrame>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

// Su web l'app si stira a tutta la finestra: la confiniamo a una colonna
// "da telefono" centrata, con letterbox ai lati. Su mobile è un passthrough.
function PhoneFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>
  return (
    <View style={frameStyles.letterbox}>
      <View style={frameStyles.column}>{children}</View>
    </View>
  )
}

const frameStyles = StyleSheet.create({
  letterbox: { flex: 1, alignItems: 'center', backgroundColor: '#E4E2D7' },
  column:    { flex: 1, width: '100%', maxWidth: 460, backgroundColor: colors.bg, overflow: 'hidden' },
})

// Auth gate: reindirizza in base alla sessione e al gruppo di route corrente.
function RootNavigator() {
  const { session, loading } = useAuth()
  const segments = useSegments()
  const router   = useRouter()

  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    const inImport    = segments[0] === 'import'   // deep link condivisione: lascialo passare
    if (!session && !inAuthGroup && !inImport) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      // Dopo il login: se c'era un import in sospeso (da un link), riprendilo.
      AsyncStorage.getItem('pending_import').then(tok => {
        if (tok) { AsyncStorage.removeItem('pending_import'); router.replace(`/import/${tok}`) }
        else router.replace('/(app)')
      })
    }
  }, [session, loading, segments, router])

  // Push: registra il token quando c'è una sessione e naviga al tocco della notifica.
  useEffect(() => { if (session) registerForPush() }, [session])
  useEffect(() => listenForPushTaps(tripId => router.push(`/(app)/trip/${tripId}/overview`)), [router])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 120, paddingHorizontal: 16, gap: 14 }}>
        <Skeleton width={160} height={26} />
        <Skeleton height={120} radius={26} />
        <Skeleton height={120} radius={26} />
      </View>
    )
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
