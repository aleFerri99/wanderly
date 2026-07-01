import { useCallback, useEffect, useState } from 'react'
import { View, ScrollView, FlatList, StyleSheet, Alert, Image } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import {
  getTripDays, addActivity, updateActivity, toggleActivity, deleteActivity, moveActivity,
  addDay, updateDay, deleteDay, scheduleDay,
} from '@repo/shared/supabase/queries/timeline'
import { getTripGroup, type GroupMember } from '@repo/shared/supabase/queries/trips'
import {
  getTripReviews, summarizeByActivity, submitReview, deleteReview,
  type ActivityReviewSummary,
} from '@repo/shared/supabase/queries/reviews'
import { checkReviewBadges } from '@repo/shared/supabase/queries/gamification'
import { fetchDestinationImage } from '@repo/shared/supabase/queries/images'
import { useAuth } from '@/lib/auth'
import { confirmAction } from '@/lib/confirm'
import { Txt, Card, Skeleton, Sheet, Input, Button, Appear, FAB, PressableScale, PlaceAutocomplete, DateField, Confetti } from '@/components/ui'
import { TimelineStatus } from '@/components/trip/TimelineStatus'
import { ActivityRow } from '@/components/trip/ActivityRow'
import { colors, radius, space, shadow } from '@/lib/tokens'
import type { DayWithActivities, Activity } from '@repo/shared/types/database'

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })
const fmtShort = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
const isoDay = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

// Date ISO comprese nell'intervallo di una tappa (incluse). [] se senza date.
function tappaDates(day: { date: string | null; date_end: string | null }): string[] {
  if (!day.date) return []
  const end = day.date_end && day.date_end > day.date ? day.date_end : day.date
  const out: string[] = []
  const cur = new Date(day.date + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last && out.length < 60) { out.push(isoDay(cur)); cur.setDate(cur.getDate() + 1) }
  return out
}

interface Editing { id: string | null; dayId: string; position: number; title: string; time: string; duration: string; location: string; notes: string; lat: number | null; lng: number | null; date: string | null }
const EMPTY = (dayId: string, position: number): Editing => ({ id: null, dayId, position, title: '', time: '', duration: '', location: '', notes: '', lat: null, lng: null, date: null })

const GEOAPIFY_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_KEY ?? null

interface DayEditing { id: string | null; title: string; date: string; dateEnd: string; lat: number | null; lng: number | null }

const SAGE = { tint: colors.card, ink: colors.primary, solid: colors.primary }
const UNSPLASH_KEY = process.env.EXPO_PUBLIC_UNSPLASH_KEY ?? null

export default function TimelineTab() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [days,    setDays]    = useState<DayWithActivities[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [reviews, setReviews] = useState<Map<string, ActivityReviewSummary>>(new Map())
  const [destination, setDestination] = useState('')
  const [loading, setLoading] = useState(true)
  const [edit,    setEdit]    = useState<Editing | null>(null)
  const [dayEdit, setDayEdit] = useState<DayEditing | null>(null)
  const [moveAct, setMoveAct] = useState<Activity | null>(null)
  const [scheduling, setScheduling] = useState<string | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [celebrate, setCelebrate] = useState(0)
  const [dayPhotos, setDayPhotos] = useState<Record<string, string>>({})
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})
  const [selDay,   setSelDay]   = useState<Record<string, string>>({})  // pillola-giorno selezionata per tappa
  const [actionAct,  setActionAct]  = useState<Activity | null>(null)          // menu azioni attività
  const [dayActions, setDayActions] = useState<DayWithActivities | null>(null) // menu azioni tappa

  // Miniature delle giornate: foto dal nome-tappa (cache in memoria)
  const photoKey = days.map(d => `${d.id}:${d.title}`).join('|')
  useEffect(() => {
    let alive = true
    ;(async () => {
      const pairs = await Promise.all(days.map(async d => {
        if (!d.title?.trim()) return null
        const u = await fetchDestinationImage(d.title, UNSPLASH_KEY)
        return u ? ([d.id, u] as const) : null
      }))
      if (alive) setDayPhotos(Object.fromEntries(pairs.filter(Boolean) as [string, string][]))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey])

  async function onSchedule(dayId: string, dayTitle: string, date: string | null) {
    if (scheduling) return
    setScheduling(dayId)
    const res = await scheduleDay(supabase, { tripId: id, dayId, dayTitle, targetDate: date })
    setScheduling(null)
    if (res.error) Alert.alert('Ottimizzazione', res.error)
    else { await load(); if (res.summary) Alert.alert('✨ Giornata ottimizzata', res.summary) }
  }

  async function doMove(targetDay: DayWithActivities) {
    if (!moveAct) return
    const act = moveAct
    setMoveAct(null)
    setDays(prev => prev.map(d => ({ ...d, activities: d.id === targetDay.id ? [...d.activities, { ...act, day_id: targetDay.id }] : d.activities.filter(a => a.id !== act.id) })))
    await moveActivity(supabase, act.id, targetDay.id, targetDay.date)
    load()
  }

  // Assegna un'attività a un giorno DENTRO la stessa tappa (imposta activity_date).
  async function doAssignDay(date: string | null) {
    if (!moveAct) return
    const act = moveAct
    setMoveAct(null)
    if (date) setSelDay(s => ({ ...s, [act.day_id]: date }))
    setDays(prev => prev.map(d => d.id === act.day_id
      ? { ...d, activities: d.activities.map(a => a.id === act.id ? { ...a, activity_date: date } : a) } : d))
    await moveActivity(supabase, act.id, act.day_id, date)
    load()
  }

  const load = useCallback(async () => {
    const [d, g, r, trip] = await Promise.all([
      getTripDays(supabase, id), getTripGroup(supabase, id), getTripReviews(supabase, id),
      supabase.from('trips').select('destination').eq('id', id).single(),
    ])
    setDays(d); setMembers(g.members); setReviews(summarizeByActivity(r, userId))
    setDestination((trip.data as { destination: string | null } | null)?.destination ?? '')
    setLoading(false)
  }, [id, userId])

  useFocusEffect(useCallback(() => {
    load()
    const ch = supabase.channel(`timeline:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'days',       filter: `trip_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `trip_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews',    filter: `trip_id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, load]))

  function openEdit(a: Activity) {
    setEdit({ id: a.id, dayId: a.day_id, position: a.position, title: a.title, time: a.time_start?.slice(0, 5) ?? '', duration: a.duration_minutes?.toString() ?? '', location: a.location ?? '', notes: a.notes ?? '', lat: a.lat, lng: a.lng, date: a.activity_date ?? null })
  }
  async function confirmSave() {
    if (!edit || !edit.title.trim()) return
    setSaving(true)
    const dur = edit.duration ? parseInt(edit.duration, 10) : null
    if (edit.id) await updateActivity(supabase, edit.id, { title: edit.title, timeStart: edit.time, location: edit.location, notes: edit.notes, durationMinutes: dur, lat: edit.lat, lng: edit.lng })
    else await addActivity(supabase, { tripId: id, dayId: edit.dayId, title: edit.title, timeStart: edit.time || null, location: edit.location || null, notes: edit.notes || null, activityDate: edit.date, lat: edit.lat, lng: edit.lng, position: edit.position })
    setSaving(false); setEdit(null); load()
  }
  async function onToggle(act: Activity) {
    if (act.status !== 'done') setCelebrate(c => c + 1)   // 🎉 al completamento
    setDays(prev => prev.map(d => ({ ...d, activities: d.activities.map(a => a.id === act.id ? { ...a, status: a.status === 'done' ? 'todo' : 'done' } : a) })))
    await toggleActivity(supabase, act.id, act.status)
  }
  function onDelete(act: Activity) {
    confirmAction('Eliminare l\'attività?', `"${act.title}"`, async () => {
      setDays(prev => prev.map(d => ({ ...d, activities: d.activities.filter(a => a.id !== act.id) })))
      await deleteActivity(supabase, act.id)
    }, { confirmLabel: 'Elimina', destructive: true })
  }
  async function confirmDay() {
    if (!dayEdit || !dayEdit.title.trim()) return
    setSaving(true)
    if (dayEdit.id) await updateDay(supabase, dayEdit.id, { title: dayEdit.title, date: dayEdit.date || null, dateEnd: dayEdit.dateEnd || null, lat: dayEdit.lat, lng: dayEdit.lng })
    else await addDay(supabase, { tripId: id, title: dayEdit.title, date: dayEdit.date || null, dateEnd: dayEdit.dateEnd || null, position: days.length, lat: dayEdit.lat, lng: dayEdit.lng })
    setSaving(false); setDayEdit(null); load()
  }
  function confirmDeleteDay(dayId: string, after?: () => void) {
    confirmAction('Eliminare la tappa?', 'Verranno eliminate anche le sue attività.', async () => {
      after?.(); await deleteDay(supabase, dayId); load()
    }, { confirmLabel: 'Elimina', destructive: true })
  }
  function onDeleteDay() {
    if (!dayEdit?.id) return
    confirmDeleteDay(dayEdit.id, () => setDayEdit(null))
  }
  function proposerName(uid: string | null): string | null {
    if (!uid) return null
    if (uid === userId) return 'tu'
    const m = members.find(x => x.id === uid)
    return m ? (m.full_name || `@${m.username}`) : null
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          <Skeleton height={130} radius={radius.xl} /><Skeleton height={80} radius={radius.lg} /><Skeleton height={80} radius={radius.lg} />
        </View>
      ) : (
        <FlatList
          data={days}
          keyExtractor={d => d.id}
          contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 110 }}
          ListHeaderComponent={days.length > 0 ? <TimelineStatus days={days} /> : null}
          ListEmptyComponent={
            <Appear style={{ alignItems: 'center', paddingTop: 70 }}>
              <Txt style={{ fontSize: 50 }}>🗓️</Txt>
              <Txt variant="heading" style={{ marginTop: space.sm }}>Nessuna tappa</Txt>
              <Txt variant="body" color={colors.textSoft} style={{ marginTop: 4, textAlign: 'center' }}>Tocca “Tappa” in basso per crearne una.</Txt>
            </Appear>
          }
          renderItem={({ item: day, index: dayIdx }) => {
            const hasCoords = day.lat != null && day.lng != null
            const photo     = dayPhotos[day.id]
            const open      = openDays[day.id] ?? dayIdx === 0
            const total     = day.activities.length
            const done      = day.activities.filter(a => a.status === 'done').length
            const subtitle  = total === 0 ? 'Nessuna attività' : `${done}/${total} attività`
            // Multiday: pillole-giorno + filtro attività per activity_date
            const dates       = tappaDates(day)
            const multiday    = dates.length > 1
            const hasUnassign = day.activities.some(a => !a.activity_date)
            const anyAssigned = day.activities.some(a => a.activity_date)
            const today       = isoDay(new Date())
            const defSel      = !anyAssigned && hasUnassign ? 'unassigned' : (dates.includes(today) ? today : dates[0])
            const sel         = multiday ? (selDay[day.id] ?? defSel) : ''
            const shownActs   = !multiday ? day.activities
              : sel === 'unassigned' ? day.activities.filter(a => !a.activity_date)
              : day.activities.filter(a => a.activity_date === sel)
            const addDate     = multiday && sel !== 'unassigned' ? sel : null
            const pills       = multiday ? [...(hasUnassign ? ['unassigned'] : []), ...dates] : []
            return (
              <Appear index={dayIdx}>
                <Card padded={false} elevation="soft" style={styles.dayCard}>
                  {/* Header compatto: badge · titolo · miniatura · chevron */}
                  <PressableScale haptic="light" onPress={() => setOpenDays(o => ({ ...o, [day.id]: !open }))} onLongPress={() => setDayActions(day)} delayLongPress={300} style={styles.dayHead}>
                    <View style={styles.dayBadge}>
                      <Txt variant="bodyStrong" color={colors.white} style={{ fontSize: 15 }}>{dayIdx + 1}</Txt>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong" numberOfLines={1}>{day.title || 'Tappa'}{hasCoords ? ' 📍' : ''}</Txt>
                      <Txt variant="caption" color={colors.textSoft} numberOfLines={1}>
                        {day.date ? `${fmtDate(day.date)}${day.date_end && day.date_end !== day.date ? ` → ${fmtDate(day.date_end)}` : ''} · ` : ''}{subtitle}
                      </Txt>
                    </View>
                    {photo
                      ? <Image source={{ uri: photo }} style={styles.dayThumb} resizeMode="cover" />
                      : <View style={[styles.dayThumb, styles.dayThumbEmpty]}><MaterialCommunityIcons name="image-outline" size={20} color={colors.textFaint} /></View>}
                    <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textFaint} />
                  </PressableScale>

                  {/* Dettaglio tappa per tappa */}
                  {open && (
                    <View style={styles.dayBody}>
                      {/* Pillole-giorno (solo tappe multiday) */}
                      {multiday && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayPills}>
                          {pills.map(p => {
                            const on    = p === sel
                            const isUn  = p === 'unassigned'
                            const count = isUn ? day.activities.filter(a => !a.activity_date).length : day.activities.filter(a => a.activity_date === p).length
                            return (
                              <PressableScale key={p} haptic="light" onPress={() => setSelDay(s => ({ ...s, [day.id]: p }))}>
                                <View style={[styles.dayPill, { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.line }]}>
                                  <Txt variant="caption" color={on ? colors.white : colors.textSoft}>{isUn ? '📥 Da programmare' : `G${dates.indexOf(p) + 1} · ${fmtShort(p)}`}</Txt>
                                  {count > 0 && <View style={[styles.pillDot, { backgroundColor: on ? 'rgba(255,255,255,0.28)' : colors.primarySoft }]}><Txt variant="caption" color={on ? colors.white : colors.primary} style={{ fontSize: 10 }}>{count}</Txt></View>}
                                </View>
                              </PressableScale>
                            )
                          })}
                        </ScrollView>
                      )}

                      {shownActs.map((a, ai) => (
                        <ActivityRow
                          key={a.id}
                          first={ai === 0}
                          activity={a}
                          accent={SAGE}
                          dayTitle={day.title}
                          proposer={proposerName(a.created_by)}
                          review={reviews.get(a.id)}
                          onToggle={() => onToggle(a)}
                          onLongPress={() => setActionAct(a)}
                          onSubmitReview={async (score, content) => { await submitReview(supabase, id, { score, content: content || null, activityId: a.id }); checkReviewBadges(supabase, id); await load() }}
                          onDeleteReview={async (reviewId) => { await deleteReview(supabase, reviewId); load() }}
                        />
                      ))}

                      {multiday && shownActs.length === 0 && (
                        <Txt variant="caption" color={colors.textFaint} style={{ paddingHorizontal: space.md, paddingTop: space.sm }}>
                          {sel === 'unassigned' ? 'Nessuna attività da programmare.' : 'Nessuna attività in questo giorno.'}
                        </Txt>
                      )}

                      <PressableScale haptic="light" onPress={() => setEdit({ ...EMPTY(day.id, day.activities.length), date: addDate })} style={[styles.addRow, shownActs.length > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                        <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.primary} />
                        <Txt variant="label" color={colors.primary}>Aggiungi attività{addDate ? ` · ${fmtShort(addDate)}` : ''}</Txt>
                      </PressableScale>
                    </View>
                  )}
                </Card>
              </Appear>
            )
          }}
        />
      )}

      <Sheet visible={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? 'Modifica attività' : 'Nuova attività'}>
        <View style={{ gap: space.md }}>
          <PlaceAutocomplete
            label="Cosa farete?" icon="format-list-checks"
            value={edit?.title ?? ''} destination={destination} apiKey={GEOAPIFY_KEY}
            onChangeText={t => setEdit(e => e && { ...e, title: t, lat: null, lng: null })}
            onSelect={p => setEdit(e => e && { ...e, title: p.name, location: p.address || e.location, lat: p.lat ?? null, lng: p.lng ?? null })}
            placeholder="Visita al Belvedere"
          />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <DateField label="Orario" mode="time" icon="clock-outline" value={edit?.time ?? ''} onChange={v => setEdit(e => e && { ...e, time: v })} containerStyle={{ flex: 1 }} />
            <Input label="Durata (min)" icon="timer-outline" value={edit?.duration ?? ''} keyboardType="numeric" onChangeText={t => setEdit(e => e && { ...e, duration: t.replace(/[^0-9]/g, '') })} placeholder="60" containerStyle={{ flex: 1 }} />
          </View>
          <Input label="Luogo" icon="map-marker-outline" value={edit?.location ?? ''} onChangeText={t => setEdit(e => e && { ...e, location: t })} placeholder="Schloss Belvedere" />
          <Input label="Note" icon="note-text-outline" value={edit?.notes ?? ''} onChangeText={t => setEdit(e => e && { ...e, notes: t })} multiline placeholder="Biglietti, indirizzo…" />
          <Button title={edit?.id ? 'Salva' : 'Aggiungi'} gradient="party" icon={edit?.id ? 'content-save' : 'plus'} loading={saving} disabled={!edit?.title.trim()} onPress={confirmSave} full style={{ marginTop: space.sm }} />
        </View>
      </Sheet>

      {/* Sheet tappa */}
      <Sheet visible={dayEdit !== null} onClose={() => setDayEdit(null)} title={dayEdit?.id ? 'Modifica tappa' : 'Nuova tappa'}>
        <View style={{ gap: space.md }}>
          <PlaceAutocomplete
            label="Tappa (città, quartiere o luogo)" icon="map-marker-radius-outline"
            value={dayEdit?.title ?? ''} destination={destination} apiKey={GEOAPIFY_KEY} type="city"
            onChangeText={t => setDayEdit(d => d && { ...d, title: t, lat: null, lng: null })}
            onSelect={p => setDayEdit(d => d && { ...d, title: p.name, lat: p.lat ?? null, lng: p.lng ?? null })}
            placeholder="Cerca città, quartiere o luogo…"
          />
          {dayEdit && dayEdit.lat != null && (
            <Txt variant="caption" color={colors.tertiary} style={{ marginTop: -space.sm }}>📍 Posizione impostata — i km saranno accurati</Txt>
          )}
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <DateField label="Dal" icon="calendar-blank-outline" value={dayEdit?.date ?? ''} onChange={v => setDayEdit(d => d && { ...d, date: v })} containerStyle={{ flex: 1 }} />
            <DateField label="Al (opz.)" icon="calendar-check-outline" value={dayEdit?.dateEnd ?? ''} onChange={v => setDayEdit(d => d && { ...d, dateEnd: v })} containerStyle={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            {dayEdit?.id && <Button title="Elimina" variant="ghost" onPress={onDeleteDay} />}
            <Button title={dayEdit?.id ? 'Salva' : 'Crea tappa'} gradient="ocean" icon={dayEdit?.id ? 'content-save' : 'map-marker-plus'} loading={saving} disabled={!dayEdit?.title.trim()} onPress={confirmDay} full style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>

      {/* Sheet sposta attività: giorno nella tappa (se multiday) + altre tappe */}
      <Sheet visible={moveAct !== null} onClose={() => setMoveAct(null)} title="Sposta attività">
        <Txt variant="body" color={colors.textSoft} style={{ marginBottom: space.md }} numberOfLines={1}>“{moveAct?.title}”</Txt>
        {(() => {
          const src = days.find(d => d.id === moveAct?.day_id)
          const srcDates = src ? tappaDates(src) : []
          if (srcDates.length <= 1) return null
          return (
            <View style={{ marginBottom: space.lg }}>
              <Txt variant="label" color={colors.textFaint} style={{ marginBottom: space.sm }}>GIORNI DI QUESTA TAPPA</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {['unassigned', ...srcDates].map(p => {
                  const isUn = p === 'unassigned'
                  const on   = (moveAct?.activity_date ?? null) === (isUn ? null : p)
                  return (
                    <PressableScale key={p} haptic="light" onPress={() => doAssignDay(isUn ? null : p)}>
                      <View style={[styles.dayPill, { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.line }]}>
                        <Txt variant="caption" color={on ? colors.white : colors.textSoft}>{isUn ? '📥 Da programmare' : `G${srcDates.indexOf(p) + 1} · ${fmtShort(p)}`}</Txt>
                      </View>
                    </PressableScale>
                  )
                })}
              </View>
            </View>
          )
        })()}
        <Txt variant="label" color={colors.textFaint} style={{ marginBottom: space.sm }}>ALTRE TAPPE</Txt>
        <View style={{ gap: space.sm }}>
          {days.filter(d => d.id !== moveAct?.day_id).map(d => (
            <PressableScale key={d.id} haptic="light" onPress={() => doMove(d)}>
              <Card padded={false} elevation="soft" style={[styles.moveRow, { borderWidth: 1, borderColor: colors.line }]}>
                <View style={styles.moveNum}><Txt variant="bodyStrong" color={colors.white}>{days.indexOf(d) + 1}</Txt></View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{d.title || 'Tappa'}</Txt>
                  {d.date && <Txt variant="caption" color={colors.textSoft}>{fmtDate(d.date)}</Txt>}
                </View>
                <Txt variant="caption" color={colors.textFaint}>{d.activities.length} att.</Txt>
              </Card>
            </PressableScale>
          ))}
          {days.filter(d => d.id !== moveAct?.day_id).length === 0 && (
            <Txt variant="body" color={colors.textSoft}>Non ci sono altre tappe dove spostarla.</Txt>
          )}
        </View>
      </Sheet>

      {/* Menu azioni attività (tieni premuto) */}
      <Sheet visible={actionAct !== null} onClose={() => setActionAct(null)} title={actionAct?.title || 'Attività'}>
        <View style={{ gap: space.sm }}>
          <Button title="Modifica" variant="secondary" icon="pencil" full onPress={() => { const a = actionAct!; setActionAct(null); openEdit(a) }} />
          <Button title="Sposta (tappa / giorno)" variant="tertiary" icon="swap-horizontal" full onPress={() => { const a = actionAct!; setActionAct(null); setMoveAct(a) }} />
          <Button title="Elimina" variant="danger" icon="trash-can-outline" full onPress={() => { const a = actionAct!; setActionAct(null); onDelete(a) }} />
        </View>
      </Sheet>

      {/* Menu azioni tappa (tieni premuto) */}
      <Sheet visible={dayActions !== null} onClose={() => setDayActions(null)} title={dayActions?.title || 'Tappa'}>
        <View style={{ gap: space.sm }}>
          <Button title="Modifica" variant="secondary" icon="pencil" full onPress={() => { const d = dayActions!; setDayActions(null); setDayEdit({ id: d.id, title: d.title, date: d.date ?? '', dateEnd: d.date_end ?? '', lat: d.lat, lng: d.lng }) }} />
          {dayActions && dayActions.activities.length > 0 && dayActions.activities.some(a => !a.time_start) && (
            <Button title="Ottimizza orari" variant="tertiary" icon="auto-fix" full onPress={() => { const d = dayActions!; setDayActions(null); onSchedule(d.id, d.title, d.date) }} />
          )}
          <Button title="Elimina tappa" variant="danger" icon="trash-can-outline" full onPress={() => { const d = dayActions!; setDayActions(null); confirmDeleteDay(d.id) }} />
        </View>
      </Sheet>

      {!loading && <FAB icon="map-marker-plus" label="Tappa" gradient="ocean" onPress={() => setDayEdit({ id: null, title: '', date: '', dateEnd: '', lat: null, lng: null })} style={{ right: space.lg, bottom: insets.bottom + 92 }} />}

      <Confetti fireKey={celebrate} />
    </View>
  )
}

const styles = StyleSheet.create({
  dayCard:       { marginBottom: space.md, overflow: 'hidden' },
  dayHead:       { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  dayBadge:      { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  dayThumb:      { width: 52, height: 52, borderRadius: radius.md },
  dayThumbEmpty: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dayBody:       { borderTopWidth: 1, borderTopColor: colors.line },
  dayPills:      { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: 2 },
  dayPill:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1 },
  pillDot:       { minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  addRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.md, paddingHorizontal: space.md },
  moveRow:       { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  moveNum:       { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
})
