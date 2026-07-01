import { Alert, Platform } from 'react-native'

// Conferma cross-platform. Su web Alert.alert di react-native-web non mostra i
// pulsanti (il callback non scatta): usiamo window.confirm. Su iOS/Android usa Alert.
export function confirmAction(
  title: string,
  message: string | undefined,
  onConfirm: () => void,
  opts?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
) {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && window.confirm(message ? `${title}\n\n${message}` : title)
    if (ok) onConfirm()
    return
  }
  Alert.alert(title, message, [
    { text: opts?.cancelLabel ?? 'Annulla', style: 'cancel' },
    { text: opts?.confirmLabel ?? 'Conferma', style: opts?.destructive ? 'destructive' : 'default', onPress: onConfirm },
  ])
}
