import { useEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Txt } from './Txt'
import { palette, radius, space, shadow, colors } from '@/lib/tokens'

// Toast animato in basso, auto-dismiss. `message` null = nascosto.
export function Toast({ message, onHide, duration = 4000 }: {
  message: string | null
  onHide: () => void
  duration?: number
}) {
  const insets = useSafeAreaInsets()
  const cb = useRef(onHide); cb.current = onHide

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => cb.current(), duration)
    return () => clearTimeout(t)
  }, [message, duration])

  return (
    <AnimatePresence>
      {message && (
        <MotiView
          key="toast"
          from={{ opacity: 0, translateY: 40 }}
          animate={{ opacity: 1, translateY: 0 }}
          exit={{ opacity: 0, translateY: 40 }}
          transition={{ type: 'spring', damping: 16, stiffness: 200 }}
          style={[styles.wrap, { bottom: insets.bottom + space.lg }]}
          pointerEvents="none"
        >
          <Txt variant="bodyStrong" color={colors.white} style={{ textAlign: 'center' }}>{message}</Txt>
        </MotiView>
      )}
    </AnimatePresence>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, backgroundColor: palette.ink, borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.lg, ...shadow.pop },
})
