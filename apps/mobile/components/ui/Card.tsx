import { View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, radius, shadow, space, gradients, type GradientName } from '@/lib/tokens'
import type { ReactNode } from 'react'

type Elevation = 'flat' | 'soft' | 'card' | 'pop'

export function Card({
  style, padded = true, elevation = 'card', tint, gradient, children, ...rest
}: ViewProps & {
  style?: StyleProp<ViewStyle>
  padded?: boolean
  elevation?: Elevation
  tint?: string
  gradient?: GradientName
  children?: ReactNode
}) {
  const base: ViewStyle = { borderRadius: radius.xl, padding: padded ? space.lg : 0 }
  const elev = elevation === 'flat' ? null : shadow[elevation]

  if (gradient) {
    return (
      <View {...rest} style={[{ borderRadius: radius.xl }, elev, style]}>
        <LinearGradient colors={gradients[gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={base}>
          {children}
        </LinearGradient>
      </View>
    )
  }

  return (
    <View {...rest} style={[base, { backgroundColor: tint ?? colors.card }, elev, style]}>
      {children}
    </View>
  )
}
