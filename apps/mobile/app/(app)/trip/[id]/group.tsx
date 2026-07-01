import { useCallback, useEffect, useState } from 'react'
import { View, FlatList, StyleSheet, Share, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { confirmAction } from '@/lib/confirm'
import {
  getTripGroup, updateTrip, deleteTrip, leaveTrip, removeMember, type GroupMember,
} from '@repo/shared/supabase/queries/trips'
import { createShareToken } from '@repo/shared/supabase/queries/share'
import * as Linking from 'expo-linking'
import { Txt, Card, Button, Avatar, Chip, IconButton, Skeleton, Sheet, Input, DateField, PressableScale, Appear, Header } from '@/components/ui'
import { colors, space, radius } from '@/lib/tokens'

const ROLE = { owner: '👑 Owner', editor: '✏️ Editor', viewer: '👀 Viewer' } as const

interface TripForm { name: string; destination: string; start: string; end: string }

export default function GroupTab() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [code,    setCode]    = useState<string | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [online,  setOnline]  = useState<Set<string>>(new Set())
  const [trip,    setTrip]    = useState<TripForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [editTrip, setEditTrip] = useState<TripForm | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [sharing, setSharing] = useState(false)

  const myRole  = members.find(m => m.id === userId)?.role
  const isOwner = myRole === 'owner'

  const load = useCallback(async () => {
    const [group, t] = await Promise.all([
      getTripGroup(supabase, id),
      supabase.from('trips').select('name, destination, start_date, end_date').eq('id', id).single(),
    ])
    setCode(group.inviteCode); setMembers(group.members)
    const td = t.data as { name: string; destination: string | null; start_date: string | null; end_date: string | null } | null
    if (td) setTrip({ name: td.name, destination: td.destination ?? '', start: td.start_date ?? '', end: td.end_date ?? '' })
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])  // carica al mount (il focus tra tab su web può non scattare)
  useFocusEffect(useCallback(() => {
    load()
    if (!userId) return
    const ch = supabase.channel(`trip-presence:${id}`, { config: { presence: { key: userId } } })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState() as Record<string, { user_id: string }[]>
        const ids = new Set<string>()
        for (const arr of Object.values(state)) for (const p of arr) ids.add(p.user_id)
        setOnline(ids)
      })
      .subscribe(async s => { if (s === 'SUBSCRIBED') await ch.track({ user_id: userId, online_at: new Date().toISOString() }) })
    return () => { supabase.removeChannel(ch) }
  }, [id, userId, load]))

  async function share() {
    if (!code) return
    await Share.share({ message: `Unisciti al mio viaggio su Wanderly! 🧳\nCodice invito: ${code}` })
  }
  async function shareItinerary() {
    setSharing(true)
    const res = await createShareToken(supabase, id)
    setSharing(false)
    if (res.error || !res.token) { Alert.alert('Errore', res.error ?? 'Impossibile creare il link'); return }
    const url = Linking.createURL(`/import/${res.token}`)
    await Share.share({ message: `Ti condivido il mio itinerario su Wanderly! 🧳\nApri il link (serve l'app installata) per importarlo:\n${url}` })
  }
  async function saveTrip() {
    if (!editTrip?.name.trim()) return
    setSaving(true)
    await updateTrip(supabase, id, { name: editTrip.name, destination: editTrip.destination, startDate: editTrip.start || null, endDate: editTrip.end || null })
    setSaving(false); setEditTrip(null); load()
  }
  function onLeave() {
    confirmAction('Uscire dal viaggio?', 'Non vedrai più questo viaggio.', async () => {
      await leaveTrip(supabase, id); router.replace('/(app)')
    }, { confirmLabel: 'Esci', destructive: true })
  }
  function onDelete() {
    confirmAction('Eliminare il viaggio?', 'Azione irreversibile: elimina tappe, attività, spese e tutto il resto.', async () => {
      const r = await deleteTrip(supabase, id)
      if (r.error) Alert.alert('Errore', r.error); else router.replace('/(app)')
    }, { confirmLabel: 'Elimina', destructive: true })
  }
  function onRemove(m: GroupMember) {
    confirmAction('Rimuovere il membro?', `${m.full_name || m.username}`, async () => {
      setMembers(prev => prev.filter(x => x.id !== m.id)); await removeMember(supabase, id, m.id)
    }, { confirmLabel: 'Rimuovi', destructive: true })
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md }}><Skeleton height={140} radius={radius.xl} /><Skeleton height={60} radius={radius.lg} /><Skeleton height={60} radius={radius.lg} /></View>
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Gruppo" onBack={() => router.back()} />
      <FlatList
        data={members}
        keyExtractor={m => m.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 110 }}
        ListHeaderComponent={
          <View>
            <Appear>
              <Card elevation="card" style={styles.inviteCard}>
                <Txt variant="label" color={colors.textFaint} style={{ letterSpacing: 1.5 }}>CODICE INVITO</Txt>
                <PressableScale haptic="light" onPress={share}>
                  <Txt style={styles.code}>{code ?? '—'}</Txt>
                </PressableScale>
                <Button title="Condividi invito" gradient="ocean" icon="share-variant" onPress={share} full style={{ marginTop: space.sm }} />
              </Card>
            </Appear>

            <View style={styles.headerRow}>
              <Txt variant="heading">Membri · {members.length}</Txt>
              <View style={styles.onlineWrap}><View style={styles.dot} /><Txt variant="label" color={colors.tertiary}>{online.size} online</Txt></View>
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const isMe = item.id === userId
          return (
            <Appear index={index}>
              <Card padded={false} elevation="soft" style={styles.memberCard}>
                <View style={styles.member}>
                  <View>
                    <Avatar name={item.full_name || item.username} size={42} />
                    {online.has(item.id) && <View style={styles.onlineDot} />}
                  </View>
                  <View style={{ flex: 1, marginLeft: space.md }}>
                    <Txt variant="bodyStrong">{item.full_name || item.username}{isMe ? ' · tu' : ''}</Txt>
                    <Txt variant="caption" color={colors.textSoft}>@{item.username}</Txt>
                  </View>
                  <Chip label={ROLE[item.role]} tint={colors.primarySoft} color={colors.onPrimarySoft} />
                  {isOwner && !isMe && <IconButton icon="account-remove" size={18} color={colors.danger} onPress={() => onRemove(item)} />}
                </View>
              </Card>
            </Appear>
          )
        }}
        ListFooterComponent={
          <View style={{ marginTop: space.xl, gap: space.sm }}>
            <Txt variant="heading" style={{ marginBottom: space.xs }}>Impostazioni</Txt>
            {(isOwner || myRole === 'editor') && trip && (
              <Button title="Modifica viaggio" variant="secondary" icon="pencil" onPress={() => setEditTrip(trip)} full />
            )}
            <Button title="Condividi itinerario" variant="tertiary" icon="share-variant" loading={sharing} onPress={shareItinerary} full />
            <Button title="Esci dal viaggio" variant="ghost" icon="logout" onPress={onLeave} full />
            {isOwner && <Button title="Elimina viaggio" variant="danger" icon="trash-can-outline" onPress={onDelete} full />}
          </View>
        }
      />

      <Sheet visible={editTrip !== null} onClose={() => setEditTrip(null)} title="Modifica viaggio">
        <View style={{ gap: space.md }}>
          <Input label="Nome" icon="tag-heart-outline" value={editTrip?.name ?? ''} onChangeText={t => setEditTrip(e => e && { ...e, name: t })} />
          <Input label="Destinazione" icon="map-marker-outline" value={editTrip?.destination ?? ''} onChangeText={t => setEditTrip(e => e && { ...e, destination: t })} />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <DateField label="Dal" icon="calendar-blank-outline" value={editTrip?.start ?? ''} onChange={v => setEditTrip(e => e && { ...e, start: v })} containerStyle={{ flex: 1 }} />
            <DateField label="Al" icon="calendar-check-outline" value={editTrip?.end ?? ''} onChange={v => setEditTrip(e => e && { ...e, end: v })} containerStyle={{ flex: 1 }} />
          </View>
          <Button title="Salva" gradient="party" icon="content-save" loading={saving} disabled={!editTrip?.name.trim()} onPress={saveTrip} full style={{ marginTop: space.sm }} />
        </View>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  inviteCard: { alignItems: 'center', paddingVertical: space.lg, gap: 2 },
  code:       { fontSize: 34, letterSpacing: 6, fontWeight: '800', color: colors.primary, marginVertical: space.sm },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm },
  onlineWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.tertiary },
  memberCard: { padding: space.md, marginBottom: space.sm },
  member:     { flexDirection: 'row', alignItems: 'center' },
  onlineDot:  { position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: 6.5, borderWidth: 2, borderColor: colors.card, backgroundColor: colors.tertiary },
})
