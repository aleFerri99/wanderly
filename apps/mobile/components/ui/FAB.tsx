import { useState } from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import { MotiView } from 'moti'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { PressableScale } from './PressableScale'
import { Txt } from './Txt'
import { colors, radius, space, shadow, gradients, type GradientName } from '@/lib/tokens'

export function FAB({
  icon, label, onPress, gradient = 'party', style,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  label?: string
  onPress?: () => void
  gradient?: GradientName
  style?: StyleProp<ViewStyle>
}) {
  const [bump, setBump] = useState(0)  // rimbalzo elastico ad ogni tocco
  return (
    <PressableScale onPress={() => { setBump(b => b + 1); onPress?.() }} haptic="medium" style={[{ position: 'absolute' }, style]}>
      <MotiView key={bump} from={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 6, stiffness: 300 }}>
        <LinearGradient
          colors={gradients[gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[
            {
              flexDirection: 'row', alignItems: 'center', gap: space.sm,
              borderRadius: radius.pill, paddingVertical: label ? 15 : 16, paddingHorizontal: label ? 22 : 16,
            },
            shadow.pop,
          ]}
        >
          <MaterialCommunityIcons name={icon} size={24} color={colors.white} />
          {label && <Txt variant="bodyStrong" color={colors.white}>{label}</Txt>}
        </LinearGradient>
      </MotiView>
    </PressableScale>
  )
}
