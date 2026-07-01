import { useCallback, useEffect, useState } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  getTravelerProfiles, generateMyProfile, generateAllProfiles, type TravelerProfileWithName,
} from '@repo/shared/supabase/queries/travelerProfiles'
import { Header, Txt, Card, Button, Chip, ProgressBar, Skeleton, Appear } from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'

const DIMS: { key: keyof TravelerProfileWithName; label: string; icon: string }[] = [
  { key: 'adventure_level',   label: 'Avventura',   icon: '🧗' },
  { key: 'cultural_interest', label: 'Cultura',     icon: '🏛️' },
  { key: 'food_focus',        label: 'Gastronomia', icon: '🍽️' },
  { key: 'pace_preference',   label: 'Ritmo',       icon: '⚡' },
  { key: 'social_openness',   label: 'Socialità',   icon: '🤝' },
  { key: 'novelty_seeking',   label: 'Novità',      icon: '✨' },
]
const MOBILITY_LABEL: Record<string, string> = { full: '🟢 Nessuna limitazione', moderate: '🟡 Ritmo moderato', limited: '🔴 Accessibilità richiesta' }
const STYLE_LABEL:    Record<string, string> = { planner: '📋 Pianificatore', spontaneous: '🎲 Spontaneo', mixed: '⚖️ Misto' }
const LANG_LABEL:     Record<string, string> = { local_only: '🌐 Solo madre lingua', english_ok: '🇬🇧 Inglese OK', multilingual: '🌍 Multilingue' }

export default function Psicologo() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [items,   setItems]   = useState<TravelerProfileWithName[]>([])
  const [loading, setLoading] = useState(true)
  const [gen,     setGen]     = useState(false)
  const [msg,     setMsg]     = useState<string | null>(null)

  const load = useCallback(async () => { setItems(await getTravelerProfiles(supabase, id, userId)); setLoading(false) }, [id, userId])
  useEffect(() => { load() }, [load])  // carica al mount (il focus tra tab su web può non scattare)
  useFocusEffect(useCallback(() => { load() }, [load]))
  const hasMine = items.some(p => p.isMine)

  async function onGenerate() {
    setGen(true); setMsg(null)
    const res = await generateMyProfile(supabase, id)
    setGen(false)
    if (res.error) { setMsg(`❌ ${res.error}`); return }
    setMsg('✓ Profilo aggiornato'); load()
  }
  async function onGenerateAll() {
    setGen(true); setMsg(null)
    const res = await generateAllProfiles(supabase, id)
    setGen(false)
    if (res.error) { setMsg(`❌ ${res.error}`); return }
    setMsg(`✓ ${res.generated ?? 0} profili generati${res.errors ? `, ${res.errors} errori` : ''}`); load()
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Psicologo di viaggio" onBack={() => router.back()} />

      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}><Skeleton height={48} radius={radius.pill} /><Skeleton height={160} radius={radius.xl} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 24 }}>
          <Card gradient="party" style={{ marginBottom: space.md }}>
            <Txt variant="bodyStrong" color={colors.white}>🧠 Il tuo profilo viaggiatore</Txt>
            <Txt variant="body" color="rgba(255,255,255,0.9)" style={{ marginTop: 4 }}>L'AI analizza i tuoi interessi per personalizzare i suggerimenti del viaggio.</Txt>
          </Card>

          <Button title={gen ? 'Analizzo…' : hasMine ? 'Rigenera il mio profilo' : 'Genera il mio profilo'} gradient="party" icon="brain" loading={gen} disabled={gen} onPress={onGenerate} full />
          <Button title="Genera per tutti i membri" variant="ghost" icon="account-group" disabled={gen} onPress={onGenerateAll} full style={{ marginTop: space.sm }} />
          {msg && <Txt variant="label" color={colors.textSoft} style={{ marginTop: space.sm }}>{msg}</Txt>}

          <Txt variant="heading" style={{ marginTop: space.xl, marginBottom: space.sm }}>Profili del gruppo</Txt>

          {items.length === 0 && (
            <Card elevation="soft"><Txt variant="body" color={colors.textSoft}>Ancora nessun profilo. Premi “Genera il mio profilo” per iniziare.</Txt></Card>
          )}

          <View style={{ gap: space.sm }}>
            {items.map((p, i) => (
              <Appear key={p.id} index={i}>
                <Card elevation="soft" style={p.isMine ? { borderWidth: 1.5, borderColor: colors.primary } : undefined}>
                  <View style={styles.rowBetween}>
                    <Txt variant="heading">{p.name}{p.isMine ? ' · tu' : ''}</Txt>
                    {p.travel_style && <Chip label={STYLE_LABEL[p.travel_style] ?? p.travel_style} tint={colors.primarySoft} color={colors.onPrimarySoft} />}
                  </View>
                  {p.raw_analysis && <Txt variant="body" color={colors.textSoft} style={{ marginTop: 6, fontStyle: 'italic' }}>“{p.raw_analysis}”</Txt>}

                  <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space.md }} />

                  {DIMS.map(d => {
                    const val = (p[d.key] as number | null) ?? 3
                    return (
                      <View key={d.label} style={styles.dimRow}>
                        <Txt variant="label" style={{ width: 110 }}>{d.icon} {d.label}</Txt>
                        <View style={{ flex: 1, marginHorizontal: space.sm }}><ProgressBar progress={val / 5} color={colors.primary} height={8} /></View>
                        <Txt variant="label" color={colors.textSoft} style={{ width: 28, textAlign: 'right' }}>{val}/5</Txt>
                      </View>
                    )
                  })}

                  <View style={styles.tags}>
                    {p.mobility_level   && <Chip label={MOBILITY_LABEL[p.mobility_level] ?? p.mobility_level} tint={colors.bg} color={colors.textSoft} />}
                    {p.language_comfort && <Chip label={LANG_LABEL[p.language_comfort] ?? p.language_comfort} tint={colors.bg} color={colors.textSoft} />}
                  </View>
                  {p.pace_note && <Txt variant="caption" color={colors.textSoft} style={{ marginTop: space.sm }}>⏱️ {p.pace_note}</Txt>}
                  {p.personality_tags?.length > 0 && (
                    <View style={styles.tags}>
                      {p.personality_tags.map(t => <Chip key={t} label={t} tint={colors.tertiarySoft} color={colors.onTertiarySoft} />)}
                    </View>
                  )}
                </Card>
              </Appear>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  dimRow:     { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  tags:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
})
