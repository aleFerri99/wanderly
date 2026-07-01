import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, FlatList, StyleSheet, Alert } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { confirmAction } from '@/lib/confirm'
import {
  getBoardItems, addBoardItem, deleteBoardItem, completeBoardTask, togglePackingItem, generateMyPacking,
} from '@repo/shared/supabase/queries/board'
import {
  Txt, Card, IconButton, Skeleton, Sheet, Input, Button, FAB, ProgressBar, Segmented, PressableScale, Appear, Confetti, Header,
} from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'
import type { GroupBoardItem } from '@repo/shared/types/database'

type Filter = 'tutti' | 'nota' | 'task'

export default function NotesTab() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [items,   setItems]   = useState<GroupBoardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<Filter>('tutti')
  const [open,    setOpen]    = useState(false)
  const [newType, setNewType] = useState<'nota' | 'task'>('nota')
  const [text,    setText]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [genPack, setGenPack] = useState(false)
  const [packErr, setPackErr] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState(0)

  const load = useCallback(async () => { setItems(await getBoardItems(supabase, id)); setLoading(false) }, [id])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reload = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(load, 250) }, [load])

  useEffect(() => { load() }, [load])  // carica al mount (il focus tra tab su web può non scattare)
  useFocusEffect(useCallback(() => {
    load()
    const ch = supabase.channel(`board:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_board', filter: `trip_id=eq.${id}` }, reload)
      .subscribe()
    return () => { if (timer.current) clearTimeout(timer.current); supabase.removeChannel(ch) }
  }, [id, load, reload]))

  const packing = useMemo(() => items.filter(i => i.content_type === 'packing'), [items])
  const board   = useMemo(() => items.filter(i => i.content_type !== 'packing').filter(i =>
    filter === 'tutti' ? true : filter === 'nota' ? i.content_type === 'nota' : i.content_type === 'task'), [items, filter])
  const packDone = packing.filter(p => p.is_completed).length

  async function onTogglePacking(it: GroupBoardItem) {
    const next = !it.is_completed
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, is_completed: next } : x))
    const res = await togglePackingItem(supabase, id, it.id, next)
    if (res.allDone) { setCelebrate(c => c + 1); setItems(prev => prev.filter(x => x.content_type !== 'packing')) }
  }
  async function onCompleteTask(it: GroupBoardItem) {
    setCelebrate(c => c + 1)
    setItems(prev => prev.filter(x => x.id !== it.id))
    await completeBoardTask(supabase, it.id)
  }
  function onDelete(it: GroupBoardItem) {
    confirmAction('Eliminare?', it.text_content, async () => {
      setItems(prev => prev.filter(x => x.id !== it.id)); await deleteBoardItem(supabase, it.id)
    }, { confirmLabel: 'Elimina', destructive: true })
  }
  async function confirmAdd() {
    if (!text.trim()) return
    setSaving(true); await addBoardItem(supabase, id, newType, text); setSaving(false); setOpen(false); setText(''); load()
  }
  async function onGeneratePacking() {
    setGenPack(true); setPackErr(null)
    const res = await generateMyPacking(supabase, id)
    setGenPack(false)
    if (res.error) { setPackErr(res.error); return }
    load()
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md }}><Skeleton height={120} radius={radius.xl} /><Skeleton height={48} radius={radius.pill} /><Skeleton height={56} radius={radius.lg} /></View>
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Bacheca & Valigia" onBack={() => router.back()} />
      <FlatList
        data={board}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 100 }}
        ListHeaderComponent={
          <View>
            {packing.length === 0 ? (
              <Card elevation="soft" style={{ marginBottom: space.lg }}>
                <Txt variant="heading">🎒 La tua valigia</Txt>
                <Txt variant="body" color={colors.textSoft} style={{ marginTop: 4 }}>L'AI prepara una checklist su misura per destinazione, durata e clima del periodo.</Txt>
                {packErr && <Txt variant="label" color={colors.danger} style={{ marginTop: 6 }}>❌ {packErr}</Txt>}
                <Button title={genPack ? 'Genero…' : 'Genera la mia valigia'} gradient="sunset" icon="bag-suitcase" loading={genPack} disabled={genPack} onPress={onGeneratePacking} full style={{ marginTop: space.md }} />
              </Card>
            ) : (
              <Card gradient="sunset" style={{ marginBottom: space.lg }}>
                <View style={styles.rowBetween}>
                  <Txt variant="heading" color={colors.white}>🎒 La tua valigia</Txt>
                  <Txt variant="bodyStrong" color={colors.white}>{packDone}/{packing.length}</Txt>
                </View>
                <View style={{ marginVertical: space.sm }}><ProgressBar progress={packing.length ? packDone / packing.length : 0} color={colors.white} track="rgba(255,255,255,0.3)" height={7} /></View>
                {packing.map(p => (
                  <PressableScale key={p.id} haptic="light" onPress={() => onTogglePacking(p)}>
                    <View style={styles.packRow}>
                      <MaterialCommunityIcons name={p.is_completed ? 'check-circle' : 'circle-outline'} size={22} color={colors.white} />
                      <Txt variant="body" color={colors.white} style={[{ flex: 1 }, p.is_completed && { textDecorationLine: 'line-through', opacity: 0.7 }]}>{p.text_content}</Txt>
                    </View>
                  </PressableScale>
                ))}
              </Card>
            )}

            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'tutti', label: 'Tutti' }, { value: 'nota', label: '📌 Note' }, { value: 'task', label: '☑ Task' },
            ]} />
            <View style={{ height: space.md }} />
          </View>
        }
        ListEmptyComponent={
          <Appear style={{ alignItems: 'center', paddingTop: 30 }}>
            <Txt style={{ fontSize: 40 }}>📋</Txt>
            <Txt variant="body" color={colors.textSoft} style={{ marginTop: space.sm }}>Niente qui. Aggiungi una nota o un task.</Txt>
          </Appear>
        }
        renderItem={({ item, index }) => {
          const isTask  = item.content_type === 'task'
          const creator = item.creator
          const isMine  = item.created_by === userId
          return (
            <Appear index={index}>
              <Card padded={false} elevation="soft" tint={isTask ? colors.tertiarySoft : colors.secondarySoft} style={styles.itemCard}>
                <View style={styles.itemHead}>
                  <Txt variant="caption" color={colors.textSoft}>{creator ? (creator.id === userId ? 'tu' : creator.full_name ?? `@${creator.username}`) : ''}</Txt>
                  {isMine && <IconButton icon="trash-can-outline" size={15} color={colors.textFaint} onPress={() => onDelete(item)} />}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  {isTask && <PressableScale haptic="medium" onPress={() => onCompleteTask(item)}><MaterialCommunityIcons name="circle-outline" size={22} color={colors.tertiary} /></PressableScale>}
                  <Txt variant="body" style={{ flex: 1 }}>{item.text_content}</Txt>
                </View>
              </Card>
            </Appear>
          )
        }}
      />

      <FAB icon="plus" gradient="party" onPress={() => setOpen(true)} style={{ right: space.lg, bottom: insets.bottom + 22 }} />

      <Sheet visible={open} onClose={() => setOpen(false)} title="Aggiungi alla bacheca">
        <View style={{ gap: space.md }}>
          <Segmented value={newType} onChange={setNewType} options={[{ value: 'nota', label: '📌 Nota' }, { value: 'task', label: '☑ Task' }]} />
          <Input label={newType === 'nota' ? 'Nota' : 'Task'} icon={newType === 'nota' ? 'note-text-outline' : 'checkbox-marked-circle-outline'} value={text} onChangeText={setText} multiline placeholder={newType === 'nota' ? 'WiFi, link, appunto…' : 'Cosa deve fare il gruppo?'} />
          <Button title="Aggiungi" gradient="party" icon="plus" loading={saving} disabled={!text.trim()} onPress={confirmAdd} full style={{ marginTop: space.sm }} />
        </View>
      </Sheet>

      <Confetti fireKey={celebrate} />
    </View>
  )
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  packRow:    { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 5 },
  itemCard:   { padding: space.md, marginBottom: space.sm },
  itemHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
})
