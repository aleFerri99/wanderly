// queries/trivia.ts — CLIENT-SAFE.
// Letture/scritture semplici via RLS + invoke della Edge Function "trivia"
// per generazione domande (Groq) e finalizzazione (punti/badge, service-role).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

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
  questions:    TriviaQuestion[] | { questions: TriviaQuestion[]; scores: Record<string, number> }
  status:       'waiting' | 'active' | 'finished'
  started_at:   string | null
  finished_at:  string | null
  created_at:   string
  current_q:    number | null
  q_started_at: string | null
  reveal_at:    string | null
}

export interface TriviaParticipant {
  user_id: string
  name:    string
  left:    boolean
}

// Tempi di gioco (devono restare allineati a _shared/trivia.ts)
export const TRIVIA_ANSWER_MS   = 20_000
export const TRIVIA_REVEAL_MS   = 3_000
export const TRIVIA_LOBBY_MS    = 60_000

// Punti di una singola risposta: 100 base + bonus velocità.
// DEVE restare allineato a finalizeSession() in _shared/trivia.ts.
export function triviaQuestionPoints(correct: boolean, timeMs: number): number {
  return correct ? 100 + Math.max(0, Math.floor((30_000 - Math.max(0, timeMs)) / 500)) : 0
}

// Estrae le domande sia dal formato grezzo (array) sia da quello finale ({questions,scores}).
export function extractQuestions(s: TriviaSession): TriviaQuestion[] {
  const q = s.questions as TriviaQuestion[] | { questions?: TriviaQuestion[] }
  return Array.isArray(q) ? q : (q.questions ?? [])
}

export function extractScores(s: TriviaSession): Record<string, number> | null {
  const q = s.questions as { scores?: Record<string, number> }
  return Array.isArray(s.questions) ? null : (q.scores ?? null)
}

const SESSION_COLS = 'id, trip_id, created_by, destination, questions, status, started_at, finished_at, created_at, current_q, q_started_at, reveal_at'

export async function getActiveTrivia(supabase: SupabaseLike, tripId: string): Promise<TriviaSession | null> {
  const { data } = await supabase
    .from('trivia_sessions')
    .select(SESSION_COLS)
    .eq('trip_id', tripId)
    .in('status', ['waiting', 'active', 'finished'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as TriviaSession | null
}

// ── Lobby / presenze ─────────────────────────────────────────
export async function joinTrivia(supabase: SupabaseLike, sessionId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('trivia_participants')
    .upsert({ session_id: sessionId, user_id: user.id, left_at: null }, { onConflict: 'session_id,user_id' })
}

// Lasciare la partita: presenza annullata + risposte rimosse (escluse dalla classifica).
export async function leaveTrivia(supabase: SupabaseLike, sessionId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('trivia_participants')
    .update({ left_at: new Date().toISOString() }).eq('session_id', sessionId).eq('user_id', user.id)
  await supabase.from('trivia_answers').delete().eq('session_id', sessionId).eq('user_id', user.id)
}

export async function getTriviaParticipants(supabase: SupabaseLike, sessionId: string): Promise<TriviaParticipant[]> {
  const { data: rows } = await supabase
    .from('trivia_participants').select('user_id, left_at').eq('session_id', sessionId)
  const parts = (rows ?? []) as { user_id: string; left_at: string | null }[]
  if (!parts.length) return []
  const ids = parts.map(p => p.user_id)
  const { data: profs } = await supabase.from('profiles').select('id, username, full_name').in('id', ids)
  const nameMap = new Map<string, string>(
    ((profs ?? []) as { id: string; username: string; full_name: string | null }[])
      .map(p => [p.id, p.full_name || p.username || p.id.slice(0, 6)]),
  )
  return parts.map(p => ({ user_id: p.user_id, name: nameMap.get(p.user_id) ?? p.user_id.slice(0, 6), left: !!p.left_at }))
}

// Utenti che hanno già risposto alla domanda corrente (per il conteggio "X/Y").
export async function getAnsweredUserIds(supabase: SupabaseLike, sessionId: string, qIdx: number): Promise<string[]> {
  const { data } = await supabase
    .from('trivia_answers').select('user_id').eq('session_id', sessionId).eq('question_idx', qIdx)
  return ((data ?? []) as { user_id: string }[]).map(a => a.user_id)
}

// Motore sincronizzato: fa progredire lo stato del gioco (idempotente, server-side).
export async function tickTrivia(
  supabase: SupabaseLike, sessionId: string, tripId: string,
): Promise<{ session: TriviaSession | null; scores?: Record<string, number> }> {
  const { data, error } = await supabase.functions.invoke('trivia', { body: { action: 'tick', sessionId, tripId } })
  if (error) return { session: null }
  return { session: (data?.session ?? null) as TriviaSession | null, scores: data?.scores }
}

async function parseInvokeError(error: unknown): Promise<string | undefined> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
    const payload = ctx?.json ? await ctx.json() : null
    return payload?.error ?? (error as { message?: string }).message
  } catch {
    return (error as { message?: string }).message
  }
}

export async function createTrivia(
  supabase: SupabaseLike, tripId: string, destination: string,
): Promise<{ sessionId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('trivia', {
    body: { action: 'create', tripId, destination },
  })
  if (error) return { error: await parseInvokeError(error) }
  if (data?.error) return { error: data.error, sessionId: data.sessionId }
  return { sessionId: data?.sessionId }
}

// Avvio manuale del creatore (server-side: imposta domanda 0 + countdown "si parte").
export async function startTrivia(supabase: SupabaseLike, sessionId: string, tripId: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.functions.invoke('trivia', { body: { action: 'start', sessionId, tripId } })
  if (error) return { error: await parseInvokeError(error) }
  if (data?.error) return { error: data.error }
  return {}
}

export async function submitTriviaAnswer(
  supabase: SupabaseLike, sessionId: string, questionIdx: number, answerIdx: number, timeMs: number,
): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { error } = await supabase.from('trivia_answers').upsert({
    session_id: sessionId, user_id: user.id, question_idx: questionIdx,
    answer_idx: answerIdx, time_ms: Math.max(0, timeMs),
  }, { onConflict: 'session_id,user_id,question_idx', ignoreDuplicates: true })
  return { error: error?.message }
}

export async function finalizeTrivia(
  supabase: SupabaseLike, sessionId: string, tripId: string, force = false,
): Promise<{ finished?: boolean; scores?: Record<string, number>; error?: string }> {
  const { data, error } = await supabase.functions.invoke('trivia', {
    body: { action: 'finalize', sessionId, tripId, force },
  })
  if (error) return { error: await parseInvokeError(error) }
  return { finished: data?.finished, scores: data?.scores }
}
