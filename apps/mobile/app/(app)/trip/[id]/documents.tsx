import { useCallback, useEffect, useState } from 'react'
import { View, FlatList, StyleSheet, Alert, Linking, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getDocuments, addDocument, deleteDocument } from '@repo/shared/supabase/queries/documents'
import { confirmAction } from '@/lib/confirm'
import {
  Txt, Card, IconButton, Skeleton, Sheet, Input, Button, FAB, Chip, DateField, PressableScale, Appear, Header,
} from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'
import type { TripDocument, DocType } from '@repo/shared/types/database'

const DOC_META: Record<DocType, { icon: string; label: string }> = {
  volo: { icon: '✈️', label: 'Volo' }, hotel: { icon: '🏨', label: 'Hotel' },
  treno: { icon: '🚆', label: 'Treno' }, bus: { icon: '🚌', label: 'Bus' },
  noleggio: { icon: '🚗', label: 'Noleggio' }, biglietto: { icon: '🎫', label: 'Biglietto' },
  assicurazione: { icon: '🛡️', label: 'Assicur.' }, altro: { icon: '📄', label: 'Altro' },
}
const DOC_TYPES = Object.keys(DOC_META) as DocType[]

export default function DocumentsTab() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [docs,    setDocs]    = useState<TripDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [open,  setOpen]  = useState(false)
  const [fType, setFType] = useState<DocType>('volo')
  const [title, setTitle] = useState(''); const [code, setCode] = useState('')
  const [date,  setDate]  = useState(''); const [time, setTime] = useState('')
  const [notes, setNotes] = useState(''); const [link, setLink] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => { setDocs(await getDocuments(supabase, id)); setLoading(false) }, [id])

  useEffect(() => { load() }, [load])  // carica al mount (il focus tra tab su web può non scattare)
  useFocusEffect(useCallback(() => {
    load()
    const ch = supabase.channel(`docs:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_documents', filter: `trip_id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, load]))

  async function confirmAdd() {
    if (!title.trim()) return
    setSaving(true)
    await addDocument(supabase, { tripId: id, docType: fType, title, bookingCode: code, docDate: date.trim() || null, docTime: time.trim() || null, notes, linkUrl: link })
    setSaving(false); setOpen(false)
    setTitle(''); setCode(''); setLink(''); setDate(''); setTime(''); setNotes(''); setFType('volo'); load()
  }
  function onDelete(doc: TripDocument) {
    confirmAction('Eliminare il documento?', doc.title, async () => {
      setDocs(prev => prev.filter(d => d.id !== doc.id)); await deleteDocument(supabase, doc.id)
    }, { confirmLabel: 'Elimina', destructive: true })
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md }}><Skeleton height={90} radius={radius.xl} /><Skeleton height={90} radius={radius.xl} /></View>
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Documenti" onBack={() => router.back()} />
      <FlatList
        data={docs}
        keyExtractor={d => d.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 100 }}
        ListEmptyComponent={
          <Appear style={{ alignItems: 'center', paddingTop: 60 }}>
            <Txt style={{ fontSize: 44 }}>🗂️</Txt>
            <Txt variant="body" color={colors.textSoft} style={{ marginTop: space.sm, textAlign: 'center', maxWidth: 260 }}>Voli, hotel, biglietti e codici di prenotazione.</Txt>
          </Appear>
        }
        renderItem={({ item, index }) => {
          const meta = DOC_META[item.doc_type]
          return (
            <Appear index={index}>
              <Card elevation="soft" style={{ marginBottom: space.sm }}>
                <View style={styles.docTop}>
                  <View style={styles.iconBox}><Txt style={{ fontSize: 22 }}>{meta.icon}</Txt></View>
                  <Txt variant="heading" style={{ flex: 1 }}>{item.title}</Txt>
                  {item.created_by === userId && <IconButton icon="trash-can-outline" size={18} color={colors.textFaint} onPress={() => onDelete(item)} />}
                </View>
                {item.booking_code && <Chip label={`🔖 ${item.booking_code}`} tint={colors.primarySoft} color={colors.onPrimarySoft} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />}
                {(item.doc_date || item.doc_time) && (
                  <Txt variant="label" color={colors.textSoft} style={{ marginTop: space.sm }}>
                    {item.doc_date ? new Date(item.doc_date + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : ''}
                    {item.doc_time ? `${item.doc_date ? ' · ' : ''}${item.doc_time.slice(0, 5)}` : ''}
                  </Txt>
                )}
                {item.notes && <Txt variant="body" color={colors.textSoft} style={{ marginTop: space.sm }}>{item.notes}</Txt>}
                {item.link_url && <Txt variant="label" color={colors.primary} style={{ marginTop: space.sm }} onPress={() => Linking.openURL(item.link_url!)}>Apri conferma →</Txt>}
              </Card>
            </Appear>
          )
        }}
      />

      <FAB icon="plus" label="Documento" gradient="ocean" onPress={() => setOpen(true)} style={{ right: space.lg, bottom: insets.bottom + 22 }} />

      <Sheet visible={open} onClose={() => setOpen(false)} title="Nuovo documento">
        <View style={{ gap: space.md }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
            {DOC_TYPES.map(t => {
              const on = fType === t
              return (
                <PressableScale key={t} haptic="light" onPress={() => setFType(t)}>
                  <View style={[styles.typePill, { backgroundColor: on ? colors.primary : colors.bg }]}>
                    <Txt variant="label" color={on ? colors.white : colors.textSoft}>{DOC_META[t].icon} {DOC_META[t].label}</Txt>
                  </View>
                </PressableScale>
              )
            })}
          </ScrollView>
          <Input label="Titolo" icon="format-title" value={title} onChangeText={setTitle} placeholder="Volo Roma → Vienna" />
          <Input label="Codice prenotazione (opz.)" icon="barcode" value={code} onChangeText={setCode} autoCapitalize="characters" />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <DateField label="Data" icon="calendar-blank-outline" value={date} onChange={setDate} containerStyle={{ flex: 2 }} />
            <DateField label="Ora" mode="time" icon="clock-outline" value={time} onChange={setTime} containerStyle={{ flex: 1 }} />
          </View>
          <Input label="Note (opz.)" icon="note-text-outline" value={notes} onChangeText={setNotes} multiline />
          <Input label="Link conferma (opz.)" icon="link-variant" value={link} onChangeText={setLink} autoCapitalize="none" />
          <Button title="Salva" gradient="ocean" icon="content-save" loading={saving} disabled={!title.trim()} onPress={confirmAdd} full style={{ marginTop: space.sm }} />
        </View>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  docTop:   { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconBox:  { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  typePill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill },
})
