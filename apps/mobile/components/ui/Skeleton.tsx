import { useEffect, useRef } from 'react'
import { Animated, type DimensionValue } from 'react-native'
import { radius as radiusTokens, palette } from '@/lib/tokens'

// Placeholder shimmer (pulsazione opacità) al posto degli spinner.
export function Skeleton({
  width = '100%', height = 16, radius = radiusTokens.md, style,
}: {
  width?: DimensionValue
  height?: number
  radius?: number
  style?: object
}) {
  const o = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [o])

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: palette.line, opacity: o }, style]}
    />
  )
}
