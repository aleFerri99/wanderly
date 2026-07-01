import { useRef, type ReactNode } from 'react'
import { Animated, Pressable, type PressableProps, type ViewStyle, type StyleProp, type GestureResponderEvent } from 'react-native'
import * as Haptics from 'expo-haptics'
import { motion } from '@/lib/tokens'

type HapticKind = 'light' | 'medium' | 'heavy' | 'none'

function fireHaptic(kind: HapticKind) {
  if (kind === 'none') return
  const map = {
    light:  Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy:  Haptics.ImpactFeedbackStyle.Heavy,
  } as const
  Haptics.impactAsync(map[kind]).catch(() => {})
}

// Tap "che si schiaccia": molla bouncy su pressIn/Out (native driver → 60fps)
// + feedback tattile leggero alla pressione.
export function PressableScale({
  children, style, onPress, onPressIn, onPressOut, scaleTo = motion.pressScale, haptic = 'light', ...rest
}: Omit<PressableProps, 'children'> & {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  scaleTo?: number
  haptic?: HapticKind
}) {
  const scale = useRef(new Animated.Value(1)).current

  const animate = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      damping: motion.springBouncy.damping,
      stiffness: motion.springBouncy.stiffness,
      mass: motion.springBouncy.mass,
    }).start()

  return (
    <Pressable
      onPress={onPress}
      onPressIn={e => { animate(scaleTo); if (onPress) fireHaptic(haptic); onPressIn?.(e) }}
      onPressOut={(e: GestureResponderEvent) => { animate(1); onPressOut?.(e) }}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  )
}
