// Edge port della logica trivia (apps/web/.../trivia/actions.ts).
// Generazione domande via Groq + finalizzazione (scoring, punti, badge).
// NB: lo schema limita question_idx a 0-4 → 5 domande (il web ne generava 10,
// bug latente: gli insert con idx>4 fallivano). Qui generiamo 5.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any

const TRIVIA_WINNER_POINTS = 15            // sync con POINTS.trivia_winner
const BADGE_ID = 'cervellone_viaggio'
const N_QUESTIONS = 5

// ── Tempi del gioco sincronizzato (ms) ───────────────────────
export const PRESTART_MS = 10_000          // "si parte tra…" prima della domanda 1
export const ANSWER_MS   = 20_000          // tempo per rispondere a una domanda
export const REVEAL_MS   = 3_000           // mostra la risposta corretta prima di avanzare
export const LOBBY_MS    = 60_000          // attesa max in lobby → poi start automatico

export interface TriviaQuestion {
  q:           string
  opts:        [string, string, string, string]
  correct_idx: number
}

export async function generateTriviaQuestions(destination: string): Promise<TriviaQuestion[]> {
  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) throw new Error('GROQ_API_KEY non configurata')

  const models = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant']
  const system = 'Sei un esperto di quiz per turisti. Rispondi SOLO con JSON valido, nessun markdown.'
  const prompt = `Genera ${N_QUESTIONS} domande a risposta multipla su ${destination}.
Argomenti: storia, cultura, gastronomia, geografia, curiosità locali.
JSON richiesto (array di ${N_QUESTIONS}):
[{"q":"testo domanda","opts":["A","B","C","D"],"correct_idx":0}]
correct_idx è l'indice 0-3 della risposta corretta. Rendi le domande divertenti per chi visita ${destination}.`

  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages:        [{ role: 'system', content: system }, { role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature:     0.75,
          max_tokens:      1200,
        }),
        signal: AbortSignal.timeout(25000),
      })
      if (!res.ok) continue

      const data   = await res.json()
      const raw    = data.choices?.[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(raw)
      const arr    = Array.isArray(parsed)
        ? parsed
        : (parsed.questions ?? parsed.trivia ?? Object.values(parsed)[0])

      if (Array.isArray(arr) && arr.length >= N_QUESTIONS) {
        return arr.slice(0, N_QUESTIONS).map((q: {
          q?: string; question?: string; opts?: string[]; options?: string[]
          correct_idx?: number; correct?: number
        }) => ({
          q:           String(q.q ?? q.question ?? ''),
          opts:        (q.opts ?? q.options ?? ['A', 'B', 'C', 'D']).slice(0, 4) as [string, string, string, string],
          correct_idx: Number(q.correct_idx ?? q.correct ?? 0),
        }))
      }
    } catch { continue }
  }
  throw new Error('Impossibile generare le domande. Riprova tra un momento.')
}

// ── Sincronizzazione multiplayer ─────────────────────────────

// Avvia la partita: dalla lobby → domanda 0 con countdown "si parte" (PRESTART).
// CAS su status='waiting' così un solo chiamante (creatore o auto) vince.
export async function startSession(
  admin: SupabaseAdmin, sessionId: string,
): Promise<{ session: unknown }> {
  const now = Date.now()
  await admin.from('trivia_sessions').update({
    status: 'active',
    started_at: new Date(now).toISOString(),
    current_q: 0,
    q_started_at: new Date(now + PRESTART_MS).toISOString(),
    reveal_at: null,
  }).eq('id', sessionId).eq('status', 'waiting')
  const { data } = await admin.from('trivia_sessions').select('*').eq('id', sessionId).single()
  return { session: data }
}

// Motore del gioco: chiamato dai client a intervalli. Applica UNA transizione
// dovuta in base all'orario del server e restituisce lo stato aggiornato.
// Tutte le scritture sono idempotenti (guardie su status/current_q/reveal_at).
export async function tickSession(
  admin: SupabaseAdmin, sessionId: string, tripId: string,
): Promise<{ session: unknown; scores?: Record<string, number> }> {
  const { data: sRaw } = await admin
    .from('trivia_sessions').select('*').eq('id', sessionId).single()
  const s = sRaw as {
    id: string; questions: TriviaQuestion[]; status: string; created_at: string
    current_q: number | null; q_started_at: string | null; reveal_at: string | null
  } | null
  if (!s) return { session: null }

  const now = Date.now()

  // Lobby → start automatico dopo LOBBY_MS
  if (s.status === 'waiting') {
    if (now - new Date(s.created_at).getTime() >= LOBBY_MS) {
      const r = await startSession(admin, sessionId)
      return r
    }
    return { session: s }
  }

  if (s.status !== 'active') {
    return { session: s } // finished
  }

  const qCount = (s.questions?.length ?? N_QUESTIONS)
  const qIdx   = s.current_q ?? 0
  const qStart = s.q_started_at ? new Date(s.q_started_at).getTime() : now

  // Countdown "si parte" o attesa inizio domanda: niente da fare.
  if (now < qStart) return { session: s }

  if (!s.reveal_at) {
    // Fase risposta: chiudi se tutti i presenti hanno risposto o è scaduto il tempo.
    const [{ data: partsRaw }, { data: ansRaw }] = await Promise.all([
      admin.from('trivia_participants').select('user_id, left_at').eq('session_id', sessionId),
      admin.from('trivia_answers').select('user_id').eq('session_id', sessionId).eq('question_idx', qIdx),
    ])
    const present  = ((partsRaw ?? []) as { user_id: string; left_at: string | null }[]).filter(p => !p.left_at)
    const answered = new Set(((ansRaw ?? []) as { user_id: string }[]).map(a => a.user_id))
    const allAnswered = present.length > 0 && present.every(p => answered.has(p.user_id))
    const timeUp = now >= qStart + ANSWER_MS

    if (allAnswered || timeUp) {
      await admin.from('trivia_sessions').update({ reveal_at: new Date(now).toISOString() })
        .eq('id', sessionId).eq('current_q', qIdx).is('reveal_at', null)
    }
  } else {
    // Fase reveal: dopo REVEAL_MS avanza alla prossima o finalizza.
    if (now >= new Date(s.reveal_at).getTime() + REVEAL_MS) {
      const next = qIdx + 1
      if (next >= qCount) {
        const fin = await finalizeSession(admin, sessionId, tripId)
        const { data } = await admin.from('trivia_sessions').select('*').eq('id', sessionId).single()
        return { session: data, scores: fin.scores }
      }
      await admin.from('trivia_sessions').update({
        current_q: next, q_started_at: new Date(now).toISOString(), reveal_at: null,
      }).eq('id', sessionId).eq('current_q', qIdx)
    }
  }

  const { data } = await admin.from('trivia_sessions').select('*').eq('id', sessionId).single()
  return { session: data }
}

// Finalizza se tutti i partecipanti attivi hanno risposto a tutte le domande.
export async function checkAndFinalize(
  admin: SupabaseAdmin, sessionId: string, tripId: string,
): Promise<{ finished: boolean; scores?: Record<string, number> }> {
  const [{ data: sessionRaw }, { data: answersRaw }] = await Promise.all([
    admin.from('trivia_sessions').select('questions, status').eq('id', sessionId).single(),
    admin.from('trivia_answers').select('user_id, question_idx').eq('session_id', sessionId),
  ])

  const session = sessionRaw as { questions: TriviaQuestion[]; status: string } | null
  if (!session || session.status === 'finished') return { finished: session?.status === 'finished' }

  const answers = (answersRaw ?? []) as { user_id: string; question_idx: number }[]
  const qCount  = session.questions?.length ?? N_QUESTIONS

  const participants = new Set(answers.map(a => a.user_id))
  if (participants.size === 0) return { finished: false }

  const allDone = [...participants].every(uid =>
    answers.filter(a => a.user_id === uid).length >= qCount,
  )
  if (!allDone) return { finished: false }

  return finalizeSession(admin, sessionId, tripId)
}

// Calcola i punteggi, assegna punti+badge al/i vincitore/i, segna finished.
export async function finalizeSession(
  admin: SupabaseAdmin, sessionId: string, tripId: string,
): Promise<{ finished: boolean; scores?: Record<string, number> }> {
  const { data: s } = await admin
    .from('trivia_sessions').select('questions, status').eq('id', sessionId).single()
  if (!s || s.status === 'finished') return { finished: true }

  const questions = s.questions as TriviaQuestion[]

  const { data: answersRaw } = await admin
    .from('trivia_answers')
    .select('user_id, question_idx, answer_idx, time_ms')
    .eq('session_id', sessionId)

  type AnswerRow = { user_id: string; question_idx: number; answer_idx: number; time_ms: number }
  const answers = (answersRaw ?? []) as AnswerRow[]

  const scores: Record<string, number> = {}
  for (const ans of answers) {
    const q = questions[ans.question_idx]
    if (!q) continue
    const correct = ans.answer_idx === q.correct_idx
    const pts = correct ? 100 + Math.max(0, Math.floor((30000 - ans.time_ms) / 500)) : 0
    scores[ans.user_id] = (scores[ans.user_id] ?? 0) + pts
  }

  if (Object.keys(scores).length > 0) {
    const maxScore = Math.max(...Object.values(scores))
    const winners  = Object.entries(scores).filter(([, v]) => v === maxScore).map(([uid]) => uid)

    for (const uid of winners) {
      await admin.from('points_log').insert({
        trip_id: tripId, user_id: uid, event_type: 'trivia_winner',
        reference_id: null, points: TRIVIA_WINNER_POINTS, metadata: null,
      })
      await admin.from('user_achievements').upsert(
        { user_id: uid, trip_id: tripId, badge_id: BADGE_ID },
        { onConflict: 'user_id,trip_id,badge_id', ignoreDuplicates: true },
      )
    }
  }

  await admin.from('trivia_sessions').update({
    status: 'finished', finished_at: new Date().toISOString(),
    questions: { questions, scores },
  }).eq('id', sessionId)

  return { finished: true, scores }
}
