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
  splitAmong: string[]
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const rate = await getEurRate(currency)
  const amountEur = Math.round(amount * rate * 100) / 100

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error } = await db.from('expenses').insert({
    trip_id: tripId,
    paid_by: user.id,
    description,
    amount,
    currency,
    amount_eur: amountEur,
    split_among: splitAmong,
  })

  if (error) return { error: error.message }
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
