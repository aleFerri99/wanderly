// ============================================================
// gamification-server.ts — SERVER-ONLY.
// Usa il service role per assegnare punti anche ad altri utenti
// (bypassa RLS). Richiede SUPABASE_SERVICE_ROLE_KEY.
// ⚠️ NON importare dal bundle client/mobile: deve girare solo
// in contesti server (Next server actions, Edge Functions).
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { POINTS, type EventType } from './gamification'

export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Assegna i punti standard di un evento (anche per altri utenti)
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
