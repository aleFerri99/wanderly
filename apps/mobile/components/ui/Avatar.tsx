import { View, type StyleProp, type ViewStyle } from 'react-native'
import { Txt } from './Txt'
import { colors } from '@/lib/tokens'

export function Avatar({
  name, size = 40, bg, color, style,
}: {
  name: string | null | undefined
  size?: number
  bg?: string
  color?: string
  style?: StyleProp<ViewStyle>
}) {
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Txt variant="bodyStrong" color={color ?? colors.primary} style={{ fontSize: size * 0.36 }}>{initials}</Txt>
    </View>
  )
}
