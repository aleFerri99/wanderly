import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { IconButton } from './IconButton'
import { Txt } from './Txt'
import { colors, space } from '@/lib/tokens'
import type { ReactNode } from 'react'

// Header per le schermate pushed (back + titolo + azione opzionale).
export function Header({ title, onBack, right, bg = colors.bg }: {
  title: string
  onBack: () => void
  right?: ReactNode
  bg?: string
}) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top + 4, paddingHorizontal: space.md, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'center', backgroundColor: bg }}>
      <IconButton icon="chevron-left" size={26} bg={colors.card} onPress={onBack} />
      <Txt variant="heading" numberOfLines={1} style={{ flex: 1, marginHorizontal: space.sm }}>{title}</Txt>
      {right}
    </View>
  )
}
