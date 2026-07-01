import { useState } from 'react'
import { View, StyleSheet, Linking } from 'react-native'
import { MotiView } from 'moti'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Txt, Chip, PressableScale, Input, Button } from '@/components/ui'
import { colors, space } from '@/lib/tokens'
import type { Activity } from '@repo/shared/types/database'
import type { ActivityReviewSummary } from '@repo/shared/supabase/queries/reviews'

type Accent = { tint: string; ink: string; solid: string }

function mapsUrl(a: Activity, dayTitle?: string): string | null {
  if (a.lat && a.lng) return `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`
  if (a.location) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dayTitle ? `${a.location}, ${dayTitle}` : a.location)}`
  return null
}

export function ActivityRow({
  activity, accent, dayTitle, proposer, review, first,
  onToggle, onLongPress, onSubmitReview, onDeleteReview,
}: {
  activity: Activity
  accent: Accent
  dayTitle?: string
  proposer: string | null
  review?: ActivityReviewSummary
  first?: boolean
  onToggle: () => void
  onLongPress: () => void   // tieni premuto → menu azioni (Modifica / Sposta / Elimina)
  onSubmitReview: (score: number, content: string) => Promise<void>
  onDeleteReview: (reviewId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [score, setScore] = useState(review?.mine?.score ?? 0)  // 0 = nessun voto → nessun pallino acceso
  const [comment, setComment] = useState(review?.mine?.content ?? '')
  const [saving, setSaving] = useState(false)

  const done = activity.status === 'done'
  const url  = mapsUrl(activity, dayTitle)

  function toggleOpen() {
    setOpen(o => {
      if (!o) { setScore(review?.mine?.score ?? 0); setComment(review?.mine?.content ?? '') }
      return !o
    })
  }
  async function save() { if (score < 1) return; setSaving(true); await onSubmitReview(score, comment); setSaving(false) }

  return (
    <View style={[styles.rowWrap, !first && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <View style={styles.row}>
        <PressableScale haptic="medium" onPress={onToggle} style={{ paddingTop: 1 }}>
          <View style={[styles.check, { backgroundColor: done ? accent.solid : colors.white, borderColor: done ? accent.solid : 'rgba(0,0,0,0.15)' }]}>
            {done && <MaterialCommunityIcons name="check-bold" size={14} color={colors.white} />}
          </View>
        </PressableScale>

        <PressableScale haptic="light" onPress={toggleOpen} onLongPress={onLongPress} delayLongPress={300} style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            {activity.time_start && <Chip label={activity.time_start.slice(0, 5)} tint={colors.primarySoft} color={colors.primary} />}
            <Txt variant="bodyStrong" style={[{ flex: 1 }, done && { textDecorationLine: 'line-through', color: colors.textFaint }]}>{activity.title}</Txt>
            {review?.avg != null && <Chip label={`★ ${review.avg.toFixed(1)}`} tint={colors.secondarySoft} color={colors.secondary} />}
            <MotiView animate={{ rotate: open ? '180deg' : '0deg' }} transition={{ type: 'timing', duration: 180 }}>
              <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textFaint} />
            </MotiView>
          </View>
        </PressableScale>
      </View>

      {open && (
        <MotiView from={{ opacity: 0, translateY: -6 }} animate={{ opacity: 1, translateY: 0 }} style={{ marginTop: space.sm, marginLeft: 34 }}>
          {(activity.location || activity.duration_minutes) && (
            <View style={styles.meta}>
              {activity.location && <Txt variant="caption" color={colors.tertiary}>📍 {activity.location}</Txt>}
              {url && <Txt variant="caption" color={colors.primary} onPress={() => Linking.openURL(url)}>Maps →</Txt>}
              {activity.duration_minutes ? <Txt variant="caption" color={colors.textFaint}>⏱ {activity.duration_minutes}min</Txt> : null}
            </View>
          )}
          {activity.notes && <Txt variant="caption" color={colors.textSoft} style={{ marginTop: 4 }}>{activity.notes}</Txt>}
          {proposer && <Txt variant="caption" color={colors.textFaint} style={{ marginTop: 4 }}>👤 {proposer}</Txt>}

          <View style={styles.reviewBox}>
            <Txt variant="label" color={colors.textSoft}>La tua recensione · <Txt variant="bodyStrong" color={colors.secondary}>{score > 0 ? score : '–'}/10</Txt></Txt>
            <View style={styles.scoreRow}>
              {Array.from({ length: 10 }, (_, n) => n + 1).map(n => {
                const on = score >= n
                return (
                  <PressableScale key={n} haptic="light" onPress={() => setScore(n)}>
                    <View style={[styles.scoreDot, { backgroundColor: on ? colors.secondary : colors.white }]}>
                      <Txt variant="caption" color={on ? colors.white : colors.textFaint}>{n}</Txt>
                    </View>
                  </PressableScale>
                )
              })}
            </View>
            <Input icon="comment-text-outline" value={comment} onChangeText={setComment} multiline placeholder="Commento (+punti)" containerStyle={{ marginTop: space.sm }} />
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              {review?.mine && <Button title="Elimina" variant="ghost" size="sm" onPress={() => onDeleteReview(review.mine!.id)} />}
              <Button title={review?.mine ? 'Aggiorna' : 'Invia voto'} gradient="sunset" size="sm" icon="star" loading={saving} disabled={score < 1} onPress={save} full style={{ flex: 1 }} />
            </View>
          </View>
        </MotiView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  rowWrap:   { backgroundColor: colors.card, paddingVertical: 10, paddingHorizontal: space.md },
  row:       { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  check:     { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  reviewBox: { marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  scoreRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  scoreDot:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
})
