import { MotiView } from 'moti'
import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { motion } from '@/lib/tokens'

// Ingresso fade + slide-up con molla. `index` per lo stagger nelle liste.
export function Appear({
  children, index = 0, delay = 0, distance = 14, style,
}: {
  children: ReactNode
  index?: number
  delay?: number
  distance?: number
  style?: StyleProp<ViewStyle>
}) {
  return (
    <MotiView
      style={style}
      from={{ opacity: 0, translateY: distance }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 16, stiffness: 180, mass: 0.8, delay: delay + index * motion.stagger }}
    >
      {children}
    </MotiView>
  )
}
