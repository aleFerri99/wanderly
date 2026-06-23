// ============================================================
// src/components/trip/ExpensesTab.tsx
// Bacheca spese condivise — multi-valuta con conversione automatica in EUR
// ============================================================
'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addExpense, deleteExpense } from '@/app/trip/[id]/expenses/actions'
import type { Expense, Profile } from '@/types/database'

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
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [splitWith, setSplitWith] = useState<string[]>(members.map(m => m.id))
  const [isPending, startTransition] = useTransition()
  const [activeView, setActiveView] = useState<'list' | 'balances'>('list')

  // Tasso EUR per l'anteprima live nel form (lato client)
  const [eurPreviewRate, setEurPreviewRate] = useState<number>(1)
  const [loadingRate, setLoadingRate] = useState(false)

  const supabase = createClient()

  // Carica e iscrive alle spese in realtime
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('expenses')
        .select(`*, payer:profiles!paid_by(*)`)
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
      if (data) setExpenses(data as (Expense & { payer: Profile })[])
    }
    load()

    const channel = supabase.channel(`expenses:${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` }, load)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tripId, supabase])

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
      await addExpense(tripId, description.trim(), amt, currency, splitWith)
      setDescription('')
      setAmount('')
      setCurrency('EUR')
      setSplitWith(members.map(m => m.id))
      setAdding(false)
    })
  }

  function handleDelete(expenseId: string) {
    if (!confirm('Eliminare questa spesa?')) return
    startTransition(async () => { await deleteExpense(tripId, expenseId) })
  }

  function toggleSplit(uid: string) {
    setSplitWith(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    )
  }

  // Totale sempre in EUR
  const totalEur = expenses.reduce((s, e) => s + (e.amount_eur ?? e.amount), 0)
  const balances = computeBalances()
  const myBalance = balances.find(b => b.userId === currentUserId)

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

      {/* Tab lista/saldi */}
      <div className="exp-tabs">
        <button className={`exp-tab ${activeView === 'list' ? 'exp-tab-active' : ''}`} onClick={() => setActiveView('list')}>
          Lista spese
        </button>
        <button className={`exp-tab ${activeView === 'balances' ? 'exp-tab-active' : ''}`} onClick={() => setActiveView('balances')}>
          Saldi finali
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
                return (
                  <div key={exp.id} className="exp-item">
                    <div className="exp-item-left">
                      <div className="exp-payer-avatar">
                        {(exp.payer?.full_name || exp.payer?.username || '?')[0].toUpperCase()}
                      </div>
                      <div className="exp-item-info">
                        <span className="exp-item-desc">{exp.description}</span>
                        <span className="exp-item-meta">
                          {isMe ? 'Tu' : (exp.payer?.full_name?.split(' ')[0] || exp.payer?.username)}
                          {' · '}diviso in {exp.split_among.length}
                          {' · '}€{perPerson}/p
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
                        <button className="exp-delete-btn" onClick={() => handleDelete(exp.id)} aria-label="Elimina">🗑</button>
                      )}
                    </div>
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
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="es. Cena al ristorante"
                  autoFocus
                />
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
                <button className="exp-cancel" onClick={() => { setAdding(false); setDescription(''); setAmount(''); setCurrency('EUR') }}>
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
                  .map(b => (
                    <div key={b.userId} className="balance-row">
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
                              style={{ width: `${Math.min(Math.abs(b.net) / (Math.max(...balances.map(x => Math.abs(x.net))) || 1) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <span className={`balance-amount ${b.net > 0 ? 'exp-credit' : b.net < 0 ? 'exp-debt' : 'exp-zero'}`}>
                        {b.net > 0 ? '+' : ''}€{b.net.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
              <p className="balances-hint">+ = ti devono · − = devi pagare · tutti i valori in €</p>
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
        .exp-item { display: flex; align-items: center; justify-content: space-between; padding: 0.875rem 1rem; border-bottom: 1px solid #f0f0ec; gap: 8px; }
        .exp-item:last-child { border-bottom: none; }
        .exp-item-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .exp-payer-avatar { width: 34px; height: 34px; border-radius: 50%; background: #1D9E75; display: flex; align-items: center; justify-content: center; font-size: 0.8125rem; font-weight: 600; color: #fff; flex-shrink: 0; }
        .exp-item-info { display: flex; flex-direction: column; min-width: 0; }
        .exp-item-desc { font-size: 0.9rem; font-weight: 500; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .exp-item-meta { font-size: 0.75rem; color: #9a9a94; }
        .exp-item-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .exp-item-amounts { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
        .exp-item-amount { font-size: 0.9375rem; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; }
        .exp-item-amount-orig { font-size: 0.9375rem; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; }
        .exp-item-amount-eur { font-size: 0.75rem; color: #9a9a94; font-variant-numeric: tabular-nums; }
        .exp-delete-btn { background: none; border: none; cursor: pointer; font-size: 0.875rem; padding: 4px; border-radius: 4px; opacity: 0; transition: opacity 0.15s; }
        .exp-item:hover .exp-delete-btn { opacity: 1; }

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

        .balances-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
        .balances-list { background: #fff; border-radius: 16px; border: 1px solid #e8e8e4; overflow: hidden; }
        .balance-row { display: flex; align-items: center; gap: 10px; padding: 0.875rem 1rem; border-bottom: 1px solid #f0f0ec; }
        .balance-row:last-child { border-bottom: none; }
        .balance-avatar { width: 32px; height: 32px; border-radius: 50%; background: #1D9E75; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; color: #fff; flex-shrink: 0; }
        .balance-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
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
