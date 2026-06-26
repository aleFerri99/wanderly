// ============================================================
// src/components/trip/ExpensesTab.tsx
// Bacheca spese condivise — multi-valuta con conversione automatica in EUR
// ============================================================
'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addExpense, updateExpense, deleteExpense } from '@/app/trip/[id]/expenses/actions'
import { DateInput } from '@/components/ui/DateInput'
import type { Expense, Profile } from '@repo/shared/types/database'

interface Props {
  tripId: string
  members: Profile[]
  currentUserId: string
}

interface Balance {
  userId: string
  profile: Profile
  net: number
}

interface Tx { from: string; to: string; amount: number }

// Algoritmo di semplificazione debiti (minimo numero di transazioni)
// 1. Separa creditori (net > 0) e debitori (net < 0)
// 2. Accoppia greedy: il maggior creditore con il maggior debitore
// 3. Ogni transazione azzera uno dei due → numero minimo di pagamenti
function simplifyDebts(balances: Balance[]): Tx[] {
  const creds = balances
    .filter(b => b.net > 0.005)
    .map(b => ({ userId: b.userId, rem: b.net }))
    .sort((a, b) => b.rem - a.rem)          // più grande prima

  const debts = balances
    .filter(b => b.net < -0.005)
    .map(b => ({ userId: b.userId, rem: b.net }))
    .sort((a, b) => a.rem - b.rem)          // più negativo prima

  const txs: Tx[] = []
  let ci = 0, di = 0

  while (ci < creds.length && di < debts.length) {
    const amt = Math.min(creds[ci].rem, Math.abs(debts[di].rem))
    if (amt > 0.005) {
      txs.push({ from: debts[di].userId, to: creds[ci].userId, amount: Math.round(amt * 100) / 100 })
    }
    creds[ci].rem -= amt
    debts[di].rem += amt
    if (creds[ci].rem            < 0.005) ci++
    if (Math.abs(debts[di].rem)  < 0.005) di++
  }
  return txs
}

// Valute comuni per i viaggi, ordinate per frequenza d'uso
const CURRENCIES = [
  { code: 'EUR', symbol: '€',    name: 'Euro' },
  { code: 'USD', symbol: '$',    name: 'Dollaro USA' },
  { code: 'GBP', symbol: '£',    name: 'Sterlina' },
  { code: 'CHF', symbol: 'Fr',   name: 'Franco svizzero' },
  { code: 'JPY', symbol: '¥',    name: 'Yen giapponese' },
  { code: 'VND', symbol: '₫',    name: 'Dong vietnamita' },
  { code: 'THB', symbol: '฿',    name: 'Baht thai' },
  { code: 'KRW', symbol: '₩',    name: 'Won coreano' },
  { code: 'CNY', symbol: '¥',    name: 'Yuan cinese' },
  { code: 'IDR', symbol: 'Rp',   name: 'Rupia indonesiana' },
  { code: 'SGD', symbol: 'S$',   name: 'Dollaro singaporiano' },
  { code: 'MYR', symbol: 'RM',   name: 'Ringgit malese' },
  { code: 'PHP', symbol: '₱',    name: 'Peso filippino' },
  { code: 'INR', symbol: '₹',    name: 'Rupia indiana' },
  { code: 'AUD', symbol: 'A$',   name: 'Dollaro australiano' },
  { code: 'CAD', symbol: 'CA$',  name: 'Dollaro canadese' },
  { code: 'NZD', symbol: 'NZ$',  name: 'Dollaro neozelandese' },
  { code: 'HKD', symbol: 'HK$',  name: 'Dollaro hongkonghese' },
  { code: 'TRY', symbol: '₺',    name: 'Lira turca' },
  { code: 'MXN', symbol: 'MX$',  name: 'Peso messicano' },
  { code: 'BRL', symbol: 'R$',   name: 'Real brasiliano' },
  { code: 'ZAR', symbol: 'R',    name: 'Rand sudafricano' },
  { code: 'EGP', symbol: 'E£',   name: 'Sterlina egiziana' },
  { code: 'MAD', symbol: 'MAD',  name: 'Dirham marocchino' },
  { code: 'PLN', symbol: 'zł',   name: 'Zloty polacco' },
  { code: 'CZK', symbol: 'Kč',   name: 'Corona ceca' },
  { code: 'HUF', symbol: 'Ft',   name: 'Fiorino ungherese' },
  { code: 'RON', symbol: 'lei',  name: 'Leu rumeno' },
  { code: 'SEK', symbol: 'kr',   name: 'Corona svedese' },
  { code: 'NOK', symbol: 'kr',   name: 'Corona norvegese' },
  { code: 'DKK', symbol: 'kr',   name: 'Corona danese' },
]

// Classificazione spese per keyword nella descrizione
const EXPENSE_CATEGORIES = [
  { emoji: '🍽️', label: 'Cibo',       keywords: ['ristorante','cena','pranzo','colazione','bar','café','coffee','pizza','sushi','gelato','cibo','food','mangiare','aperitivo','birra','vino','trattoria','osteria','kebab','burger','snack','fast food','bento','ramen','street food','mercato alimentare'] },
  { emoji: '🏨', label: 'Alloggio',   keywords: ['hotel','hostel','airbnb','albergo','b&b','appartamento','ostello','camera','accommodation','booking','guesthouse'] },
  { emoji: '🚗', label: 'Trasporti',  keywords: ['taxi','uber','autobus','bus','metro','treno','aereo','volo','traghetto','barca','transfer','navetta','parcheggio','benzina','carburante','ferry','shuttle','biglietto treno','biglietto bus','biglietto aereo','rent car','noleggio auto','moto'] },
  { emoji: '🎫', label: 'Attività',   keywords: ['museo','mostra','ingresso','tour','escursione','visita','parco','concerto','teatro','safari','ticket','gita','esperienza','attività','diving','snorkeling','trekking','kayak','spa','massaggio'] },
  { emoji: '🛍️', label: 'Shopping',  keywords: ['shopping','negozio','souvenir','mercato','market','acquisto','vestiti','scarpe','farmacia','profumeria','outlet','mall'] },
  { emoji: '📱', label: 'Servizi',    keywords: ['wifi','sim','telefono','internet','lavanderia','assicurazione','visto','visa','laundry','atm','cambio'] },
]

function classifyExpense(description: string): { emoji: string; label: string } {
  const lower = description.toLowerCase()
  for (const cat of EXPENSE_CATEGORIES) {
    if (cat.keywords.some(kw => lower.includes(kw))) return { emoji: cat.emoji, label: cat.label }
  }
  return { emoji: '💳', label: 'Altro' }
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// Formatta un importo nella valuta indicata (Intl conosce i decimali corretti per ogni valuta)
function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currencyCode }).format(amount)
  } catch {
    const sym = CURRENCIES.find(c => c.code === currencyCode)?.symbol ?? currencyCode
    return `${amount.toLocaleString('it-IT', { maximumFractionDigits: 2 })} ${sym}`
  }
}

export function ExpensesTab({ tripId, members, currentUserId }: Props) {
  const [expenses, setExpenses] = useState<(Expense & { payer: Profile })[]>([])
  const [adding, setAdding] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedBalanceId, setExpandedBalanceId] = useState<string | null>(null)

  // ── Edit spesa ──
  const [editingId,       setEditingId]       = useState<string | null>(null)
  const [editDesc,        setEditDesc]        = useState('')
  const [editAmount,      setEditAmount]      = useState('')
  const [editCurrency,    setEditCurrency]    = useState('EUR')
  const [editDate,        setEditDate]        = useState('')
  const [editSplit,       setEditSplit]       = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [expenseDate, setExpenseDate] = useState(todayISO())
  const [splitWith, setSplitWith] = useState<string[]>(members.map(m => m.id))
  const [isPending, startTransition] = useTransition()
  const [activeView, setActiveView] = useState<'list' | 'balances' | 'categories'>('list')

  // Tasso EUR per l'anteprima live nel form (lato client)
  const [eurPreviewRate, setEurPreviewRate] = useState<number>(1)
  const [loadingRate, setLoadingRate] = useState(false)

  const supabase = createClient()

  // load esposta come useCallback per poterla chiamare da handleDelete/handleAdd
  const load = useCallback(async () => {
    // Prova prima con expense_date; se la colonna non esiste (migration pendente) usa solo created_at
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (supabase as any)
      .from('expenses')
      .select('*, payer:profiles!paid_by(*)')
      .eq('trip_id', tripId)

    const { data, error } = await q
      .order('expense_date', { ascending: false })
      .order('created_at',   { ascending: false })

    if (error) {
      // Fallback senza expense_date
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: data2 } = await (supabase as any)
        .from('expenses')
        .select('*, payer:profiles!paid_by(*)')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
      if (data2) setExpenses(data2 as (Expense & { payer: Profile })[])
    } else if (data) {
      setExpenses(data as (Expense & { payer: Profile })[])
    }
  }, [supabase, tripId])

  // Carica e iscrive alle spese in realtime
  useEffect(() => {
    load()

    const channel = supabase.channel(`expenses:${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` }, load)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  // Aggiorna il tasso di anteprima quando cambia la valuta
  useEffect(() => {
    if (currency === 'EUR') { setEurPreviewRate(1); return }
    setLoadingRate(true)
    fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json')
      .then(r => r.json())
      .then(d => {
        const rateEurTo: number | undefined = d.eur?.[currency.toLowerCase()]
        setEurPreviewRate(rateEurTo && rateEurTo > 0 ? 1 / rateEurTo : 1)
      })
      .catch(() => setEurPreviewRate(1))
      .finally(() => setLoadingRate(false))
  }, [currency])

  // Calcola saldi usando sempre amount_eur (retrocompat: fallback su amount se amount_eur manca)
  function computeBalances(): Balance[] {
    const balanceMap = new Map<string, number>()
    members.forEach(m => balanceMap.set(m.id, 0))

    expenses.forEach(exp => {
      const splitCount = exp.split_among.length
      if (splitCount === 0) return
      const amtEur = exp.amount_eur ?? exp.amount
      const share = amtEur / splitCount

      balanceMap.set(exp.paid_by, (balanceMap.get(exp.paid_by) ?? 0) + amtEur)
      exp.split_among.forEach(uid => {
        balanceMap.set(uid, (balanceMap.get(uid) ?? 0) - share)
      })
    })

    return members.map(m => ({
      userId: m.id,
      profile: m,
      net: Math.round((balanceMap.get(m.id) ?? 0) * 100) / 100,
    }))
  }

  function handleAdd() {
    const amt = parseFloat(amount)
    if (!description.trim() || isNaN(amt) || amt <= 0 || splitWith.length === 0) return
    startTransition(async () => {
      await addExpense(tripId, description.trim(), amt, currency, splitWith, expenseDate || todayISO())
      setDescription('')
      setAmount('')
      setCurrency('EUR')
      setExpenseDate(todayISO())
      setSplitWith(members.map(m => m.id))
      setAdding(false)
      await load()   // refresh immediato senza aspettare Realtime
    })
  }

  function handleDelete(expenseId: string) {
    if (!confirm('Eliminare questa spesa?')) return
    startTransition(async () => {
      await deleteExpense(tripId, expenseId)
      await load()
    })
  }

  function openEdit(exp: (typeof expenses)[0]) {
    setEditingId(exp.id)
    setEditDesc(exp.description)
    setEditAmount(exp.amount.toString())
    setEditCurrency(exp.currency || 'EUR')
    setEditDate(exp.expense_date || todayISO())
    setEditSplit([...exp.split_among])
    setExpandedId(null)
  }

  function closeEdit() { setEditingId(null) }

  function handleUpdate() {
    const amt = parseFloat(editAmount)
    if (!editDesc.trim() || isNaN(amt) || amt <= 0 || editSplit.length === 0) return
    startTransition(async () => {
      await updateExpense(editingId!, tripId, editDesc.trim(), amt, editCurrency, editSplit, editDate || todayISO())
      setEditingId(null)
      await load()
    })
  }

  function toggleEditSplit(uid: string) {
    setEditSplit(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  function toggleSplit(uid: string) {
    setSplitWith(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    )
  }

  // Totale sempre in EUR
  const totalEur = expenses.reduce((s, e) => s + (e.amount_eur ?? e.amount), 0)
  const balances       = computeBalances()
  const settlementTxs  = simplifyDebts(balances)
  const myBalance      = balances.find(b => b.userId === currentUserId)

  // Raggruppa spese per categoria classificata
  const categoryBreakdown = (() => {
    const map = new Map<string, { emoji: string; label: string; total: number; count: number }>()
    for (const exp of expenses) {
      const cat    = classifyExpense(exp.description)
      const amtEur = exp.amount_eur ?? exp.amount
      const cur    = map.get(cat.label)
      if (cur) { cur.total += amtEur; cur.count++ }
      else map.set(cat.label, { emoji: cat.emoji, label: cat.label, total: amtEur, count: 1 })
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  })()

  // Calcolo anteprima per il form
  const amtNum = parseFloat(amount) || 0
  const previewEur = amtNum * eurPreviewRate
  const previewPerPerson = splitWith.length > 0 ? previewEur / splitWith.length : 0
  const isNonEur = currency !== 'EUR'

  return (
    <div className="exp-wrap">
      {/* Sommario */}
      <div className="exp-summary">
        <div className="exp-stat">
          <span className="exp-stat-val">€{totalEur.toFixed(2)}</span>
          <span className="exp-stat-label">totale in €</span>
        </div>
        <div className="exp-stat-divider" />
        <div className="exp-stat">
          <span className="exp-stat-val">{expenses.length}</span>
          <span className="exp-stat-label">{expenses.length === 1 ? 'spesa' : 'spese'}</span>
        </div>
        {myBalance && (
          <>
            <div className="exp-stat-divider" />
            <div className="exp-stat">
              <span className={`exp-stat-val ${myBalance.net > 0 ? 'exp-credit' : myBalance.net < 0 ? 'exp-debt' : ''}`}>
                {myBalance.net > 0 ? '+' : ''}€{myBalance.net.toFixed(2)}
              </span>
              <span className="exp-stat-label">il tuo saldo</span>
            </div>
          </>
        )}
      </div>

      {/* Tab lista / saldi / categorie */}
      <div className="exp-tabs">
        <button className={`exp-tab ${activeView === 'list'       ? 'exp-tab-active' : ''}`} onClick={() => setActiveView('list')}>
          Lista
        </button>
        <button className={`exp-tab ${activeView === 'categories' ? 'exp-tab-active' : ''}`} onClick={() => setActiveView('categories')}>
          Categorie
        </button>
        <button className={`exp-tab ${activeView === 'balances'   ? 'exp-tab-active' : ''}`} onClick={() => setActiveView('balances')}>
          Saldi
        </button>
      </div>

      {/* Vista lista */}
      {activeView === 'list' && (
        <>
          {expenses.length === 0 && !adding ? (
            <div className="exp-empty">
              <div>💸</div>
              <p>Nessuna spesa ancora.<br />Aggiungi la prima!</p>
            </div>
          ) : (
            <div className="exp-list">
              {expenses.map(exp => {
                const amtEur = exp.amount_eur ?? exp.amount
                const perPerson = exp.split_among.length > 0
                  ? (amtEur / exp.split_among.length).toFixed(2)
                  : '0.00'
                const isMe = exp.paid_by === currentUserId
                const isNonEurExp = exp.currency && exp.currency !== 'EUR'
                const cat = classifyExpense(exp.description)
                const dateLabel = exp.expense_date
                  ? new Date(exp.expense_date + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
                  : null
                const isOpen  = expandedId === exp.id
                const share   = exp.split_among.length > 0 ? amtEur / exp.split_among.length : 0
                const payerShortName = exp.payer?.full_name?.split(' ')[0] || exp.payer?.username || 'Pagante'

                return (
                  <div
                    key={exp.id}
                    className={`exp-item${isOpen ? ' exp-item-open' : ''}${editingId === exp.id ? ' exp-item-editing' : ''}`}
                    onClick={() => editingId !== exp.id && setExpandedId(isOpen ? null : exp.id)}
                  >
                    {/* Riga principale */}
                    <div className="exp-item-main">
                      <div className="exp-item-left">
                        <div className="exp-payer-avatar">
                          {(exp.payer?.full_name || exp.payer?.username || '?')[0].toUpperCase()}
                        </div>
                        <div className="exp-item-info">
                          <div className="exp-item-header">
                            <span className="exp-item-desc">{exp.description}</span>
                            <span className="exp-cat-badge" title={cat.label}>{cat.emoji}</span>
                          </div>
                          <span className="exp-item-meta">
                            {isMe ? 'Tu' : payerShortName}
                            {' · '}diviso in {exp.split_among.length}
                            {' · '}€{perPerson}/p
                            {dateLabel && <> · {dateLabel}</>}
                          </span>
                        </div>
                      </div>
                      <div className="exp-item-right">
                        <div className="exp-item-amounts">
                          {isNonEurExp ? (
                            <>
                              <span className="exp-item-amount-orig">
                                {formatCurrency(Number(exp.amount), exp.currency)}
                              </span>
                              <span className="exp-item-amount-eur">≈ €{amtEur.toFixed(2)}</span>
                            </>
                          ) : (
                            <span className="exp-item-amount">€{amtEur.toFixed(2)}</span>
                          )}
                        </div>
                        {isMe && (
                          <div className="exp-actions" onClick={e => e.stopPropagation()}>
                            <button className="exp-action-btn exp-edit-btn" onClick={() => openEdit(exp)} aria-label="Modifica" title="Modifica">✏️</button>
                            <button className="exp-action-btn exp-delete-btn" onClick={() => handleDelete(exp.id)} aria-label="Elimina" title="Elimina">🗑</button>
                          </div>
                        )}
                        <span className={`exp-chevron${isOpen ? ' exp-chevron-open' : ''}`}>›</span>
                      </div>
                    </div>

                    {/* Form modifica inline */}
                    {editingId === exp.id && (
                      <div className="exp-edit-form" onClick={e => e.stopPropagation()}>
                        <div className="exp-field">
                          <label>Descrizione</label>
                          <div className="exp-desc-row">
                            <input className="exp-desc-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="es. Cena al ristorante" autoFocus />
                            {editDesc.trim() && <span className="exp-cat-preview">{classifyExpense(editDesc).emoji}</span>}
                          </div>
                        </div>
                        <div className="exp-field-row">
                          <div className="exp-field">
                            <label>Data</label>
                            <DateInput compact value={editDate} onChange={setEditDate} />
                          </div>
                          <div className="exp-field">
                            <label>Importo</label>
                            <div className="exp-amount-row">
                              <input className="exp-amount-input" type="number" min="0.01" step="any" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0" />
                              <select className="exp-currency-select" value={editCurrency} onChange={e => setEditCurrency(e.target.value)}>
                                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="exp-field">
                          <label>Dividi con</label>
                          <div className="exp-split-grid">
                            {members.map(m => (
                              <button key={m.id} type="button"
                                className={`exp-split-btn ${editSplit.includes(m.id) ? 'exp-split-active' : ''}`}
                                onClick={() => toggleEditSplit(m.id)}>
                                <span className="exp-split-avatar">{(m.full_name || m.username)[0].toUpperCase()}</span>
                                <span>{m.full_name?.split(' ')[0] || m.username}</span>
                                {editSplit.includes(m.id) && <span className="exp-split-check">✓</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="exp-form-actions">
                          <button className="exp-cancel" onClick={closeEdit}>Annulla</button>
                          <button className="exp-save" onClick={handleUpdate}
                            disabled={isPending || !editDesc.trim() || !editAmount || editSplit.length === 0}>
                            {isPending ? '…' : '💾 Salva modifiche'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Breakdown divisione — visibile solo quando espanso */}
                    {isOpen && !editingId && (
                      <div className="exp-breakdown">
                        {exp.split_among.map(uid => {
                          const m       = members.find(p => p.id === uid)
                          const isPayer = uid === exp.paid_by
                          const isMe2   = uid === currentUserId
                          const name    = m?.full_name?.split(' ')[0] || m?.username || uid.slice(0, 8)
                          return (
                            <div key={uid} className="exp-bd-row">
                              <div className="exp-bd-avatar">
                                {(m?.full_name || m?.username || '?')[0].toUpperCase()}
                              </div>
                              <span className="exp-bd-name">
                                {name}
                                {isMe2 && <span className="exp-bd-me">tu</span>}
                              </span>
                              <span className={`exp-bd-share ${isPayer ? 'exp-bd-paid' : 'exp-bd-owes'}`}>
                                {isPayer
                                  ? `ha pagato · quota €${share.toFixed(2)}`
                                  : `deve €${share.toFixed(2)} a ${payerShortName}`
                                }
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Form aggiunta */}
          {adding ? (
            <div className="exp-add-form">
              <h3>Nuova spesa</h3>

              <div className="exp-field">
                <label>Descrizione</label>
                <div className="exp-desc-row">
                  <input
                    className="exp-desc-input"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="es. Cena al ristorante"
                    autoFocus
                  />
                  {description.trim() && (
                    <span className="exp-cat-preview" title={classifyExpense(description).label}>
                      {classifyExpense(description).emoji}
                    </span>
                  )}
                </div>
              </div>

              <div className="exp-field">
                <label>Data</label>
                <DateInput value={expenseDate} onChange={setExpenseDate} />
              </div>

              <div className="exp-field">
                <label>Importo e valuta</label>
                <div className="exp-amount-row">
                  <input
                    className="exp-amount-input"
                    type="number" min="0.01" step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0"
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  />
                  <select
                    className="exp-currency-select"
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Anteprima conversione EUR */}
                {isNonEur && amtNum > 0 && (
                  <p className="exp-eur-preview">
                    {loadingRate
                      ? '≈ € …'
                      : `≈ €${previewEur.toFixed(2)}${splitWith.length > 0 ? ` · €${previewPerPerson.toFixed(2)} a testa` : ''}`
                    }
                    <span className="exp-rate-label">tasso live</span>
                  </p>
                )}
                {!isNonEur && amtNum > 0 && splitWith.length > 0 && (
                  <p className="exp-split-hint">€{(amtNum / splitWith.length).toFixed(2)} a testa</p>
                )}
              </div>

              <div className="exp-field">
                <label>Dividi con</label>
                <div className="exp-split-grid">
                  {members.map(m => (
                    <button
                      key={m.id}
                      className={`exp-split-btn ${splitWith.includes(m.id) ? 'exp-split-active' : ''}`}
                      onClick={() => toggleSplit(m.id)}
                      type="button"
                    >
                      <span className="exp-split-avatar">{(m.full_name || m.username)[0].toUpperCase()}</span>
                      <span>{m.full_name?.split(' ')[0] || m.username}</span>
                      {splitWith.includes(m.id) && <span className="exp-split-check">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="exp-form-actions">
                <button className="exp-cancel" onClick={() => { setAdding(false); setDescription(''); setAmount(''); setCurrency('EUR'); setExpenseDate(todayISO()) }}>
                  Annulla
                </button>
                <button
                  className="exp-save"
                  onClick={handleAdd}
                  disabled={isPending || !description.trim() || !amount || splitWith.length === 0}
                >
                  {isPending ? '…' : '+ Aggiungi'}
                </button>
              </div>
            </div>
          ) : (
            <button className="exp-add-btn" onClick={() => setAdding(true)}>+ Aggiungi spesa</button>
          )}
        </>
      )}

      {/* Vista categorie */}
      {activeView === 'categories' && (
        <div className="cat-wrap">
          {categoryBreakdown.length === 0 ? (
            <div className="exp-empty">
              <div>📊</div>
              <p>Nessuna spesa ancora.<br />Aggiungi la prima per vedere il riepilogo!</p>
            </div>
          ) : (
            <>
              <div className="cat-list">
                {categoryBreakdown.map(cat => {
                  const pct = totalEur > 0 ? (cat.total / totalEur) * 100 : 0
                  return (
                    <div key={cat.label} className="cat-row">
                      <div className="cat-icon">{cat.emoji}</div>
                      <div className="cat-info">
                        <div className="cat-header">
                          <span className="cat-label">{cat.label}</span>
                          <span className="cat-count">{cat.count} {cat.count === 1 ? 'spesa' : 'spese'}</span>
                        </div>
                        <div className="cat-bar-track">
                          <div className="cat-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="cat-amounts">
                        <span className="cat-eur">€{cat.total.toFixed(2)}</span>
                        <span className="cat-pct">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="cat-footer">Totale viaggio: <strong>€{totalEur.toFixed(2)}</strong> · {expenses.length} {expenses.length === 1 ? 'spesa' : 'spese'}</p>
            </>
          )}
        </div>
      )}

      {/* Vista saldi — sempre in EUR */}
      {activeView === 'balances' && (
        <div className="balances-wrap">
          {balances.length === 0 ? (
            <p className="exp-empty-text">Nessun membro nel viaggio.</p>
          ) : (
            <>
              <div className="balances-list">
                {balances
                  .slice()
                  .sort((a, b) => b.net - a.net)
                  .map(b => {
                    const isOpen   = expandedBalanceId === b.userId
                    const maxAbs   = Math.max(...balances.map(x => Math.abs(x.net))) || 1
                    const userTxs  = settlementTxs.filter(t => t.from === b.userId || t.to === b.userId)
                    const isCredit = b.net > 0.005
                    const isDebt   = b.net < -0.005

                    return (
                      <div
                        key={b.userId}
                        className={`balance-row${isOpen ? ' balance-row-open' : ''}`}
                        onClick={() => setExpandedBalanceId(isOpen ? null : b.userId)}
                      >
                        {/* Riga principale */}
                        <div className="balance-row-main">
                          <div className="balance-avatar">
                            {(b.profile.full_name || b.profile.username)[0].toUpperCase()}
                          </div>
                          <div className="balance-info">
                            <span className="balance-name">
                              {b.userId === currentUserId ? 'Tu' : (b.profile.full_name?.split(' ')[0] || b.profile.username)}
                            </span>
                            <div className="balance-bar-wrap">
                              <div className="balance-bar-track">
                                <div
                                  className={`balance-bar-fill ${b.net >= 0 ? 'fill-credit' : 'fill-debt'}`}
                                  style={{ width: `${Math.min(Math.abs(b.net) / maxAbs * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <span className={`balance-amount ${isCredit ? 'exp-credit' : isDebt ? 'exp-debt' : 'exp-zero'}`}>
                            {b.net > 0 ? '+' : ''}€{b.net.toFixed(2)}
                          </span>
                          <span className={`exp-chevron${isOpen ? ' exp-chevron-open' : ''}`}>›</span>
                        </div>

                        {/* Dettaglio transazioni semplificate */}
                        {isOpen && (
                          <div className="balance-detail">
                            {userTxs.length === 0 ? (
                              <p className="balance-settled">✓ Saldo in pareggio</p>
                            ) : (
                              userTxs.map((tx, i) => {
                                const isSender  = tx.from === b.userId
                                const otherId   = isSender ? tx.to : tx.from
                                const other     = balances.find(x => x.userId === otherId)
                                const otherName = other?.userId === currentUserId
                                  ? 'Te'
                                  : (other?.profile.full_name?.split(' ')[0] || other?.profile.username || '?')
                                return (
                                  <div key={i} className="balance-tx">
                                    <span className={`balance-tx-verb ${isSender ? 'exp-debt' : 'exp-credit'}`}>
                                      {isSender ? '↗ Paga' : '↙ Ricevi'}
                                    </span>
                                    <span className="balance-tx-amount">€{tx.amount.toFixed(2)}</span>
                                    <span className="balance-tx-who">
                                      {isSender ? 'a' : 'da'}{' '}
                                      <strong>{otherName}</strong>
                                    </span>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
              <p className="balances-hint">
                + = credito · − = debito · tocca una riga per vedere i pagamenti · tutti i valori in €
              </p>
            </>
          )}
        </div>
      )}

      <style jsx>{`
        .exp-wrap { display: flex; flex-direction: column; gap: 0.75rem; }

        .exp-summary { background: #fff; border-radius: 16px; border: 1px solid #e8e8e4; padding: 1rem 1.25rem; display: flex; align-items: center; gap: 12px; }
        .exp-stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
        .exp-stat-val { font-size: 1.125rem; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; }
        .exp-stat-label { font-size: 0.7rem; color: #9a9a94; margin-top: 2px; }
        .exp-stat-divider { width: 1px; height: 32px; background: #e8e8e4; flex-shrink: 0; }
        .exp-credit { color: #1D9E75 !important; }
        .exp-debt   { color: #b91c1c !important; }
        .exp-zero   { color: #9a9a94 !important; }

        .exp-tabs { display: flex; background: #fff; border-radius: 12px; border: 1px solid #e8e8e4; overflow: hidden; }
        .exp-tab { flex: 1; padding: 0.625rem; font-size: 0.8125rem; font-weight: 500; color: #9a9a94; background: none; border: none; cursor: pointer; transition: all 0.15s; }
        .exp-tab-active { background: #1D9E75; color: #fff; }

        .exp-empty { text-align: center; padding: 2rem 1rem; background: #fff; border-radius: 16px; border: 1px dashed #d0d0cb; font-size: 1.5rem; }
        .exp-empty p { font-size: 0.875rem; color: #6b6b6b; margin: 0.5rem 0 0; line-height: 1.5; }

        .exp-list { background: #fff; border-radius: 16px; border: 1px solid #e8e8e4; overflow: hidden; }

        /* Card spesa — cliccabile */
        .exp-item         { border-bottom: 1px solid #f0f0ec; cursor: pointer; transition: background 0.15s; }
        .exp-item:last-child { border-bottom: none; }
        .exp-item:hover   { background: #fafaf8; }
        .exp-item-open    { background: #f8f7f4; }
        .exp-item-main    { display: flex; align-items: center; justify-content: space-between; padding: 0.875rem 1rem; gap: 8px; }
        .exp-item-left    { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }

        /* Chevron */
        .exp-chevron      { font-size: 1.1rem; color: #b0b0aa; transition: transform 0.2s; display: inline-block; flex-shrink: 0; }
        .exp-chevron-open { transform: rotate(90deg); color: #1D9E75; }

        /* Breakdown divisione */
        .exp-breakdown    { padding: 0 1rem 0.875rem; display: flex; flex-direction: column; gap: 6px; }
        .exp-bd-row       { display: flex; align-items: center; gap: 8px; }
        .exp-bd-avatar    { width: 26px; height: 26px; border-radius: 50%; background: #e0f4ee; color: #1D9E75; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .exp-bd-name      { font-size: 0.825rem; font-weight: 500; color: #1a1a1a; display: flex; align-items: center; gap: 5px; min-width: 70px; flex-shrink: 0; }
        .exp-bd-me        { background: #1D9E75; color: #fff; font-size: 0.6rem; padding: 1px 5px; border-radius: 99px; font-weight: 700; }
        .exp-bd-share     { font-size: 0.8rem; flex: 1; }
        .exp-bd-paid      { color: #0F6E56; font-weight: 500; }
        .exp-bd-owes      { color: #6b6b6b; }
        .exp-payer-avatar { width: 34px; height: 34px; border-radius: 50%; background: #1D9E75; display: flex; align-items: center; justify-content: center; font-size: 0.8125rem; font-weight: 600; color: #fff; flex-shrink: 0; }
        .exp-item-info    { display: flex; flex-direction: column; min-width: 0; }
        .exp-item-header  { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .exp-item-desc    { font-size: 0.9rem; font-weight: 500; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
        .exp-cat-badge    { font-size: 1rem; flex-shrink: 0; }
        .exp-item-meta    { font-size: 0.75rem; color: #9a9a94; }
        .exp-desc-row     { display: flex; align-items: center; gap: 8px; }
        .exp-desc-input   { flex: 1; padding: 0.65rem 0.875rem; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.9rem; color: #1a1a1a; background: #fafaf8; font-family: inherit; transition: border-color 0.15s; }
        .exp-desc-input:focus { outline: none; border-color: #1D9E75; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); }
        .exp-cat-preview  { font-size: 1.4rem; flex-shrink: 0; }
        .exp-item-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .exp-item-amounts { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
        .exp-item-amount { font-size: 0.9375rem; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; }
        .exp-item-amount-orig { font-size: 0.9375rem; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; }
        .exp-item-amount-eur { font-size: 0.75rem; color: #9a9a94; font-variant-numeric: tabular-nums; }
        /* Azioni edit/delete — appaiono all'hover */
        .exp-actions    { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
        .exp-item:hover .exp-actions { opacity: 1; }
        .exp-action-btn { background: none; border: none; cursor: pointer; font-size: 0.8rem; padding: 4px 5px; border-radius: var(--md-radius-s, 8px); transition: background 0.1s; }
        .exp-action-btn:hover { background: var(--md-surface-container, #EEECF8); }
        .exp-delete-btn:hover { background: var(--md-error-container, #FEE2E2) !important; }
        .exp-item-editing { background: var(--md-surface-container-low, #F4F4F5) !important; cursor: default; }

        /* Form modifica inline */
        .exp-edit-form { padding: 0 1rem 1rem; display: flex; flex-direction: column; gap: 0.875rem; }
        .exp-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

        .exp-add-btn { width: 100%; padding: 0.75rem; background: none; border: 1.5px dashed #d0d0cb; border-radius: 16px; font-size: 0.875rem; font-weight: 500; color: #9a9a94; cursor: pointer; transition: all 0.15s; }
        .exp-add-btn:hover { border-color: #1D9E75; color: #1D9E75; background: #f8fffc; }

        .exp-add-form { background: #fff; border-radius: 16px; border: 1px solid #1D9E75; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 0 0 3px rgba(29,158,117,0.08); }
        .exp-add-form h3 { font-size: 0.9375rem; font-weight: 600; color: #1a1a1a; margin: 0; }
        .exp-field { display: flex; flex-direction: column; gap: 0.375rem; }
        .exp-field label { font-size: 0.8125rem; font-weight: 500; color: #3a3a3a; }
        .exp-field input { padding: 0.65rem 0.875rem; border: 1px solid #e0e0db; border-radius: 10px; font-size: 1rem; color: #1a1a1a; background: #fafaf8; transition: border-color 0.15s; box-sizing: border-box; }
        .exp-field input:focus { outline: none; border-color: #1D9E75; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); }

        .exp-amount-row { display: flex; gap: 8px; }
        .exp-amount-input { flex: 1; padding: 0.65rem 0.875rem; border: 1px solid #e0e0db; border-radius: 10px; font-size: 1rem; color: #1a1a1a; background: #fafaf8; transition: border-color 0.15s; min-width: 0; }
        .exp-amount-input:focus { outline: none; border-color: #1D9E75; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); }
        .exp-currency-select { padding: 0.65rem 0.5rem; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.9rem; font-weight: 600; color: #1a1a1a; background: #fafaf8; cursor: pointer; flex-shrink: 0; width: 100px; }
        .exp-currency-select:focus { outline: none; border-color: #1D9E75; }

        .exp-eur-preview { font-size: 0.8125rem; color: #1D9E75; font-weight: 500; margin: 2px 0 0; display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
        .exp-rate-label { font-size: 0.7rem; color: #9a9a94; font-weight: 400; background: #f0f0ec; padding: 1px 6px; border-radius: 99px; }
        .exp-split-hint { font-size: 0.8rem; color: #1D9E75; font-weight: 500; margin: 2px 0 0; font-variant-numeric: tabular-nums; }

        .exp-split-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .exp-split-btn { display: flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 99px; border: 1px solid #e0e0db; background: #f8f7f4; font-size: 0.8rem; color: #3a3a3a; cursor: pointer; transition: all 0.15s; }
        .exp-split-active { background: #E1F5EE; border-color: #1D9E75; color: #0F6E56; }
        .exp-split-avatar { width: 18px; height: 18px; border-radius: 50%; background: #9FE1CB; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700; color: #0F6E56; }
        .exp-split-check { font-size: 0.7rem; font-weight: 700; }

        .exp-form-actions { display: flex; gap: 0.75rem; }
        .exp-cancel { flex: 1; padding: 0.7rem; background: #f8f7f4; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.875rem; font-weight: 500; color: #3a3a3a; cursor: pointer; }
        .exp-save { flex: 1; padding: 0.7rem; background: #1D9E75; border: none; border-radius: 10px; font-size: 0.875rem; font-weight: 600; color: #fff; cursor: pointer; }
        .exp-save:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Dashboard categorie ── */
        .cat-wrap    { display: flex; flex-direction: column; gap: 0.75rem; }
        .cat-list    { background: #fff; border-radius: 16px; border: 1px solid #e8e8e4; overflow: hidden; }
        .cat-row     { display: flex; align-items: center; gap: 12px; padding: 0.875rem 1rem; border-bottom: 1px solid #f0f0ec; }
        .cat-row:last-child { border-bottom: none; }
        .cat-icon    { font-size: 1.5rem; width: 36px; text-align: center; flex-shrink: 0; }
        .cat-info    { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .cat-header  { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .cat-label   { font-size: 0.9rem; font-weight: 600; color: #1a1a1a; }
        .cat-count   { font-size: 0.7rem; color: #9a9a94; flex-shrink: 0; }
        .cat-bar-track { height: 6px; background: #f0f0ec; border-radius: 99px; overflow: hidden; }
        .cat-bar-fill  { height: 100%; background: #1D9E75; border-radius: 99px; transition: width 0.4s ease; min-width: 4px; }
        .cat-amounts { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; min-width: 64px; }
        .cat-eur     { font-size: 0.9rem; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; }
        .cat-pct     { font-size: 0.7rem; color: #9a9a94; }
        .cat-footer  { font-size: 0.78rem; color: #9a9a94; text-align: center; }

        .balances-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
        .balances-list { background: #fff; border-radius: 16px; border: 1px solid #e8e8e4; overflow: hidden; }

        /* Riga saldo — cliccabile */
        .balance-row          { border-bottom: 1px solid #f0f0ec; cursor: pointer; transition: background 0.15s; }
        .balance-row:last-child { border-bottom: none; }
        .balance-row:hover    { background: #fafaf8; }
        .balance-row-open     { background: #f8f7f4; }
        .balance-row-main     { display: flex; align-items: center; gap: 10px; padding: 0.875rem 1rem; }
        .balance-avatar { width: 32px; height: 32px; border-radius: 50%; background: #1D9E75; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; color: #fff; flex-shrink: 0; }
        .balance-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

        /* Dettaglio transazioni semplificate */
        .balance-detail   { padding: 0 1rem 0.875rem; display: flex; flex-direction: column; gap: 8px; }
        .balance-settled  { font-size: 0.825rem; color: #1D9E75; font-weight: 500; margin: 0; }
        .balance-tx       { display: flex; align-items: center; gap: 8px; background: #f8f7f4; border-radius: 10px; padding: 8px 12px; }
        .balance-tx-verb  { font-size: 0.8rem; font-weight: 700; min-width: 70px; flex-shrink: 0; }
        .balance-tx-amount { font-size: 0.9rem; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; min-width: 54px; flex-shrink: 0; }
        .balance-tx-who   { font-size: 0.825rem; color: #4a4a4a; }
        .balance-name { font-size: 0.875rem; font-weight: 500; color: #1a1a1a; }
        .balance-bar-track { height: 4px; background: #f0f0ec; border-radius: 99px; overflow: hidden; width: 100%; }
        .balance-bar-fill { height: 100%; border-radius: 99px; transition: width 0.4s; }
        .fill-credit { background: #1D9E75; }
        .fill-debt   { background: #E24B4A; }
        .balance-amount { font-size: 0.9375rem; font-weight: 700; flex-shrink: 0; font-variant-numeric: tabular-nums; min-width: 72px; text-align: right; }
        .balances-hint { font-size: 0.75rem; color: #9a9a94; text-align: center; }

        .exp-empty-text { font-size: 0.875rem; color: #9a9a94; text-align: center; padding: 1rem; }
      `}</style>
    </div>
  )
}
