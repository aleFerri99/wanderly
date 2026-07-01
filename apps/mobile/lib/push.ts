import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from './supabase'
import { savePushToken } from '@repo/shared/supabase/queries/notifications'

// Mostra le notifiche anche con app in primo piano.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
    }),
  })
}

// Registra il token Expo push per l'utente corrente (solo su device reale).
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return
  try {
    let { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status
    if (status !== 'granted') return

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Wanderly', importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    if (token?.data) await savePushToken(supabase, token.data, Platform.OS)
  } catch {
    // projectId mancante / permessi negati / non su device: nessuna push, non blocca l'app
  }
}

// Naviga al viaggio quando l'utente tocca una notifica MVP. Ritorna l'unsubscribe.
export function listenForPushTaps(onTrip: (tripId: string) => void): () => void {
  if (Platform.OS === 'web') return () => {}
  const sub = Notifications.addNotificationResponseReceivedListener(resp => {
    const data = resp.notification.request.content.data as { trip_id?: string } | undefined
    if (data?.trip_id) onTrip(data.trip_id)
  })
  return () => sub.remove()
}
