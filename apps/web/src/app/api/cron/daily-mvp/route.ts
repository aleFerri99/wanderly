// ============================================================
// /api/cron/daily-mvp  — Gira alle 22:00 ora italiana
// vercel.json: { "path": "/api/cron/daily-mvp", "schedule": "0 20 * * *" }
// (20:00 UTC = 22:00 CEST estate / 21:00 CET inverno)
//
// Per ogni viaggio attivo:
//   1. Applica malus -20 a chi non ha votato oggi (MVP)
//   2. Assegna +50 al vincitore MVP (o +20 a ciascun pari merito)
//   3. Valuta attività migliore/peggiore di ieri (+20 / -20) — J.8a
//   4. Applica malus inattività -30 se no attività in 48h     — J.8b
//   5. Se il viaggio è finito ieri → applica bonus spese
// ============================================================

import { NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { resolveMvpForTrip }         from '@repo/shared/supabase/mvp'
import { applyExpenseBonusesForTrip } from '@repo/shared/supabase/trip-end'
import { applyDailyActivityAwards, applyInactivityMalus } from '@repo/shared/supabase/daily-awards'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const secret     = process.env.CRON_SECRET
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc     = getSvc()
  const today   = new Date().toISOString().split('T')[0]
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  const results: string[] = []

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tripsRaw } = await (svc as any)
      .from('trips')
      .select('id, name, start_date, end_date')
      .not('start_date', 'is', null)

    type TripRow = { id: string; name: string; start_date: string; end_date: string | null }
    const trips = (tripsRaw ?? []) as TripRow[]

    for (const trip of trips) {
      try {
        const isActive = trip.start_date <= today &&
          (!trip.end_date || trip.end_date >= today)

        // ── 1. Sondaggio MVP (solo viaggi attivi) ─────────────
        if (isActive) {
          const mvpResult = await resolveMvpForTrip(trip.id, today, true)
          results.push(`[${trip.name}] MVP: ${mvpResult}`)
        }

        // ── 2. Best/worst activity di ieri (solo viaggi attivi) ─
        if (isActive) {
          const actResult = await applyDailyActivityAwards(trip.id, yesterdayStr)
          results.push(`[${trip.name}] Attività: ${actResult}`)
        }

        // ── 3. Malus inattività (solo viaggi attivi) ──────────
        if (isActive) {
          const inactResult = await applyInactivityMalus(trip.id)
          results.push(`[${trip.name}] Inattività: ${inactResult}`)
        }

        // ── 4. Bonus spese (solo viaggi finiti ieri) ──────────
        if (trip.end_date === yesterdayStr) {
          const expResult = await applyExpenseBonusesForTrip(trip.id)
          results.push(`[${trip.name}] Spese: ${expResult}`)
        }
      } catch (e) {
        results.push(`[${trip.id}] Errore: ${(e as Error).message}`)
      }
    }

    return NextResponse.json({ ok: true, date: today, results })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
