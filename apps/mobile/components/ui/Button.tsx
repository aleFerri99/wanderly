import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { PressableScale } from './PressableScale'
import { Txt } from './Txt'
import { colors, radius, space, shadow, gradients, type GradientName } from '@/lib/tokens'

type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const BG: Record<Variant, string> = {
  primary: colors.primary, secondary: colors.secondary, tertiary: colors.tertiary,
  ghost: 'transparent', danger: colors.danger,
}
const FG: Record<Variant, string> = {
  primary: colors.onPrimary, secondary: colors.onSecondary, tertiary: colors.onTertiary,
  ghost: colors.primary, danger: colors.white,
}
const PAD: Record<Size, { v: number; h: number; font: number; icon: number }> = {
  sm: { v: 9,  h: 16, font: 13, icon: 16 },
  md: { v: 13, h: 22, font: 15, icon: 18 },
  lg: { v: 16, h: 26, font: 16, icon: 20 },
}

export function Button({
  title, onPress, variant = 'primary', size = 'md', gradient, icon, loading, disabled, full, haptic, style,
}: {
  title: string
  onPress?: () => void
  variant?: Variant
  size?: Size
  gradient?: GradientName
  icon?: keyof typeof MaterialCommunityIcons.glyphMap
  loading?: boolean
  disabled?: boolean
  full?: boolean
  haptic?: 'light' | 'medium' | 'heavy' | 'none'
  style?: StyleProp<ViewStyle>
}) {
  const p = PAD[size]
  const off = disabled || loading
  const fg = gradient ? colors.white : FG[variant]

  const inner = (
    <>
      {loading
        ? <ActivityIndicator size="small" color={fg} />
        : icon && <MaterialCommunityIcons name={icon} size={p.icon} color={fg} />}
      <Txt variant="bodyStrong" color={fg} style={{ fontSize: p.font }}>{title}</Txt>
    </>
  )

  const padStyle: ViewStyle = {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
    paddingVertical: p.v, paddingHorizontal: p.h, borderRadius: radius.pill,
  }

  return (
    <PressableScale onPress={off ? undefined : onPress} haptic={haptic ?? 'light'} style={[full && { alignSelf: 'stretch' }, { opacity: off ? 0.55 : 1 }, style]}>
      {gradient ? (
        <LinearGradient colors={gradients[gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[padStyle, shadow.soft]}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={[padStyle, { backgroundColor: BG[variant], borderWidth: variant === 'ghost' ? 1.5 : 0, borderColor: colors.primary }, variant !== 'ghost' && shadow.soft]}>
          {inner}
        </View>
      )}
    </PressableScale>
  )
}
