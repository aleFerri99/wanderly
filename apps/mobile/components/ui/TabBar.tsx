import { View, StyleSheet } from 'react-native'
import { useGlobalSearchParams } from 'expo-router'
import { MotiView } from 'moti'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PressableScale } from './PressableScale'
import { Txt } from './Txt'
import { colors, radius, shadow, gradients } from '@/lib/tokens'

type Tab = { name: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }
const TABS: Tab[] = [
  { name: 'overview',  icon: 'compass-outline',  label: 'Panoramica' },
  { name: 'index',     icon: 'map-marker-path',  label: 'Itinerario' },
  { name: 'expenses',  icon: 'wallet-outline',   label: 'Spese' },
  { name: 'more',      icon: 'view-grid-outline', label: 'Altro' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets()
  const { id } = useGlobalSearchParams<{ id?: string }>()
  const activeName = state.routes[state.index]?.name as string

  // Sulle schermate di dettaglio (href:null: Documenti, Note, Gruppo, ecc.)
  // la tab bar è di troppo e coprirebbe i FAB: la nascondiamo.
  if (!TABS.some(t => t.name === activeName)) return null

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom ? insets.bottom : 12 }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {TABS.map(tab => {
          const focused = activeName === tab.name
          return (
            <PressableScale
              key={tab.name}
              haptic="light"
              scaleTo={0.9}
              onPress={() => { if (!focused) navigation.navigate(tab.name, id ? { id } : undefined) }}
              style={styles.item}
            >
              <View style={styles.itemInner}>
                {focused && (
                  <MotiView
                    from={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', damping: 13, stiffness: 220 }}
                    style={StyleSheet.absoluteFill}
                  >
                    <LinearGradient
                      colors={gradients.party} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
                    />
                  </MotiView>
                )}
                <MotiView
                  animate={{ scale: focused ? 1.12 : 1, translateY: focused ? -1 : 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 240 }}
                >
                  <MaterialCommunityIcons
                    name={tab.icon} size={22}
                    color={focused ? colors.white : colors.textFaint}
                  />
                </MotiView>
              </View>
              <Txt variant="caption" color={focused ? colors.primary : colors.textFaint} style={{ marginTop: 3 }}>
                {tab.label}
              </Txt>
            </PressableScale>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 14 },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: radius.pill,
    paddingVertical: 10, paddingHorizontal: 12, width: '100%', maxWidth: 460,
    ...shadow.card,
  },
  item:      { flex: 1, alignItems: 'center' },
  itemInner: { width: 46, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
})
