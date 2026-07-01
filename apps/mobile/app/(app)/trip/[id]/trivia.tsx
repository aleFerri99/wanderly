import { useCallback, useEffect, useRef, useState } from 'react'
import { View, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  getActiveTrivia, createTrivia, startTrivia, submitTriviaAnswer,
  joinTrivia, leaveTrivia, tickTrivia, getTriviaParticipants, getAnsweredUserIds,
  extractQuestions, extractScores, triviaQuestionPoints,
  TRIVIA_ANSWER_MS, TRIVIA_REVEAL_MS, TRIVIA_LOBBY_MS,
  type TriviaSession, type TriviaQuestion, type TriviaParticipant,
} from '@repo/shared/supabase/queries/trivia'
import { Header, Txt, Card, Button, Skeleton, ProgressBar, PressableScale, Avatar, Confetti } from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'

const secsLeft = (target: number, now: number) => Math.max(0, Math.ceil((target - now) / 1000))

export default function Trivia() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session: auth } = useAuth()
  const userId = auth?.user?.id ?? null

  const [loading, setLoading]           = useState(true)
  const [sess, setSess]                 = useState<TriviaSession | null>(null)
  const [participants, setParticipants] = useState<TriviaParticipant[]>([])
  const [answeredIds, setAnsweredIds]   = useState<string[]>([])
  const [myAnswers, setMyAnswers]       = useState<Record<number, number>>({})
  const [myTimes, setMyTimes]           = useState<Record<number, number>>({})
  const [names, setNames]               = useState<Record<string, string>>({})
  const [error, setError]               = useState<string | null>(null)
  const [creating, setCreating]         = useState(false)
  const [celebrate, setCelebrate]       = useState(0)
  const [now, setNow]                   = useState(Date.now())

  const sessRef = useRef<TriviaSession | null>(null); sessRef.current = sess
  const sidRef  = useRef<string | null>(null)

  // Orologio locale per i countdown (la verità sui tempi resta il server)
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(iv) }, [])

  // Reset delle mie risposte quando cambia sessione
  useEffect(() => {
    if (sess?.id && sess.id !== sidRef.current) { sidRef.current = sess.id; setMyAnswers({}); setMyTimes({}) }
  }, [sess?.id])

  async function loadNames(sc: Record<string, number> | null) {
    if (!sc) return
    const ids = Object.keys(sc); if (!ids.length) return
    const { data } = await supabase.from('profiles').select('id, username, full_name').in('id', ids)
    const map: Record<string, string> = {}
    for (const p of (data ?? []) as { id: string; username: string; full_name: string | null }[]) map[p.id] = p.full_name || p.username || p.id.slice(0, 6)
    setNames(map)
  }

  const hydrate = useCallback(async (s: TriviaSession | null) => {
    setSess(s)
    if (!s) { setParticipants([]); setAnsweredIds([]); return }
    setParticipants(await getTriviaParticipants(supabase, s.id))
    if (s.status === 'active' && s.current_q != null) setAnsweredIds(await getAnsweredUserIds(supabase, s.id, s.current_q))
    if (s.status === 'finished') loadNames(extractScores(s))
  }, [])

  // Motore: avanza lo stato (server) e riallinea i dati di contorno
  const pump = useCallback(async () => {
    const cur = sessRef.current
    if (!cur) return
    let ns: TriviaSession | null = cur
    if (cur.status !== 'finished') {
      const r = await tickTrivia(supabase, cur.id, id)
      ns = r.session ?? await getActiveTrivia(supabase, id)
    } else {
      ns = await getActiveTrivia(supabase, id)
    }
    await hydrate(ns)
  }, [id, hydrate])

  useFocusEffect(useCallback(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const s = await getActiveTrivia(supabase, id)
      if (!alive) return
      setLoading(false)
      if (s && s.status !== 'finished') await joinTrivia(supabase, s.id)
      if (!alive) return
      await hydrate(s)
    })()
    const ch = supabase.channel(`trivia:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trivia_sessions', filter: `trip_id=eq.${id}` }, () => pump())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trivia_participants' }, () => pump())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trivia_answers' }, () => pump())
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(ch)
      const s = sessRef.current
      if (s && s.status === 'active') leaveTrivia(supabase, s.id)  // uscire a metà = partecipazione annullata
    }
  }, [id, hydrate, pump]))

  // Polling che pilota il gioco (indipendente dal Realtime, essenziale su web)
  useEffect(() => {
    if (!sess || sess.status === 'finished') return
    const iv = setInterval(() => pump(), 1200)
    return () => clearInterval(iv)
  }, [sess?.id, sess?.status, pump])

  useEffect(() => { if (sess?.status === 'finished') setCelebrate(c => c + 1) }, [sess?.status])

  async function onCreate() {
    setCreating(true); setError(null); setMyAnswers({})
    const { data: trip } = await supabase.from('trips').select('destination').eq('id', id).single()
    const dest = (trip as { destination: string | null } | null)?.destination ?? 'Italia'
    const res = await createTrivia(supabase, id, dest)
    setCreating(false)
    if (res.error && !res.sessionId) { setError(res.error); return }
    const s = await getActiveTrivia(supabase, id)
    if (s) await joinTrivia(supabase, s.id)
    await hydrate(s)
  }

  async function onStart() {
    if (!sess) return
    setError(null)
    const { error } = await startTrivia(supabase, sess.id, id)
    if (error) setError(error); else pump()
  }

  async function onAnswer(optIdx: number) {
    const s = sess
    if (!s || s.current_q == null || !userId) return
    if (myAnswers[s.current_q] != null) return
    const qStart = s.q_started_at ? Date.parse(s.q_started_at) : Date.now()
    const t = Math.max(0, Date.now() - qStart)
    setMyAnswers(m => ({ ...m, [s.current_q!]: optIdx }))
    setMyTimes(m => ({ ...m, [s.current_q!]: t }))
    await submitTriviaAnswer(supabase, s.id, s.current_q, optIdx, t)
    pump()
  }

  async function onLeave() {
    const s = sess
    if (s) await leaveTrivia(supabase, s.id)
    router.back()
  }

  // ── Stato derivato ──────────────────────────────────────────
  const questions: TriviaQuestion[] = sess ? extractQuestions(sess) : []
  const qIdx    = sess?.current_q ?? 0
  const q       = questions[qIdx]
  const qStart  = sess?.q_started_at ? Date.parse(sess.q_started_at) : 0
  const revealAt = sess?.reveal_at ? Date.parse(sess.reveal_at) : null
  const present = participants.filter(p => !p.left)
  const isCreator = sess?.created_by === userId
  const myAnswer  = sess?.current_q != null ? myAnswers[sess.current_q] : undefined
  // Punti della domanda corrente + totale progressivo (solo mie risposte)
  const qPoints = (q && myAnswer != null && myTimes[qIdx] != null)
    ? triviaQuestionPoints(myAnswer === q.correct_idx, myTimes[qIdx]) : 0
  const myTotal = Object.entries(myTimes).reduce((sum, [qi, t]) => {
    const qq = questions[Number(qi)]
    if (!qq) return sum
    return sum + triviaQuestionPoints(myAnswers[Number(qi)] === qq.correct_idx, t)
  }, 0)
  const scores  = sess?.status === 'finished' ? extractScores(sess) : null
  const ranked  = scores ? Object.entries(scores).sort((a, b) => b[1] - a[1]) : []
  const topScore = ranked.length ? ranked[0][1] : 0

  const phase: 'idle' | 'generating' | 'lobby' | 'prestart' | 'answering' | 'reveal' | 'results' =
    creating ? 'generating'
    : !sess ? 'idle'
    : sess.status === 'waiting' ? 'lobby'
    : sess.status === 'finished' ? 'results'
    : qStart - now > 1000 ? 'prestart'   // solo il countdown iniziale "si parte"; evita flicker tra domande
    : revealAt ? 'reveal'
    : 'answering'

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Trivia del luogo" onBack={phase === 'answering' || phase === 'reveal' || phase === 'prestart' ? onLeave : () => router.back()} />

      {loading ? (
        <View style={{ padding: space.lg }}><Skeleton height={160} radius={radius.xl} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 24 }}>
          {error && <Txt variant="label" color={colors.danger} style={{ marginBottom: space.sm }}>❌ {error}</Txt>}

          {phase === 'idle' && (
            <Card gradient="party">
              <Txt variant="title" color={colors.white}>🧩 Sfida Trivia</Txt>
              <Txt variant="body" color="rgba(255,255,255,0.92)" style={{ marginTop: 6 }}>5 domande sulla destinazione, tutti insieme in tempo reale. Il più veloce e preciso vince +15 punti e il badge Cervellone.</Txt>
              <Button title="Crea una sfida" variant="ghost" icon="play" onPress={onCreate} style={{ alignSelf: 'flex-start', marginTop: space.md, borderColor: colors.white }} />
            </Card>
          )}

          {phase === 'generating' && (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Txt variant="body" style={{ marginTop: space.md }}>Genero le domande…</Txt></View>
          )}

          {phase === 'lobby' && sess && (
            <Card elevation="soft">
              <Txt variant="heading">Sala d'attesa</Txt>
              <Txt variant="body" color={colors.textSoft} style={{ marginTop: 6 }}>
                Inizio automatico tra {secsLeft(Date.parse(sess.created_at) + TRIVIA_LOBBY_MS, now)}s
                {isCreator ? ' · oppure avvia tu quando siete pronti.' : ' · in attesa del via del creatore.'}
              </Txt>

              <View style={styles.lobby}>
                {present.map(p => (
                  <View key={p.user_id} style={styles.lobbyItem}>
                    <Avatar name={p.name} size={40} />
                    <Txt variant="caption" style={{ marginTop: 4, maxWidth: 64, textAlign: 'center' }} numberOfLines={1}>{p.name}{p.user_id === userId ? ' (tu)' : ''}</Txt>
                  </View>
                ))}
              </View>
              <Txt variant="label" color={colors.textFaint} style={{ marginTop: space.sm }}>{present.length} in sala d'attesa</Txt>

              {isCreator
                ? <Button title="Avvia ora" gradient="party" icon="rocket-launch" onPress={onStart} full style={{ marginTop: space.md }} />
                : <ActivityIndicator style={{ marginTop: space.md }} color={colors.primary} />}
            </Card>
          )}

          {phase === 'prestart' && (
            <View style={styles.center}>
              <Txt variant="display" color={colors.primary}>{secsLeft(qStart, now)}</Txt>
              <Txt variant="body" style={{ marginTop: space.sm }}>Si parte! Preparati…</Txt>
            </View>
          )}

          {(phase === 'answering' || phase === 'reveal') && q && (
            <View>
              <View style={styles.rowBetween}>
                <Txt variant="label">Domanda {qIdx + 1}/{questions.length}</Txt>
                {phase === 'answering'
                  ? <Txt variant="bodyStrong" color={secsLeft(qStart + TRIVIA_ANSWER_MS, now) <= 5 ? colors.danger : colors.primary}>⏱ {secsLeft(qStart + TRIVIA_ANSWER_MS, now)}s</Txt>
                  : <Txt variant="bodyStrong" color={colors.secondary}>Prossima tra {secsLeft((revealAt ?? now) + TRIVIA_REVEAL_MS, now)}s</Txt>}
              </View>
              <View style={{ marginVertical: space.sm }}><ProgressBar progress={(qIdx + 1) / questions.length} color={colors.primary} height={8} /></View>
              <Card elevation="soft" style={{ marginBottom: space.md }}><Txt variant="heading">{q.q}</Txt></Card>

              {/* Badge punti della domanda (in fase reveal, animato) */}
              {phase === 'reveal' && (
                <MotiView
                  key={qIdx}
                  from={{ opacity: 0, translateY: 10, scale: 0.8 }}
                  animate={{ opacity: 1, translateY: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                  style={[styles.pointsBadge, { backgroundColor: qPoints > 0 ? colors.successSoft : colors.dangerSoft }]}
                >
                  <MaterialCommunityIcons name={qPoints > 0 ? 'star-four-points' : 'emoticon-sad-outline'} size={20} color={qPoints > 0 ? colors.success : colors.danger} />
                  <Txt variant="bodyStrong" color={qPoints > 0 ? colors.success : colors.danger}>
                    {qPoints > 0 ? `+${qPoints} punti!` : myAnswer != null ? 'Risposta sbagliata' : 'Tempo scaduto'}
                  </Txt>
                  <Txt variant="label" color={colors.textSoft} style={{ marginLeft: 'auto' }}>Totale {myTotal}</Txt>
                </MotiView>
              )}

              {q.opts.map((opt, i) => {
                const correct = i === q.correct_idx
                const mine    = i === myAnswer
                let bg = colors.card, fg = colors.text, border = colors.line
                if (phase === 'reveal') {
                  if (correct) { bg = colors.successSoft; fg = colors.success; border = colors.success }
                  else if (mine) { bg = colors.dangerSoft; fg = colors.danger; border = colors.danger }
                } else if (mine) {
                  bg = colors.primarySoft; fg = colors.primary; border = colors.primary
                }
                const locked = phase === 'reveal' || myAnswer != null
                const pop = phase === 'reveal' && correct
                return (
                  <MotiView
                    key={i}
                    animate={{ scale: pop ? [1, 1.05, 1] : 1 }}
                    transition={{ type: 'timing', duration: 440 }}
                    style={{ marginBottom: space.sm }}
                  >
                    <PressableScale haptic="light" onPress={() => !locked && onAnswer(i)}>
                      <View style={[styles.opt, { backgroundColor: bg, borderColor: border }]}>
                        <Txt variant="bodyStrong" color={fg} style={{ flex: 1 }}>{String.fromCharCode(65 + i)}. {opt}</Txt>
                        {phase === 'reveal' && correct && <MaterialCommunityIcons name="check-circle" size={22} color={colors.success} />}
                        {phase === 'reveal' && mine && !correct && <MaterialCommunityIcons name="close-circle" size={22} color={colors.danger} />}
                      </View>
                    </PressableScale>
                  </MotiView>
                )
              })}

              <Txt variant="caption" color={colors.textFaint} style={{ textAlign: 'center', marginTop: 4 }}>
                {answeredIds.length}/{present.length} hanno risposto
                {phase === 'answering' && myAnswer != null ? ' · in attesa degli altri…' : ''}
              </Txt>
            </View>
          )}

          {phase === 'results' && (
            <View>
              <Txt variant="title" style={{ marginBottom: space.md }}>🏆 Risultati</Txt>
              {ranked.length === 0 && <Txt variant="body" color={colors.textSoft}>Nessun punteggio registrato.</Txt>}
              <Card elevation="soft" padded={false} style={{ padding: space.sm }}>
                {ranked.map(([uid, sc], i) => {
                  const isMe = uid === userId
                  return (
                    <View key={uid} style={[styles.resRow, isMe && { backgroundColor: colors.primarySoft, borderRadius: radius.md }]}>
                      <Txt variant="heading" style={{ width: 30, textAlign: 'center' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</Txt>
                      <Avatar name={names[uid] ?? uid.slice(0, 6)} size={32} />
                      <Txt variant="bodyStrong" style={{ flex: 1, marginLeft: space.sm }}>{names[uid] ?? uid.slice(0, 6)}{isMe ? ' · tu' : ''}</Txt>
                      {sc === topScore && sc > 0 && <Txt variant="label" color={colors.secondary} style={{ marginRight: space.sm }}>+15 🧠</Txt>}
                      <Txt variant="heading" color={colors.primary}>{sc}</Txt>
                    </View>
                  )
                })}
              </Card>
              <Button title="Nuova sfida" gradient="party" icon="refresh" onPress={onCreate} full style={{ marginTop: space.lg }} />
            </View>
          )}
        </ScrollView>
      )}
      <Confetti fireKey={celebrate} />
    </View>
  )
}

const styles = StyleSheet.create({
  center:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  opt:        { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5 },
  pointsBadge:{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10, paddingHorizontal: space.md, borderRadius: radius.lg, marginBottom: space.md },
  resRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6 },
  lobby:      { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md },
  lobbyItem:  { alignItems: 'center', width: 64 },
})
