// ============================================================
// src/lib/supabase/client.ts
// Client Supabase per il browser (componenti client-side)
// ============================================================
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@repo/shared/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
