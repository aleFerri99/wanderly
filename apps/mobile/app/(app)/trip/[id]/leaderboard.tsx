import { useCallback, useEffect, useRef, useState } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  getLeaderboard, getBathroomToday, getTodaySprint, getVoteSummary,
  castVote, awardBathroom, claimSprint, getTripBadges, applyTripEndBonuses, type LeaderEntry,
} from '@repo/shared/supabase/queries/gamification'
import { BATHROOM_DAILY_MAX, POINTS_GUIDE } from '@repo/shared/supabase/gamification'
import { BADGES, BADGES_BY_ID } from '@repo/shared/badges'
import { MotiView } from 'moti'
import { Header, Txt, Card, Button, Chip, Avatar, Skeleton, PressableScale, Appear, Confetti, EmojiRain, Toast } from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'

const MEDAL_COLORS = ['#C9A24B', '#A7ABA0', '#B07F4F']   // oro · argento-salvia · bronzo
const POOP_STANDBY_MS = 30_000                           // cooldown reale del DB (award_bathroom): 30s tra una 💩 e l'altra

export default function Leaderboard() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [board,   setBoard]   = useState<LeaderEntry[]>([])
  const [bath,    setBath]    = useState<Record<string, number>>({})
  const [sprint,  setSprint]  = useState<string | null>(null)
  const [votedFor,setVotedFor]= useState<string | null>(null)
  const [voteCnt, setVoteCnt] = useState<Record<string, number>>({})
  const [badges,  setBadges]  = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  const [celebrate, setCelebrate] = useState(0)
  const [bathBurst, setBathBurst] = useState(0)
  const [cooling,   setCooling]   = useState(false)   // standby tra una 💩 e l'altra
  const [newBadge,  setNewBadge]  = useState<string | null>(null)
  const prevBadges = useRef<string[] | null>(null)
  const coolTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    const [lb, b, sp, vs, bd] = await Promise.all([
      getLeaderboard(supabase, id), getBathroomToday(supabase, id), getTodaySprint(supabase, id),
      getVoteSummary(supabase, id, userId), getTripBadges(supabase, id),
    ])
    setBoard(lb); setBath(b); setSprint(sp.winnerId); setVotedFor(vs.votedFor); setVoteCnt(vs.counts); setBadges(bd)
    const mine = bd[userId] ?? []
    if (prevBadges.current) {
      const added = mine.find(x => !prevBadges.current!.includes(x))
      if (added) { setCelebrate(c => c + 1); setNewBadge(BADGES_BY_ID.get(added)?.name ?? 'Nuovo badge') }
    }
    prevBadges.current = mine
    setLoading(false)
  }, [id, userId])

  // Carica al mount e quando è pronto l'utente: su web l'evento di focus tra
  // schermate-tab già montate (es. arrivando da "Altro") può non scattare, e
  // il solo useFocusEffect lascerebbe i dettagli vuoti.
  useEffect(() => { load() }, [load])

  useFocusEffect(useCallback(() => {
    load()
    supabase.from('trips').select('end_date').eq('id', id).single()
      .then(({ data }) => { const end = (data as { end_date: string | null } | null)?.end_date; if (end) applyTripEndBonuses(supabase, id, end).then(r => { if (r.applied) load() }) })
    const ch = supabase.channel(`gamif:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'points_log',    filter: `trip_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_votes',   filter: `trip_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sprints', filter: `trip_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_achievements', filter: `trip_id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, load]))

  function onPoop() {
    if (bathMaxed || cooling || !userId) return
    const target = userId
    setBathBurst(b => b + 1)                      // pioggia di 💩 subito
    setCooling(true)                             // standby fino a fine cooldown (30s)
    if (coolTimer.current) clearTimeout(coolTimer.current)
    coolTimer.current = setTimeout(() => setCooling(false), POOP_STANDBY_MS)
    ;(async () => {
      const res = await awardBathroom(supabase, id, target)
      if (res === 'ok' || res === 'max') load()  // Realtime web inaffidabile: aggiorno punti/contatore subito
      if (res === 'max') setCooling(false)        // se è al massimo non serve lo standby (resta comunque dim)
    })()
  }

  useEffect(() => () => { if (coolTimer.current) clearTimeout(coolTimer.current) }, [])
  async function onClaimSprint() {
    if (busy) return
    setBusy(true); const res = await claimSprint(supabase, id); setBusy(false)
    if (res.winnerId) { setSprint(res.winnerId); if (res.winnerId === userId) setCelebrate(c => c + 1) }
  }
  async function onVote(target: string) {
    if (target === userId) return
    setVotedFor(target); await castVote(supabase, id, target); load()
  }

  const nameOf = (uid: string) => board.find(b => b.userId === uid)?.name ?? uid.slice(0, 6)
  const canSprint = new Date().getHours() >= 6
  const myBath = userId ? (bath[userId] ?? 0) : 0
  const bathMaxed = myBath >= BATHROOM_DAILY_MAX

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Classifica" onBack={() => router.back()} />

      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}><Skeleton height={80} radius={radius.xl} /><Skeleton height={180} radius={radius.xl} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 96 }}>
          {/* Speedy */}
          <Card gradient={sprint ? 'sunset' : undefined} elevation="soft" style={{ marginBottom: space.md }}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" color={sprint ? colors.white : colors.text}>⚡ Più veloce della mattina</Txt>
                <Txt variant="caption" color={sprint ? 'rgba(255,255,255,0.9)' : colors.textSoft} style={{ marginTop: 2 }}>
                  {sprint ? (sprint === userId ? 'Sei tu! +20pt 🎉' : `${nameOf(sprint)} ha vinto oggi`) : canSprint ? 'Sii il primo: +20pt' : 'La gara parte alle 06:00'}
                </Txt>
              </View>
              {!sprint && canSprint && <Button title="Pronto!" gradient="sunset" size="sm" loading={busy} onPress={onClaimSprint} />}
            </View>
          </Card>

          {/* Classifica — Podio + lista */}
          <Txt variant="heading" style={styles.h}>🏆 Classifica</Txt>
          {board.length > 0 && (
            <Card elevation="soft" style={{ paddingTop: space.lg }}>
              <View style={styles.podium}>
                {([board[1] && { e: board[1], rank: 2, h: 64 }, board[0] && { e: board[0], rank: 1, h: 92 }, board[2] && { e: board[2], rank: 3, h: 48 }]
                  .filter(Boolean) as { e: LeaderEntry; rank: number; h: number }[]).map(({ e, rank, h }) => {
                  const isMe = e.userId === userId
                  return (
                    <View key={e.userId} style={styles.podCol}>
                      {rank === 1 && <Txt style={{ fontSize: 18, marginBottom: -2 }}>👑</Txt>}
                      <Avatar name={e.name} size={rank === 1 ? 54 : 44} style={isMe ? { borderWidth: 2.5, borderColor: colors.primary } : undefined} />
                      <Txt variant="label" numberOfLines={1} style={{ marginTop: 4, maxWidth: 96, textAlign: 'center' }}>{e.name}{isMe ? ' · tu' : ''}</Txt>
                      <Txt variant="bodyStrong" color={colors.primary}>{e.points} pt</Txt>
                      {(badges[e.userId]?.length ?? 0) > 0 && <Txt variant="caption" style={{ marginTop: 1, marginBottom: 4 }}>{badges[e.userId].slice(0, 4).map(b => BADGES_BY_ID.get(b)?.icon ?? '🏅').join(' ')}</Txt>}
                      <View style={[styles.podBlock, { height: h, backgroundColor: MEDAL_COLORS[rank - 1] }]}>
                        <Txt variant="display" color={colors.white}>{rank}</Txt>
                      </View>
                    </View>
                  )
                })}
              </View>
            </Card>
          )}
          {board.length > 3 && (
            <Card elevation="soft" padded={false} style={{ padding: space.sm, marginTop: space.sm }}>
              {board.slice(3).map((e, i) => {
                const isMe = e.userId === userId
                return (
                  <View key={e.userId} style={[styles.lbRow, isMe && { backgroundColor: colors.primarySoft, borderRadius: radius.md }]}>
                    <Txt variant="bodyStrong" color={colors.textSoft} style={{ width: 28, textAlign: 'center' }}>{i + 4}</Txt>
                    <Avatar name={e.name} size={32} />
                    <View style={{ flex: 1, marginLeft: space.sm }}>
                      <Txt variant="bodyStrong">{e.name}{isMe ? ' · tu' : ''}</Txt>
                      {(badges[e.userId]?.length ?? 0) > 0 && <Txt variant="caption">{badges[e.userId].map(b => BADGES_BY_ID.get(b)?.icon ?? '🏅').join(' ')}</Txt>}
                    </View>
                    <Txt variant="bodyStrong" color={colors.primary}>{e.points}</Txt>
                  </View>
                )
              })}
            </Card>
          )}

          {/* MVP */}
          <Txt variant="heading" style={styles.h}>🗳️ MVP del giorno</Txt>
          <Card elevation="soft">
            <Txt variant="caption" color={colors.textSoft} style={{ marginBottom: space.sm }}>{votedFor ? `Hai votato ${nameOf(votedFor)}` : 'Vota il migliore di oggi'}</Txt>
            {board.filter(e => e.userId !== userId).map(e => (
              <View key={e.userId} style={styles.voteRow}>
                <Txt variant="body" style={{ flex: 1 }}>{e.name}</Txt>
                {voteCnt[e.userId] ? <Chip label={`${voteCnt[e.userId]} voti`} tint={colors.bg} color={colors.textSoft} /> : null}
                <Button title={votedFor === e.userId ? 'Votato' : 'Vota'} variant={votedFor === e.userId ? 'primary' : 'ghost'} size="sm" onPress={() => onVote(e.userId)} style={{ marginLeft: space.sm }} />
              </View>
            ))}
          </Card>

          {/* Badge */}
          <Txt variant="heading" style={styles.h}>🎖️ Badge</Txt>
          <Card elevation="soft">
            {BADGES.map((b, i) => {
              const earnedBy = board.filter(e => badges[e.userId]?.includes(b.id)).map(e => e.name)
              const unlocked = earnedBy.length > 0
              return (
                <View key={b.id} style={[styles.badgeRow, !unlocked && { opacity: 0.4 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                  <Txt style={{ fontSize: 26, marginRight: space.sm }}>{b.icon}</Txt>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{b.name}</Txt>
                    <Txt variant="caption" color={colors.textSoft}>{b.description}</Txt>
                    {unlocked && <Txt variant="caption" color={colors.primary} style={{ marginTop: 2 }}>🔓 {earnedBy.join(', ')}</Txt>}
                  </View>
                </View>
              )
            })}
          </Card>

          {/* Guida punti */}
          <Txt variant="heading" style={styles.h}>⭐ Come si fanno punti</Txt>
          <View style={styles.guide}>
            {POINTS_GUIDE.map(g => (
              <Chip key={g.label} label={`${g.icon} ${g.label} (${g.points > 0 ? `+${g.points}` : g.points})`} tint={colors.card} color={colors.textSoft} />
            ))}
          </View>
        </ScrollView>
      )}

      {userId && !loading && (
        <PressableScale
          haptic="medium"
          onPress={onPoop}
          style={{ position: 'absolute', right: space.lg, bottom: insets.bottom + 72 }}
        >
          <MotiView key={bathBurst} from={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 6, stiffness: 300 }}>
            <Txt style={[styles.poop, (bathMaxed || cooling) && { opacity: 0.35 }]} allowFontScaling={false}>💩</Txt>
          </MotiView>
        </PressableScale>
      )}

      <EmojiRain fireKey={bathBurst} emoji="💩" />
      <Confetti fireKey={celebrate} />
      <Toast message={newBadge ? `🏅 Nuovo badge: ${newBadge}` : null} onHide={() => setNewBadge(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  h:          { marginTop: space.lg, marginBottom: space.sm },
  lbRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, gap: 4 },
  podium:     { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: space.xs },
  podCol:     { flex: 1, alignItems: 'center' },
  podBlock:   { width: '88%', borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  poop:       { fontSize: 60, textShadowColor: 'rgba(0,0,0,0.28)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 6 },
  voteRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 6 },
  badgeRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
  guide:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
