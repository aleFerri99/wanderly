// queries/reviews.ts — CLIENT-SAFE.
// Lettura recensioni via RLS + upsert tramite Edge Function "review"
// (i punti +badge richiedono service-role). Delete client-direct via RLS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface Review {
  id:          string
  user_id:     string
  trip_id:     string
  activity_id: string | null
  day_id:      string | null
  score:       number       // 1-10
  content:     string | null
  created_at:  string
  updated_at:  string
}

export interface ActivityReviewSummary {
  avg:    number | null
  count:  number
  mine:   Review | null
}

// Tutte le recensioni del viaggio (per calcolare medie e la mia per ogni attività).
export async function getTripReviews(supabase: SupabaseLike, tripId: string): Promise<Review[]> {
  const { data } = await supabase.from('reviews').select('*').eq('trip_id', tripId)
  return (data ?? []) as Review[]
}

// Raggruppa per attività: media, conteggio, mia recensione.
export function summarizeByActivity(reviews: Review[], myUserId: string | null): Map<string, ActivityReviewSummary> {
  const byAct = new Map<string, Review[]>()
  for (const r of reviews) {
    if (!r.activity_id) continue
    const list = byAct.get(r.activity_id) ?? []
    list.push(r)
    byAct.set(r.activity_id, list)
  }
  const out = new Map<string, ActivityReviewSummary>()
  for (const [actId, list] of byAct) {
    const avg = list.reduce((s, r) => s + r.score, 0) / list.length
    out.set(actId, {
      avg:   Math.round(avg * 10) / 10,
      count: list.length,
      mine:  list.find(r => r.user_id === myUserId) ?? null,
    })
  }
  return out
}

// Upsert recensione via Edge Function (assegna +punti e controlla i badge).
export async function submitReview(
  supabase: SupabaseLike,
  tripId: string,
  params: { score: number; content?: string | null; activityId?: string; dayId?: string },
): Promise<{ error?: string }> {
  const { data, error } = await supabase.functions.invoke('review', {
    body: { action: 'upsert', tripId, ...params },
  })
  if (error) {
    let code: string | undefined
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
      code = ctx?.json ? (await ctx.json())?.error : undefined
    } catch { /* body non-JSON */ }
    return { error: code ?? (error as { message?: string }).message }
  }
  if (data?.error) return { error: data.error }
  return {}
}

// Elimina la propria recensione (RLS: solo il proprietario).
export async function deleteReview(supabase: SupabaseLike, reviewId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId)
  return { error: error?.message }
}
