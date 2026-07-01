import { View, ScrollView, StyleSheet } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGlobalSearchParams, useRouter } from 'expo-router'
import { Txt, Card, IconButton, PressableScale, Appear } from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'

type Item = { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; desc: string; route: string; tint: string; ink: string }

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Pianificazione',
    items: [
      { icon: 'clipboard-text-outline', label: 'Bacheca & Valigia', desc: 'Note, task e checklist', route: 'notes',       tint: colors.tertiarySoft,  ink: colors.tertiary },
      { icon: 'file-document-outline',  label: 'Documenti',         desc: 'Voli, hotel, biglietti', route: 'documents',   tint: colors.primarySoft,   ink: colors.primary },
      { icon: 'lightbulb-on-outline',   label: 'Suggerimenti AI',   desc: 'Idee meteo + itinerario', route: 'suggestions', tint: colors.secondarySoft, ink: colors.secondary },
      { icon: 'brain',                  label: 'Psicologo',         desc: 'Profilo viaggiatore',     route: 'psicologo',   tint: colors.tertiarySoft,  ink: colors.tertiary },
    ],
  },
  {
    title: 'Gruppo & Gioco',
    items: [
      { icon: 'account-group-outline',  label: 'Gruppo',     desc: 'Membri e invito',        route: 'group',       tint: colors.primarySoft,   ink: colors.primary },
      { icon: 'trophy-outline',         label: 'Classifica', desc: 'Punti, badge, MVP',      route: 'leaderboard', tint: colors.secondarySoft, ink: colors.secondary },
      { icon: 'puzzle-outline',         label: 'Trivia',     desc: 'Sfida sul luogo',        route: 'trivia',      tint: colors.pinkSoft,      ink: colors.pink },
    ],
  },
]

export default function More() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useGlobalSearchParams<{ id: string }>()

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: insets.bottom + 110 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
          <IconButton icon="home-outline" size={24} bg={colors.card} onPress={() => router.navigate('/(app)')} />
          <Txt variant="title">Altro</Txt>
        </View>
        <Txt variant="body" color={colors.textSoft} style={{ marginTop: 2, marginBottom: space.lg }}>Tutte le sezioni del viaggio</Txt>

        {SECTIONS.map((sec, si) => (
          <View key={sec.title} style={{ marginBottom: space.lg }}>
            <Txt variant="label" color={colors.textFaint} style={{ marginBottom: space.sm, marginLeft: 4 }}>{sec.title.toUpperCase()}</Txt>
            <View style={{ gap: space.sm }}>
              {sec.items.map((it, i) => (
                <Appear key={it.route} index={si * 4 + i}>
                  <PressableScale haptic="light" onPress={() => router.push(`/(app)/trip/${id}/${it.route}`)}>
                    <Card elevation="soft" padded={false} style={styles.row}>
                      <View style={[styles.icon, { backgroundColor: it.tint }]}><MaterialCommunityIcons name={it.icon} size={22} color={it.ink} /></View>
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyStrong">{it.label}</Txt>
                        <Txt variant="caption" color={colors.textSoft}>{it.desc}</Txt>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
                    </Card>
                  </PressableScale>
                </Appear>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  icon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
})
