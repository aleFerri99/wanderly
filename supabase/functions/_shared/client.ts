// Helper Supabase per Edge Functions (Deno).
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sono iniettati
// automaticamente nel runtime delle Edge Functions: non vanno in `secrets set`.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')!

// Client che agisce COME l'utente chiamante: RLS attiva, usa il JWT della richiesta.
// Per leggere/scrivere rispettando i permessi dell'utente.
export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') ?? ''
  return createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Client service-role: BYPASSA la RLS. Solo per scritture privilegiate
// (es. assegnare punti, scrivere trip_suggestions) dopo aver validato l'utente.
export function adminClient(): SupabaseClient {
  return createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Valida il JWT e ritorna l'utente, oppure null. Da chiamare a inizio handler.
export async function getUser(req: Request) {
  const supabase = userClient(req)
  const { data: { user }, error } = await supabase.auth.getUser()
  return error ? null : user
}

// Verifica che l'utente sia membro del viaggio (usa la RLS dell'utente).
export async function isTripMember(req: Request, tripId: string, userId: string): Promise<boolean> {
  const supabase = userClient(req)
  const { data } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', userId).maybeSingle()
  return !!data
}
