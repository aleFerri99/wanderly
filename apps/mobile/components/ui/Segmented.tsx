import { View, StyleSheet } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { PressableScale } from './PressableScale'
import { Txt } from './Txt'
import { colors, radius, space } from '@/lib/tokens'

export function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }[]
}) {
  return (
    <View style={styles.wrap}>
      {options.map(o => {
        const active = o.value === value
        return (
          <View key={o.value} style={{ flex: 1 }}>
            <PressableScale
              haptic="light" scaleTo={0.95}
              onPress={() => onChange(o.value)}
              style={[styles.item, active && { backgroundColor: colors.primarySoft }]}
            >
              {o.icon && <MaterialCommunityIcons name={o.icon} size={15} color={active ? colors.primary : colors.textFaint} />}
              <Txt variant="label" numberOfLines={1} color={active ? colors.primary : colors.textSoft}>{o.label}</Txt>
            </PressableScale>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, padding: 4, gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: radius.pill },
})
