import { View, type StyleProp, type ViewStyle } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { PressableScale } from './PressableScale'
import { Txt } from './Txt'
import { colors, radius, space } from '@/lib/tokens'

export function Chip({
  label, icon, tint, color, selected, onPress, style,
}: {
  label: string
  icon?: keyof typeof MaterialCommunityIcons.glyphMap
  tint?: string
  color?: string
  selected?: boolean
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const bg = selected ? colors.primary : (tint ?? colors.primarySoft)
  const fg = selected ? colors.onPrimary : (color ?? colors.onPrimarySoft)
  const body = (
    <View
      style={[
        {
          flexDirection: 'row', alignItems: 'center', gap: 4,
          backgroundColor: bg, borderRadius: radius.pill,
          paddingVertical: 5, paddingHorizontal: space.md,
        },
        style,
      ]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={14} color={fg} />}
      <Txt variant="caption" color={fg}>{label}</Txt>
    </View>
  )
  return onPress ? <PressableScale onPress={onPress}>{body}</PressableScale> : body
}
