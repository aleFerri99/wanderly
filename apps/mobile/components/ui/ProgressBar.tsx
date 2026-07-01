import { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'
import { colors, radius } from '@/lib/tokens'

// Barra di avanzamento animata (riempimento con molla).
export function ProgressBar({
  progress, color = colors.primary, track = colors.line, height = 10,
}: {
  progress: number   // 0..1
  color?: string
  track?: string
  height?: number
}) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(v, { toValue: Math.max(0, Math.min(1, progress)), useNativeDriver: false, damping: 16, stiffness: 160, mass: 0.9 }).start()
  }, [progress, v])

  const width = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <View style={{ height, borderRadius: radius.pill, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={{ width, height: '100%', borderRadius: radius.pill, backgroundColor: color }} />
    </View>
  )
}
