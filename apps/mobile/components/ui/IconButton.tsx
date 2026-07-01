import { View, type StyleProp, type ViewStyle } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { PressableScale } from './PressableScale'
import { colors, radius } from '@/lib/tokens'

export function IconButton({
  icon, onPress, size = 22, color, bg, style,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  onPress?: () => void
  size?: number
  color?: string
  bg?: string
  style?: StyleProp<ViewStyle>
}) {
  return (
    <PressableScale onPress={onPress} style={style} hitSlop={8}>
      <View style={{ padding: 8, borderRadius: radius.pill, backgroundColor: bg ?? 'transparent' }}>
        <MaterialCommunityIcons name={icon} size={size} color={color ?? colors.textSoft} />
      </View>
    </PressableScale>
  )
}
