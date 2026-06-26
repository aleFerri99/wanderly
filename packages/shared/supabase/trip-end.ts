// ============================================================
// src/lib/trip-end.ts
// Calcola e assegna i bonus di fine viaggio:
//   - Massimo Finanziatore (+50): chi ha saldo netto positivo più alto
//   - Massimo Debitore (-50): chi ha saldo netto negativo più basso
// Idempotente: controlla prima se già applicati.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { POINTS } from './gamification'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type ExpenseRow = {
  paid_by:      string
  amount_eur:   number
  split_among:  string[]
}

function computeBalances(
  expenses: ExpenseRow[],
  memberIds: string[],
): Map<string, number> {
  const balance = new Map<string, number>(memberIds.map(id => [id, 0]))

  for (const exp of expenses) {
    const split = exp.split_among.length
    if (split === 0) continue
    const share = exp.amount_eur / split

    balance.set(exp.paid_by, (balance.get(exp.paid_by) ?? 0) + exp.amount_eur)
    for (const uid of exp.split_among) {
      balance.set(uid, (balance.get(uid) ?? 0) - share)
    }
  }

  return balance
}

export async function applyExpenseBonusesForTrip(tripId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSvc() as any

  // ── Idempotenza ──────────────────────────────────────────
  const { data: existing } = await db
    .from('points_log')
    .select('id')
    .eq('trip_id', tripId)
    .in('event_type', ['massimo_finanziatore', 'massimo_debitore'])
    .limit(1)
    .maybeSingle()

  if (existing) return 'già applicati'

  // ── Carica spese e membri ────────────────────────────────
  const { data: expRaw } = await db
    .from('expenses')
    .select('paid_by, amount_eur, split_among')
    .eq('trip_id', tripId)

  const { data: membRaw } = await db
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)

  const expenses  = (expRaw  ?? []) as ExpenseRow[]
  const memberIds = ((membRaw ?? []) as { user_id: string }[]).map(m => m.user_id)

  if (!expenses.length || memberIds.length < 2) return 'skip (no dati)'

  const balances = computeBalances(expenses, memberIds)
  const entries  = [...balances.entries()]

  // ── Massimo Finanziatore: saldo positivo più alto ────────
  const topLender = entries.reduce((a, b) => b[1] > a[1] ? b : a)
  if (topLender[1] > 0.01) {
    await db.from('points_log').insert({
      trip_id:    tripId,
      user_id:    topLender[0],
      event_type: 'massimo_finanziatore',
      points:     POINTS.massimo_finanziatore,  // +50
      metadata:   { net_balance: Math.round(topLender[1] * 100) / 100 },
    })
  }

  // ── Massimo Debitore: saldo negativo più basso ───────────
  const topDebtor = entries.reduce((a, b) => b[1] < a[1] ? b : a)
  if (topDebtor[1] < -0.01) {
    await db.from('points_log').insert({
      trip_id:    tripId,
      user_id:    topDebtor[0],
      event_type: 'massimo_debitore',
      points:     POINTS.massimo_debitore,   // -50
      metadata:   { net_balance: Math.round(topDebtor[1] * 100) / 100 },
    })
  }

  return `finanziatore=${topLender[0].slice(0,8)} debitore=${topDebtor[0].slice(0,8)}`
}
