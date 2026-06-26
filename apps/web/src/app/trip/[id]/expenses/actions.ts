// ============================================================
// src/app/trip/[id]/expenses/actions.ts
// Server Actions per le spese condivise con supporto multi-valuta
// ============================================================
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Recupera il tasso di cambio X→EUR via @fawazahmed0/currency-api
// Gratuito, no API key, aggiornato giornalmente, copre ~170 valute inclusa VND
async function getEurRate(fromCurrency: string): Promise<number> {
  if (fromCurrency === 'EUR') return 1
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json'
    )
    if (!res.ok) return 1
    const data = await res.json()
    // data.eur.vnd = quante VND vale 1 EUR  →  1/rateEurTo = quanti EUR vale 1 VND
    const rateEurTo: number | undefined = data.eur?.[fromCurrency.toLowerCase()]
    return rateEurTo && rateEurTo > 0 ? 1 / rateEurTo : 1
  } catch {
    return 1 // Fallback 1:1 se API non raggiungibile
  }
}

export async function addExpense(
  tripId: string,
  description: string,
  amount: number,
  currency: string,
  splitAmong: string[],
  expenseDate: string,        // YYYY-MM-DD
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const rate = await getEurRate(currency)
  const amountEur = Math.round(amount * rate * 100) / 100

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const dateValue = expenseDate || new Date().toISOString().split('T')[0]
  const baseRecord = { trip_id: tripId, paid_by: user.id, description, amount, currency, amount_eur: amountEur, split_among: splitAmong }

  // Prova prima con expense_date; se la colonna non esiste ancora (migration pendente) usa il record base
  const { error } = await db.from('expenses').insert({ ...baseRecord, expense_date: dateValue })
  if (error) {
    if (error.message?.includes('expense_date') || error.code === '42703') {
      // Colonna non ancora nel DB → inserisci senza (retrocompat finché la migration non gira)
      const { error: err2 } = await db.from('expenses').insert(baseRecord)
      if (err2) return { error: err2.message }
    } else {
      return { error: error.message }
    }
  }
  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

export async function updateExpense(
  expenseId: string,
  tripId: string,
  description: string,
  amount: number,
  currency: string,
  splitAmong: string[],
  expenseDate: string,
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Verifica che l'utente sia il pagante della spesa
  const { data: expRaw } = await supabase
    .from('expenses').select('paid_by').eq('id', expenseId).single()
  if (!expRaw || (expRaw as { paid_by: string }).paid_by !== user.id) {
    return { error: 'Puoi modificare solo le spese che hai pagato tu' }
  }

  const rate = await getEurRate(currency)
  const amountEur = Math.round(amount * rate * 100) / 100

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const baseUpdate = { description, amount, currency, amount_eur: amountEur, split_among: splitAmong, updated_at: new Date().toISOString() }
  const dateValue = expenseDate || new Date().toISOString().split('T')[0]

  const { error } = await db.from('expenses').update({ ...baseUpdate, expense_date: dateValue }).eq('id', expenseId)
  if (error) {
    if (error.message?.includes('expense_date') || error.code === '42703') {
      const { error: e2 } = await db.from('expenses').update(baseUpdate).eq('id', expenseId)
      if (e2) return { error: e2.message }
    } else {
      return { error: error.message }
    }
  }

  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}

export async function deleteExpense(tripId: string, expenseId: string) {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('expenses').delete().eq('id', expenseId)
  if (error) return { error: error.message }

  revalidatePath(`/trip/${tripId}`)
  return { success: true }
}
