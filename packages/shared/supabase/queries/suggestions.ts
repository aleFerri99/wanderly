// queries/suggestions.ts — CLIENT-SAFE.
// Legge i suggerimenti AI da trip_suggestions e li (ri)genera invocando
// la Edge Function "suggestions" (stessa logica del web, ora server-side).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { TripSuggestion } from '../../types/database'

export async function getSuggestions(supabase: SupabaseLike, tripId: string): Promise<TripSuggestion[]> {
  const { data } = await supabase
    .from('trip_suggestions').select('*')
    .eq('trip_id', tripId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as TripSuggestion[]
}

export interface GenerateResult {
  count?:           number
  error?:           string
  missingProfiles?: boolean
}

// Invoca la Edge Function. Il JWT dell'utente viaggia in automatico.
export async function generateSuggestions(supabase: SupabaseLike, tripId: string): Promise<GenerateResult> {
  const { data, error } = await supabase.functions.invoke('suggestions', { body: { tripId } })

  if (error) {
    // Su status != 2xx supabase-js incapsula la Response in error.context:
    // il body JSON ({ error: 'CODE' }) va letto con .json().
    let code: string | undefined
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
      const payload = ctx?.json ? await ctx.json() : null
      code = payload?.error
    } catch { /* body non-JSON: usa error.message */ }
    code = code ?? (error as { message?: string }).message
    if (code === 'MISSING_PROFILES') return { missingProfiles: true }
    return { error: code }
  }

  if (data?.error === 'MISSING_PROFILES') return { missingProfiles: true }
  if (data?.error) return { error: data.error }
  return { count: data?.count ?? 0 }
}

// Separa il corpo dal marcatore {{group_fit}} (motivazione personalizzata).
export function parseSuggestionBody(raw: string): { body: string; groupFit: string | null } {
  const marker = '{{group_fit}}'
  const idx = raw.indexOf(marker)
  if (idx === -1) return { body: raw, groupFit: null }
  return { body: raw.slice(0, idx).trim(), groupFit: raw.slice(idx + marker.length).trim() }
}
