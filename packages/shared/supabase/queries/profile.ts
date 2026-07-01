// queries/profile.ts — CLIENT-SAFE. Profilo utente + passaporto (paesi visitati).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { Profile } from '../../types/database'

export async function getProfile(supabase: SupabaseLike, userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return (data ?? null) as Profile | null
}

export async function updateProfile(
  supabase: SupabaseLike, userId: string,
  fields: {
    full_name?: string | null; nationality?: string | null; trip_notes?: string | null
    birth_date?: string | null; gender?: string | null
    languages?: string[]; travel_interests?: string[]
  },
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', userId)
  return { error: error?.message }
}

// ── Passaporto ────────────────────────────────────────────────
export async function getVisitedCountries(supabase: SupabaseLike, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('user_visited_countries').select('country_code').eq('user_id', userId)
  return ((data ?? []) as { country_code: string }[]).map(r => r.country_code)
}

export async function addVisitedCountry(
  supabase: SupabaseLike, userId: string, countryCode: string,
): Promise<{ error?: string }> {
  const { error } = await supabase.from('user_visited_countries').upsert({
    user_id:      userId,
    country_code: countryCode,
    source:       'manual',
    visited_at:   new Date().toISOString().split('T')[0],
  }, { onConflict: 'user_id,country_code', ignoreDuplicates: true })
  return { error: error?.message }
}

export async function removeVisitedCountry(
  supabase: SupabaseLike, userId: string, countryCode: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('user_visited_countries').delete()
    .eq('user_id', userId).eq('country_code', countryCode)
  return { error: error?.message }
}
