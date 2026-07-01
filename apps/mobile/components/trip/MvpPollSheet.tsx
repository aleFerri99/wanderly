import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getOpenMvpPoll, getLatestPollNotification, markNotificationRead } from '@repo/shared/supabase/queries/notifications'
import { getVoteSummary, castVote } from '@repo/shared/supabase/queries/gamification'
import { getTripGroup, type GroupMember } from '@repo/shared/supabase/queries/trips'
import { Sheet, Txt, Avatar, Button, PressableScale } from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'

// Si apre da solo quando c'è un sondaggio MVP aperto oggi e l'utente non ha ancora votato.
export function MvpPollSheet({ tripId }: { tripId: string }) {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [visible,    setVisible]    = useState(false)
  const [candidates, setCandidates] = useState<GroupMember[]>([])
  const [threat,     setThreat]     = useState<string | null>(null)
  const [voting,     setVoting]     = useState<string | null>(null)

  const check = useCallback(async () => {
    if (!userId) return
    const poll = await getOpenMvpPoll(supabase, tripId)
    if (!poll) return
    const vs = await getVoteSummary(supabase, tripId, userId)
    if (vs.votedFor) return  // già votato oggi
    const [g, notif] = await Promise.all([
      getTripGroup(supabase, tripId),
      getLatestPollNotification(supabase, tripId),
    ])
    setCandidates(g.members.filter(m => m.id !== userId))
    if (notif) { setThreat(notif.body); markNotificationRead(supabase, notif.id) }
    setVisible(true)
  }, [tripId, userId])

  useFocusEffect(useCallback(() => { check() }, [check]))

  async function vote(target: string) {
    if (voting) return
    setVoting(target)
    await castVote(supabase, tripId, target)
    setVoting(null); setVisible(false)
  }

  return (
    <Sheet visible={visible} onClose={() => setVisible(false)} title="🗳️ Vota l'MVP di ieri">
      {threat && <Txt variant="body" color={colors.textSoft} style={{ marginBottom: space.md }}>{threat}</Txt>}
      <Txt variant="label" color={colors.textFaint} style={{ marginBottom: space.sm }}>Chi è stato il migliore del gruppo?</Txt>
      <View style={{ gap: space.sm }}>
        {candidates.map(m => (
          <View key={m.id} style={styles.row}>
            <Avatar name={m.full_name || m.username} size={40} />
            <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{m.full_name || m.username}</Txt>
            <Button title={voting === m.id ? '…' : 'Vota'} gradient="party" size="sm" loading={voting === m.id} onPress={() => vote(m.id)} />
          </View>
        ))}
        {candidates.length === 0 && <Txt variant="body" color={colors.textSoft}>Nessun altro membro da votare.</Txt>}
      </View>
    </Sheet>
  )
}

const styles = {
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md, padding: space.md, backgroundColor: colors.card, borderRadius: radius.lg },
}
