'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient }               from '@supabase/supabase-js'
import { awardPoints }                from '@repo/shared/supabase/gamification-server'

export interface TriviaQuestion {
  q:           string
  opts:        [string, string, string, string]
  correct_idx: number
}

export interface TriviaSession {
  id:           string
  trip_id:      string
  created_by:   string
  destination:  string
  questions:    TriviaQuestion[]
  status:       'waiting' | 'active' | 'finished'
  started_at:   string | null
  finished_at:  string | null
  scores?:      Record<string, number>   // userId → punteggio (solo in 'finished')
}

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Genera domande via Groq ───────────────────────────────────
async function generateQuestions(destination: string): Promise<TriviaQuestion[]> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY non configurata')

  const models  = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant']
  const system  = 'Sei un esperto di quiz per turisti. Rispondi SOLO con JSON valido, nessun markdown.'
  const prompt  = `Genera 10 domande a risposta multipla su ${destination}.
Argomenti: storia, cultura, gastronomia, geografia, curiosità locali.
JSON richiesto (array di 10):
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
          max_tokens:      1600,
        }),
        signal: AbortSignal.timeout(25000),
      })
      if (!res.ok) continue

      const data  = await res.json()
      const raw   = data.choices?.[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(raw)
      // L'LLM può restituire { questions: [...] } oppure [...] direttamente
      const arr   = Array.isArray(parsed)
        ? parsed
        : (parsed.questions ?? parsed.trivia ?? Object.values(parsed)[0])

      if (Array.isArray(arr) && arr.length >= 10) {
        return arr.slice(0, 10).map((q: { q?: string; question?: string; opts?: string[]; options?: string[]; correct_idx?: number; correct?: number }) => ({
          q:           String(q.q ?? q.question ?? ''),
          opts:        (q.opts ?? q.options ?? ['A', 'B', 'C', 'D']).slice(0, 4) as [string, string, string, string],
          correct_idx: Number(q.correct_idx ?? q.correct ?? 0),
        }))
      }
    } catch { continue }
  }
  throw new Error('Impossibile generare le domande. Riprova tra un momento.')
}

// ── Crea sessione (con generazione AI) ───────────────────────
export async function createTriviaSession(
  tripId:      string,
  destination: string,
): Promise<{ sessionId?: string; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { error: 'Accesso negato' }

  // Pulisce sessioni 'active' bloccate da >5 min (es. non tutti i membri hanno giocato)
  // usa service role per bypass RLS DELETE
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSvc() as any)
    .from('trivia_sessions')
    .delete()
    .eq('trip_id', tripId)
    .eq('status', 'active')
    .lt('started_at', staleThreshold)

  // Check: nessuna sessione attiva recente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('trivia_sessions').select('id, status').eq('trip_id', tripId)
    .in('status', ['waiting', 'active']).maybeSingle()
  if (existing) return { error: 'C\'è già una sessione in corso!', sessionId: existing.id }

  const questions = await generateQuestions(destination || 'Italia')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error } = await (supabase as any)
    .from('trivia_sessions')
    .insert({ trip_id: tripId, created_by: user.id, destination, questions, status: 'waiting' })
    .select('id').single()

  if (error) return { error: error.message }
  return { sessionId: session.id }
}

// ── Avvia la sessione (solo il creatore) ─────────────────────
export async function startTriviaSession(
  sessionId: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trivia_sessions')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', sessionId).eq('created_by', user.id)

  if (error) return { error: error.message }
  return { success: true }
}

// ── Sessione attiva del viaggio ───────────────────────────────
export async function getActiveTriviaForTrip(tripId: string): Promise<TriviaSession | null> {
  const supabase = await createServerSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('trivia_sessions')
    .select('id, trip_id, created_by, destination, questions, status, started_at, finished_at')
    .eq('trip_id', tripId)
    .in('status', ['waiting', 'active', 'finished'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data as TriviaSession | null
}

// ── Registra risposta + eventuale finalizzazione ──────────────
export async function submitTriviaAnswer(
  sessionId:   string,
  tripId:      string,
  questionIdx: number,
  answerIdx:   number,
  timeMs:      number,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trivia_answers')
    .upsert({
      session_id:   sessionId,
      user_id:      user.id,
      question_idx: questionIdx,
      answer_idx:   answerIdx,
      time_ms:      Math.max(0, timeMs),
    }, { onConflict: 'session_id,user_id,question_idx', ignoreDuplicates: true })

  if (error) return { error: error.message }

  // Controlla se è il momento di finalizzare (non-blocking)
  checkAndFinalize(sessionId, tripId).catch(() => {})
  return { success: true }
}

// ── Finalizzazione manuale (creatore forza la fine) ───────────
export async function forceFinalizeTriviaSession(
  sessionId: string,
  tripId:    string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  await finalizeSession(sessionId, tripId)
  return { success: true }
}

// ── Logica di finalizzazione (service role) ───────────────────
async function checkAndFinalize(sessionId: string, tripId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any

  const [{ data: sessionRaw }, { data: answersRaw }] = await Promise.all([
    db.from('trivia_sessions').select('questions, status').eq('id', sessionId).single(),
    db.from('trivia_answers').select('user_id, question_idx').eq('session_id', sessionId),
  ])

  const session = sessionRaw as { questions: TriviaQuestion[]; status: string } | null
  if (!session || session.status === 'finished') return

  const answers  = (answersRaw ?? []) as { user_id: string; question_idx: number }[]
  const qCount   = session.questions?.length ?? 5

  // Conta solo i partecipanti ATTIVI (chi ha risposto almeno 1 domanda)
  const participants = new Set(answers.map(a => a.user_id))
  if (participants.size === 0) return  // nessuno ha ancora risposto

  // Finalizza quando ogni partecipante attivo ha risposto a tutte le domande
  const allDone = [...participants].every(uid =>
    answers.filter(a => a.user_id === uid).length >= qCount
  )

  if (allDone) await finalizeSession(sessionId, tripId)
}

async function finalizeSession(sessionId: string, tripId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any

  // Idempotenza
  const { data: s } = await db
    .from('trivia_sessions').select('questions, status').eq('id', sessionId).single()
  if (!s || s.status === 'finished') return

  const questions = s.questions as TriviaQuestion[]

  // Carica tutte le risposte
  const { data: answersRaw } = await db
    .from('trivia_answers')
    .select('user_id, question_idx, answer_idx, time_ms')
    .eq('session_id', sessionId)

  type AnswerRow = { user_id: string; question_idx: number; answer_idx: number; time_ms: number }
  const answers = (answersRaw ?? []) as AnswerRow[]

  // Calcola punteggio per utente
  // Corretto: 100 pt base + bonus velocità max 60 pt (su 30s)
  const scores: Record<string, number> = {}
  for (const ans of answers) {
    const q = questions[ans.question_idx]
    if (!q) continue
    const correct = ans.answer_idx === q.correct_idx
    const pts = correct ? 100 + Math.max(0, Math.floor((30000 - ans.time_ms) / 500)) : 0
    scores[ans.user_id] = (scores[ans.user_id] ?? 0) + pts
  }

  // Vincitore(i)
  if (Object.keys(scores).length > 0) {
    const maxScore = Math.max(...Object.values(scores))
    const winners  = Object.entries(scores).filter(([, s]) => s === maxScore).map(([uid]) => uid)

    for (const uid of winners) {
      // +15 nella classifica generale
      await awardPoints(tripId, uid, 'trivia_winner')
      // Badge Cervellone
      await db.from('user_achievements').upsert(
        { user_id: uid, trip_id: tripId, badge_id: 'cervellone_viaggio' },
        { onConflict: 'user_id,trip_id,badge_id', ignoreDuplicates: true }
      )
    }
  }

  // Segna come finished e salva scores per la schermata risultati
  await db.from('trivia_sessions').update({
    status:      'finished',
    finished_at: new Date().toISOString(),
    // Riusa il campo questions per salvare i punteggi: {scores: {...}}
    // In alternativa aggiungiamo un campo metadata, ma qui riusiamo questions
  }).eq('id', sessionId)

  // Salva scores separatamente aggiornando il record
  await db.from('trivia_sessions').update({ questions: { questions, scores } }).eq('id', sessionId)

  // Auto-delete dopo 90 secondi (tempo per leggere i risultati)
  setTimeout(async () => {
    await getSvc().from('trivia_sessions').delete().eq('id', sessionId)
  }, 90_000)
}
