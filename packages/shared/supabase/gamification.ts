import { createClient } from '@supabase/supabase-js'

// ── Gamification V2 — Tabella punteggi aggiornata ─────────────
export const POINTS = {
  // Attività
  activity_added:         10,
  activity_completed:     20,
  schedule_optimized:     15,

  // Spese
  expense_added:           5,

  // Note
  note_updated:            5,

  // Recensioni (ora distinte per dare +20 se si fa entrambe)
  review_vote:            10,   // voto 1-10 su attività/tappa
  review_text:            10,   // testo scritto aggiuntivo
  review_added:            5,   // legacy (vecchie recensioni pre-V2)

  // Sondaggio MVP
  daily_vote_received:    30,   // legacy (pre-V2, mantenuto per storico)
  mvp_winner:             50,   // vincitore unico del sondaggio
  mvp_tie_winner:         20,   // pari merito (split)
  mvp_no_vote:           -20,   // malus mancata votazione alle 22:00

  // Bacheca Note & Task (Modulo O)
  task_completed:          5,   // completamento di un task in bacheca

  // Pulsante Bagno
  bathroom:               10,   // max 6 volte/giorno per target

  // Trivia del Luogo
  trivia_winner:          15,   // vincitore sessione quiz AI

  // Valutazione attività giorno precedente (cron 22:00)
  best_activity:          20,   // proponente attività con media voti più alta
  worst_activity:        -20,   // proponente attività con media voti più bassa

  // Gara mattutina Speedy (J.9)
  morning_sprint:         20,   // primo a premere il pulsante dopo le 06:00

  // Inattività pianificazione (cron 22:00, J.8)
  inattivita:            -30,   // nessuna attività proposta nelle ultime 48h

  // Fine viaggio
  massimo_finanziatore:   50,   // chi ha anticipato più soldi
  massimo_debitore:      -50,   // chi ha più debiti nel gruppo
} as const

export type EventType = keyof typeof POINTS

export const BATHROOM_DAILY_MAX = 6
export const BATHROOM_COOLDOWN_SECONDS = 30

export const POINTS_GUIDE: { icon: string; label: string; points: number }[] = [
  { icon: '⭐', label: 'Vota attività/tappa',                     points: POINTS.review_vote },
  { icon: '📝', label: 'Scrivi una recensione',                   points: POINTS.review_text },
  { icon: '🏆', label: 'Vinci il sondaggio MVP',                  points: POINTS.mvp_winner },
  { icon: '🚽', label: 'Pulsante Bagno (max 6/giorno)',           points: POINTS.bathroom },
  { icon: '💰', label: 'Massimo Finanziatore (fine viaggio)',     points: POINTS.massimo_finanziatore },
  { icon: '🏅', label: 'Attività migliore di ieri (proponente)',  points: POINTS.best_activity },
  { icon: '⚡', label: 'Primo a prepararsi la mattina (Speedy)',  points: POINTS.morning_sprint },
  { icon: '😱', label: 'Non voti il sondaggio',                   points: POINTS.mvp_no_vote },
  { icon: '💸', label: 'Massimo Debitore (fine viaggio)',         points: POINTS.massimo_debitore },
  { icon: '👎', label: 'Attività peggiore di ieri (proponente)',  points: POINTS.worst_activity },
  { icon: '🛋️', label: 'Inattività pianificazione (48h)',         points: POINTS.inattivita },
]

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// awardPoints usa service role per poter assegnare punti anche ad altri utenti
export async function awardPoints(
  tripId: string,
  userId: string,
  eventType: EventType,
  referenceId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getServiceClient() as any
    await db.from('points_log').insert({
      trip_id:      tripId,
      user_id:      userId,
      event_type:   eventType,
      reference_id: referenceId ?? null,
      points:       POINTS[eventType],
      metadata:     metadata ?? null,
    })
  } catch {
    // Non-blocking
  }
}

// Versione con punti custom (per MVP tie, trip-end, ecc.)
export async function awardCustomPoints(
  tripId: string,
  userId: string,
  eventType: EventType,
  points: number,
  metadata?: Record<string, unknown>
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getServiceClient() as any
    await db.from('points_log').insert({
      trip_id:      tripId,
      user_id:      userId,
      event_type:   eventType,
      reference_id: null,
      points,
      metadata:     metadata ?? null,
    })
  } catch {
    // Non-blocking
  }
}

export { getServiceClient }
