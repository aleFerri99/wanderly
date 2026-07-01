import { View, type ViewStyle, type StyleProp } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/lib/tokens'
import type { ReactNode } from 'react'

// Contenitore schermata: safe-area + sfondo coerente.
export function Screen({
  children, style, bg = colors.bg, top = true, bottom = false,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  bg?: string
  top?: boolean
  bottom?: boolean
}) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        { flex: 1, backgroundColor: bg, paddingTop: top ? insets.top : 0, paddingBottom: bottom ? insets.bottom : 0 },
        style,
      ]}
    >
      {children}
    </View>
  )
}
