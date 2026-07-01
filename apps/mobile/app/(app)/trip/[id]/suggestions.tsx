import { useCallback, useEffect, useState } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import {
  getSuggestions, generateSuggestions, parseSuggestionBody,
} from '@repo/shared/supabase/queries/suggestions'
import { getTripDays, addActivity, deleteActivity } from '@repo/shared/supabase/queries/timeline'
import { Header, Txt, Card, Button, Chip, Skeleton, PressableScale, Appear } from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'
import type { TripSuggestion, DayWithActivities, Activity } from '@repo/shared/types/database'

function findDayForDate(days: DayWithActivities[], date: string | null, timeStart: string | null): DayWithActivities | null {
  if (!date || days.length === 0) return days[0] ?? null
  const matches = days.filter(d => {
    if (!d.date) return false
    if (!d.date_end || d.date_end <= d.date) return d.date === date
    return d.date <= date && date <= d.date_end
  })
  if (matches.length === 0) return days[0] ?? null
  if (matches.length === 1) return matches[0]
  const hour = timeStart ? parseInt(timeStart.split(':')[0], 10) : 12
  return hour >= 15 ? matches[matches.length - 1] : matches[0]
}

// Vincola una data all'intervallo di una tappa (multiday incluso).
function clampToStop(date: string | null, day: DayWithActivities | null): string | null {
  if (!date || !day || !day.date) return date
  const end = day.date_end && day.date_end > day.date ? day.date_end : day.date
  if (date < day.date) return day.date
  if (date > end) return end
  return date
}

const TYPE_META: Record<string, { icon: string; label: string; tint: string; ink: string }> = {
  weather_alert:       { icon: '🌤️', label: 'Meteo',       tint: colors.tertiarySoft,  ink: colors.onTertiarySoft },
  reschedule:          { icon: '🔄', label: 'Riprogramma', tint: colors.secondarySoft, ink: colors.onSecondarySoft },
  swap_indoor:         { icon: '🏛️', label: 'Al chiuso',   tint: colors.primarySoft,   ink: colors.onPrimarySoft },
  new_activity:        { icon: '✨', label: 'Nuova',       tint: colors.pinkSoft,      ink: '#9D174D' },
  activity_suggestion: { icon: '📍', label: 'Attività',    tint: colors.primarySoft,   ink: colors.onPrimarySoft },
}

export default function Suggestions() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [items,   setItems]   = useState<TripSuggestion[]>([])
  const [days,    setDays]    = useState<DayWithActivities[]>([])
  const [added,   setAdded]   = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [gen,     setGen]     = useState(false)
  const [msg,     setMsg]     = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [addingAll, setAddingAll] = useState(false)

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([getSuggestions(supabase, id), getTripDays(supabase, id)])
    setItems(s); setDays(d); setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])  // carica al mount (il focus tra tab su web può non scattare)
  useFocusEffect(useCallback(() => { load() }, [load]))

  async function addOne(s: TripSuggestion): Promise<boolean> {
    const ad = s.activity_data as (NonNullable<TripSuggestion['activity_data']> & { date?: string | null; replaces?: string | null }) | null
    if (!ad || days.length === 0) return false
    // Attività da rimuovere: "swap_indoor" → titolo 'replaces'; "reschedule" → la stessa attività.
    const rt = (ad.replaces ?? (s.type === 'reschedule' ? ad.title : null))?.trim().toLowerCase()
    let origDay: DayWithActivities | undefined
    let origAct: Activity | undefined
    if (rt) {
      for (const d of days) {
        const a = (d.activities ?? []).find(x => x.title.trim().toLowerCase() === rt)
        if (a) { origDay = d; origAct = a; break }
      }
    }
    // Tappa di destinazione: quella dell'originale (se c'è), altrimenti quella della data suggerita.
    const day = origDay ?? findDayForDate(days, ad.date ?? null, ad.time_start ?? null)
    if (!day) return false
    // Data DETERMINISTICA (non ci fidiamo solo della data dell'IA):
    // - swap: stessa data dell'attività sostituita (stesso giorno/luogo)
    // - reschedule: data proposta vincolata alla tappa, fallback alla data originale
    // - nuova: data proposta vincolata, fallback all'inizio della tappa
    let actDate: string | null
    if (s.type === 'swap_indoor' && origAct) {
      actDate = origAct.activity_date ?? clampToStop(ad.date ?? null, day) ?? day.date ?? null
    } else if (s.type === 'reschedule') {
      actDate = clampToStop(ad.date ?? origAct?.activity_date ?? null, day) ?? day.date ?? null
    } else {
      actDate = clampToStop(ad.date ?? null, day) ?? day.date ?? null
    }
    if (origAct) await deleteActivity(supabase, origAct.id)   // rimuove l'attività sostituita/spostata
    await addActivity(supabase, { tripId: id, dayId: day.id, title: ad.title, timeStart: ad.time_start, notes: ad.notes, location: ad.location, activityDate: actDate, position: 999 })
    return true
  }
  async function onAdd(s: TripSuggestion) {
    setAdded(prev => new Set(prev).add(s.id))
    await addOne(s)
  }
  async function onAddAll() {
    if (pending.length === 0 || days.length === 0) return
    setAddingAll(true)
    setAdded(prev => { const n = new Set(prev); pending.forEach(s => n.add(s.id)); return n })
    for (const s of pending) await addOne(s)
    setAddingAll(false)
  }
  async function onGenerate() {
    setGen(true); setMsg(null); setMissing(false)
    const res = await generateSuggestions(supabase, id)
    setGen(false)
    if (res.missingProfiles) { setMissing(true); return }
    if (res.error) { setMsg(`❌ ${res.error}`); return }
    setMsg(`✓ ${res.count} suggerimenti generati`); load()
  }

  const addable = items.filter(s => !!s.activity_data)          // suggerimenti aggiungibili alla timeline
  const pending = addable.filter(s => !added.has(s.id))         // non ancora aggiunti

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Suggerimenti AI" onBack={() => router.back()} />

      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}><Skeleton height={48} radius={radius.pill} /><Skeleton height={120} radius={radius.xl} /><Skeleton height={120} radius={radius.xl} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 24 }}>
          {missing && (
            <Card tint={colors.secondarySoft} elevation="soft" style={{ marginBottom: space.md }}>
              <Txt variant="bodyStrong" color={colors.onSecondarySoft}>👥 Manca il profilo del gruppo</Txt>
              <Txt variant="body" color={colors.onSecondarySoft} style={{ marginTop: 4 }}>Genera il tuo profilo viaggiatore prima dei suggerimenti personalizzati.</Txt>
              <Button title="Vai al Psicologo" variant="secondary" icon="brain" onPress={() => { setMissing(false); router.push(`/(app)/trip/${id}/psicologo`) }} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />
            </Card>
          )}

          <Button title={gen ? 'Genero…' : 'Genera suggerimenti'} gradient="party" icon="creation" loading={gen} disabled={gen} onPress={onGenerate} full />
          {msg && <Txt variant="label" color={colors.textSoft} style={{ marginTop: space.sm }}>{msg}</Txt>}

          {items.length === 0 && !gen && (
            <Appear style={{ alignItems: 'center', paddingTop: 50 }}>
              <Txt style={{ fontSize: 44 }}>💡</Txt>
              <Txt variant="body" color={colors.textSoft} style={{ marginTop: space.sm, textAlign: 'center', maxWidth: 260 }}>Nessun suggerimento. Premi “Genera” per analizzare meteo e itinerario.</Txt>
            </Appear>
          )}

          {pending.length > 1 && days.length > 0 && (
            <Button title={addingAll ? 'Aggiungo…' : `Aggiungi tutte alla timeline (${pending.length})`} variant="secondary" icon="playlist-plus" loading={addingAll} disabled={addingAll} onPress={onAddAll} full style={{ marginTop: space.md }} />
          )}

          <View style={{ marginTop: space.md, gap: space.sm }}>
            {items.map((s, i) => {
              const meta = TYPE_META[s.type] ?? { icon: '💡', label: s.type, tint: colors.primarySoft, ink: colors.onPrimarySoft }
              const { body, groupFit } = parseSuggestionBody(s.body)
              const isAdded = added.has(s.id)
              return (
                <Appear key={s.id} index={i}>
                  <Card elevation="soft" style={{ opacity: isAdded ? 0.55 : 1 }}>
                    <View style={styles.row}>
                      <Chip label={`${meta.icon} ${meta.label}`} tint={meta.tint} color={meta.ink} />
                      {s.priority >= 8 && <Chip label="urgente" tint={colors.dangerSoft} color={colors.danger} />}
                    </View>
                    <Txt variant="heading" style={{ marginTop: space.sm }}>{s.title}</Txt>
                    <Txt variant="body" color={colors.textSoft} style={{ marginTop: 4 }}>{body}</Txt>
                    {groupFit && (
                      <View style={[styles.fit, { backgroundColor: colors.secondarySoft }]}>
                        <Txt variant="caption" color={colors.onSecondarySoft}>👥 {groupFit}</Txt>
                      </View>
                    )}
                    {s.activity_data && (
                      <View style={{ marginTop: space.sm }}>
                        <Txt variant="caption" color={colors.textFaint}>
                          📌 {s.activity_data.title}{s.activity_data.time_start ? ` · ${s.activity_data.time_start}` : ''}{s.activity_data.location ? ` · ${s.activity_data.location}` : ''}
                        </Txt>
                        <PressableScale haptic="medium" onPress={() => !isAdded && onAdd(s)} style={{ alignSelf: 'flex-start', marginTop: space.sm }}>
                          <View style={[styles.addBtn, { backgroundColor: isAdded ? colors.successSoft : colors.primarySoft }]}>
                            <Txt variant="label" color={isAdded ? colors.success : colors.primary}>{isAdded ? '✓ Aggiunta alla timeline' : '+ Aggiungi alla timeline'}</Txt>
                          </View>
                        </PressableScale>
                      </View>
                    )}
                  </Card>
                </Appear>
              )
            })}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  fit:    { marginTop: space.sm, padding: space.sm, borderRadius: radius.md },
  addBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill },
})
