// ============================================================
// queries/expenses.ts — CLIENT-SAFE (web + mobile).
// Lettura/scrittura spese + calcolo saldi, con client iniettato.
// Nota: la conversione valutaria del web è omessa qui (default EUR:
// amount_eur = amount). Si potrà aggiungere in seguito.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { Expense } from '../../types/database'

export interface MemberSnap {
  id:        string
  full_name: string | null
  username:  string
}

export async function getTripMembers(supabase: SupabaseLike, tripId: string): Promise<MemberSnap[]> {
  const { data: rows } = await supabase.from('trip_members').select('user_id').eq('trip_id', tripId)
  const ids = ((rows ?? []) as { user_id: string }[]).map(r => r.user_id)
  if (!ids.length) return []
  const { data: profs } = await supabase.from('profiles').select('id, username, full_name').in('id', ids)
  return ((profs ?? []) as { id: string; username: string; full_name: string | null }[])
    .map(p => ({ id: p.id, full_name: p.full_name, username: p.username }))
}

export async function getExpenses(supabase: SupabaseLike, tripId: string): Promise<Expense[]> {
  const { data } = await supabase
    .from('expenses').select('*').eq('trip_id', tripId)
    .order('expense_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as Expense[]
}

export async function addExpense(
  supabase: SupabaseLike,
  params: {
    tripId: string; description: string; amount: number; splitAmong: string[]
    expenseDate: string; currency?: string; amountEur?: number
  },
): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const amount    = Math.round(params.amount * 100) / 100
  const currency  = params.currency ?? 'EUR'
  const amountEur = Math.round((params.amountEur ?? amount) * 100) / 100
  const { error } = await supabase.from('expenses').insert({
    trip_id:      params.tripId,
    paid_by:      user.id,
    description:  params.description.trim(),
    amount,
    currency,
    amount_eur:   amountEur,
    split_among:  params.splitAmong,
    expense_date: params.expenseDate,
  })
  return { error: error?.message }
}

export async function updateExpense(
  supabase: SupabaseLike,
  expenseId: string,
  patch: { description?: string; amount?: number; currency?: string; amountEur?: number; splitAmong?: string[]; expenseDate?: string },
): Promise<{ error?: string }> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.description !== undefined) update.description  = patch.description.trim()
  if (patch.amount      !== undefined) update.amount       = Math.round(patch.amount * 100) / 100
  if (patch.currency    !== undefined) update.currency     = patch.currency
  if (patch.amountEur   !== undefined) update.amount_eur   = Math.round(patch.amountEur * 100) / 100
  if (patch.splitAmong  !== undefined) update.split_among  = patch.splitAmong
  if (patch.expenseDate !== undefined) update.expense_date = patch.expenseDate
  const { error } = await supabase.from('expenses').update(update).eq('id', expenseId)
  return { error: error?.message }
}

export async function deleteExpense(supabase: SupabaseLike, expenseId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId)
  return { error: error?.message }
}

// ── Valute, categorie, settle-up (porta la logica del web) ────────
export const CURRENCIES = [
  { code: 'EUR', symbol: '€' }, { code: 'USD', symbol: '$' }, { code: 'GBP', symbol: '£' },
  { code: 'CHF', symbol: 'Fr' }, { code: 'JPY', symbol: '¥' }, { code: 'VND', symbol: '₫' },
  { code: 'THB', symbol: '฿' }, { code: 'KRW', symbol: '₩' }, { code: 'CNY', symbol: '¥' },
  { code: 'IDR', symbol: 'Rp' }, { code: 'SGD', symbol: 'S$' }, { code: 'MYR', symbol: 'RM' },
  { code: 'PHP', symbol: '₱' }, { code: 'INR', symbol: '₹' }, { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'CA$' }, { code: 'NZD', symbol: 'NZ$' }, { code: 'HKD', symbol: 'HK$' },
  { code: 'TRY', symbol: '₺' }, { code: 'MXN', symbol: 'MX$' }, { code: 'BRL', symbol: 'R$' },
  { code: 'ZAR', symbol: 'R' }, { code: 'EGP', symbol: 'E£' }, { code: 'MAD', symbol: 'MAD' },
  { code: 'PLN', symbol: 'zł' }, { code: 'CZK', symbol: 'Kč' }, { code: 'HUF', symbol: 'Ft' },
  { code: 'RON', symbol: 'lei' }, { code: 'SEK', symbol: 'kr' }, { code: 'NOK', symbol: 'kr' },
  { code: 'DKK', symbol: 'kr' },
]

const EXPENSE_CATEGORIES = [
  { emoji: '🍽️', label: 'Cibo',      keywords: ['ristorante','cena','pranzo','colazione','bar','café','coffee','pizza','sushi','gelato','cibo','food','mangiare','aperitivo','birra','vino','trattoria','osteria','kebab','burger','snack','fast food','bento','ramen','street food','mercato alimentare'] },
  { emoji: '🏨', label: 'Alloggio',  keywords: ['hotel','hostel','airbnb','albergo','b&b','appartamento','ostello','camera','accommodation','booking','guesthouse'] },
  { emoji: '🚗', label: 'Trasporti', keywords: ['taxi','uber','autobus','bus','metro','treno','aereo','volo','traghetto','barca','transfer','navetta','parcheggio','benzina','carburante','ferry','shuttle','rent car','noleggio auto','moto'] },
  { emoji: '🎫', label: 'Attività',  keywords: ['museo','mostra','ingresso','tour','escursione','visita','parco','concerto','teatro','safari','ticket','gita','esperienza','attività','diving','snorkeling','trekking','kayak','spa','massaggio'] },
  { emoji: '🛍️', label: 'Shopping', keywords: ['shopping','negozio','souvenir','mercato','market','acquisto','vestiti','scarpe','farmacia','profumeria','outlet','mall'] },
  { emoji: '📱', label: 'Servizi',   keywords: ['wifi','sim','telefono','internet','lavanderia','assicurazione','visto','visa','laundry','atm','cambio'] },
]

export function classifyExpense(description: string): { emoji: string; label: string } {
  const lower = description.toLowerCase()
  for (const cat of EXPENSE_CATEGORIES) {
    if (cat.keywords.some(kw => lower.includes(kw))) return { emoji: cat.emoji, label: cat.label }
  }
  return { emoji: '💳', label: 'Altro' }
}

export interface Tx { from: string; to: string; amount: number }

// Semplifica i debiti nel minimo numero di transazioni (chi paga chi).
export function simplifyDebts(balances: Balance[]): Tx[] {
  const creds = balances.filter(b => b.net > 0.005).map(b => ({ userId: b.userId, rem: b.net })).sort((a, b) => b.rem - a.rem)
  const debts = balances.filter(b => b.net < -0.005).map(b => ({ userId: b.userId, rem: b.net })).sort((a, b) => a.rem - b.rem)
  const txs: Tx[] = []
  let ci = 0, di = 0
  while (ci < creds.length && di < debts.length) {
    const amt = Math.min(creds[ci].rem, Math.abs(debts[di].rem))
    if (amt > 0.005) txs.push({ from: debts[di].userId, to: creds[ci].userId, amount: Math.round(amt * 100) / 100 })
    creds[ci].rem -= amt; debts[di].rem += amt
    if (creds[ci].rem < 0.005) ci++
    if (Math.abs(debts[di].rem) < 0.005) di++
  }
  return txs
}

// Tasso EUR per 1 unità di `currency` (per convertire amount→EUR: amount * rate).
export async function fetchEurRate(currency: string): Promise<number> {
  if (currency === 'EUR') return 1
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json')
    const d = await res.json()
    const eurTo: number | undefined = d.eur?.[currency.toLowerCase()]
    return eurTo && eurTo > 0 ? 1 / eurTo : 1
  } catch {
    return 1
  }
}

export function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currencyCode }).format(amount)
  } catch {
    const sym = CURRENCIES.find(c => c.code === currencyCode)?.symbol ?? currencyCode
    return `${amount.toFixed(2)} ${sym}`
  }
}

export interface Balance { userId: string; net: number }

// Saldo netto per membro: (quanto ha pagato) − (quota dovuta). Positivo = a credito.
export function computeBalances(expenses: Expense[], memberIds: string[]): Balance[] {
  const map = new Map<string, number>()
  memberIds.forEach(id => map.set(id, 0))
  for (const exp of expenses) {
    const n = exp.split_among.length
    if (n === 0) continue
    const amt   = exp.amount_eur ?? exp.amount
    const share = amt / n
    map.set(exp.paid_by, (map.get(exp.paid_by) ?? 0) + amt)
    for (const uid of exp.split_among) map.set(uid, (map.get(uid) ?? 0) - share)
  }
  return memberIds.map(id => ({ userId: id, net: Math.round((map.get(id) ?? 0) * 100) / 100 }))
}
