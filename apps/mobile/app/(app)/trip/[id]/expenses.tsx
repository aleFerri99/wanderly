import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, FlatList, ScrollView, StyleSheet, Alert } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { confirmAction } from '@/lib/confirm'
import {
  getExpenses, getTripMembers, addExpense, updateExpense, deleteExpense, computeBalances,
  classifyExpense, simplifyDebts, CURRENCIES, fetchEurRate, formatCurrency, type MemberSnap,
} from '@repo/shared/supabase/queries/expenses'
import {
  Txt, Card, Skeleton, Sheet, Input, Button, FAB, Segmented, DateField, PressableScale, Appear,
} from '@/components/ui'
import { colors, gradients, radius, space, shadow } from '@/lib/tokens'
import type { Expense } from '@repo/shared/types/database'

const todayISO = () => new Date().toISOString().split('T')[0]
const eur = (n: number) => `${n.toFixed(2)} €`
const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

interface Draft { id: string | null; desc: string; amount: string; currency: string; date: string; split: string[] }

export default function ExpensesTab() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [members,  setMembers]  = useState<MemberSnap[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading,  setLoading]  = useState(true)
  const [view,     setView]     = useState<'list' | 'balances' | 'categories'>('list')
  const [draft,    setDraft]    = useState<Draft | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [rate,     setRate]     = useState(1)
  const [openId,   setOpenId]   = useState<string | null>(null)  // movimento espanso

  const nameOf = useCallback((uid: string) => {
    const m = members.find(x => x.id === uid)
    return m ? (m.full_name || m.username) : uid.slice(0, 6)
  }, [members])

  const load = useCallback(async () => {
    const [mem, exp] = await Promise.all([getTripMembers(supabase, id), getExpenses(supabase, id)])
    setMembers(mem); setExpenses(exp); setLoading(false)
  }, [id])

  useFocusEffect(useCallback(() => {
    load()
    const ch = supabase.channel(`expenses:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, load]))

  useEffect(() => {
    if (!draft) return
    if (draft.currency === 'EUR') { setRate(1); return }
    fetchEurRate(draft.currency).then(setRate)
  }, [draft?.currency])

  const total    = useMemo(() => expenses.reduce((s, e) => s + (e.amount_eur ?? e.amount), 0), [expenses])
  const balances = useMemo(() => computeBalances(expenses, members.map(m => m.id)), [expenses, members])
  const settle   = useMemo(() => simplifyDebts(balances), [balances])
  const categories = useMemo(() => {
    const map = new Map<string, { emoji: string; label: string; total: number; count: number }>()
    for (const e of expenses) {
      const c = classifyExpense(e.description); const amt = e.amount_eur ?? e.amount
      const cur = map.get(c.label)
      if (cur) { cur.total += amt; cur.count++ } else map.set(c.label, { emoji: c.emoji, label: c.label, total: amt, count: 1 })
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [expenses])

  function openAdd() { setDraft({ id: null, desc: '', amount: '', currency: 'EUR', date: todayISO(), split: members.map(m => m.id) }); setRate(1) }
  function openEdit(e: Expense) { setDraft({ id: e.id, desc: e.description, amount: String(e.amount), currency: e.currency || 'EUR', date: e.expense_date, split: e.split_among }) }
  function toggleSplit(uid: string) { setDraft(d => d && { ...d, split: d.split.includes(uid) ? d.split.filter(x => x !== uid) : [...d.split, uid] }) }

  async function confirmSave() {
    if (!draft) return
    const amt = parseFloat(draft.amount.replace(',', '.'))
    if (!draft.desc.trim() || isNaN(amt) || amt <= 0 || draft.split.length === 0) return
    setSaving(true)
    const amountEur = draft.currency === 'EUR' ? amt : Math.round(amt * rate * 100) / 100
    if (draft.id) await updateExpense(supabase, draft.id, { description: draft.desc, amount: amt, currency: draft.currency, amountEur, splitAmong: draft.split, expenseDate: draft.date })
    else await addExpense(supabase, { tripId: id, description: draft.desc, amount: amt, currency: draft.currency, amountEur, splitAmong: draft.split, expenseDate: draft.date })
    setSaving(false); setDraft(null); load()
  }
  function onDelete(exp: Expense) {
    confirmAction('Eliminare il movimento?', exp.description, async () => {
      setExpenses(prev => prev.filter(e => e.id !== exp.id))
      await deleteExpense(supabase, exp.id)
    }, { confirmLabel: 'Elimina', destructive: true })
  }

  const amtNum  = parseFloat((draft?.amount ?? '').replace(',', '.'))
  const eurPrev = draft && draft.currency !== 'EUR' && !isNaN(amtNum) ? Math.round(amtNum * rate * 100) / 100 : null

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md }}><Skeleton height={96} radius={radius.xl} /><Skeleton height={48} radius={radius.pill} /><Skeleton height={70} radius={radius.lg} /></View>
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, paddingBottom: space.sm }}>
        <View style={[{ borderRadius: radius.xl }, shadow.card]}>
          <LinearGradient colors={gradients.ocean} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.totalCard}>
            <View>
              <Txt variant="label" color="rgba(255,255,255,0.9)">Totale speso (EUR)</Txt>
              <Txt variant="display" color={colors.white}>{eur(total)}</Txt>
            </View>
          </LinearGradient>
        </View>
        <View style={{ marginTop: space.md }}>
          <Segmented value={view} onChange={setView} options={[
            { value: 'list', label: 'Movimenti', icon: 'format-list-bulleted' },
            { value: 'balances', label: 'Saldi', icon: 'scale-balance' },
            { value: 'categories', label: 'Categorie', icon: 'shape' },
          ]} />
        </View>
      </View>

      {view === 'list' && (
        <FlatList
          data={expenses}
          keyExtractor={e => e.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + 100 }}
          ListEmptyComponent={<View style={styles.empty}><Txt style={{ fontSize: 44 }}>💸</Txt><Txt variant="body" color={colors.textSoft} style={{ marginTop: space.sm }}>Nessun movimento ancora.</Txt></View>}
          renderItem={({ item, index }) => {
            const cat = classifyExpense(item.description)
            const isNonEur = item.currency && item.currency !== 'EUR'
            const isOpen = openId === item.id
            const amt = item.amount_eur ?? item.amount
            const share = item.split_among.length ? amt / item.split_among.length : 0
            return (
              <Appear index={index}>
                <Card padded={false} elevation="soft" style={styles.expCard}>
                  <PressableScale haptic="light" onPress={() => setOpenId(o => o === item.id ? null : item.id)}>
                    <View style={styles.expRow}>
                      <View style={styles.emoji}><Txt style={{ fontSize: 22 }}>{cat.emoji}</Txt></View>
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyStrong">{item.description}</Txt>
                        <Txt variant="caption" color={colors.textSoft}>{nameOf(item.paid_by)} · {fmtD(item.expense_date)} · diviso tra {item.split_among.length}</Txt>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Txt variant="bodyStrong" style={{ fontSize: 16 }}>{eur(amt)}</Txt>
                        {isNonEur && <Txt variant="caption" color={colors.textFaint}>{formatCurrency(Number(item.amount), item.currency)}</Txt>}
                      </View>
                      <MaterialCommunityIcons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textFaint} style={{ marginLeft: 2 }} />
                    </View>
                  </PressableScale>

                  {isOpen && (
                    <View style={styles.expDetail}>
                      <Txt variant="label" color={colors.textSoft} style={{ marginBottom: 6 }}>Diviso tra · {eur(share)} a testa</Txt>
                      <View style={{ gap: 4 }}>
                        {item.split_among.map(uid => (
                          <View key={uid} style={styles.splitLine}>
                            <Txt variant="body">{nameOf(uid)}{uid === item.paid_by ? ' · ha pagato' : ''}</Txt>
                            <Txt variant="bodyStrong" color={colors.textSoft}>{eur(share)}</Txt>
                          </View>
                        ))}
                      </View>
                      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                        <Button title="Modifica" variant="secondary" size="sm" icon="pencil" onPress={() => openEdit(item)} style={{ flex: 1 }} />
                        <Button title="Elimina" variant="danger" size="sm" icon="trash-can-outline" onPress={() => onDelete(item)} style={{ flex: 1 }} />
                      </View>
                    </View>
                  )}
                </Card>
              </Appear>
            )
          }}
        />
      )}

      {view === 'balances' && (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + 100 }}>
          <Card elevation="soft" style={{ marginBottom: space.md }}>
            <Txt variant="heading" style={{ marginBottom: space.sm }}>Saldi</Txt>
            {balances.map(b => {
              const credit = b.net > 0.005, debit = b.net < -0.005
              return (
                <View key={b.userId} style={styles.balRow}>
                  <Txt variant="body">{nameOf(b.userId)}</Txt>
                  <Txt variant="bodyStrong" color={credit ? colors.success : debit ? colors.danger : colors.textFaint}>
                    {credit ? `+${eur(b.net)} a credito` : debit ? `-${eur(Math.abs(b.net))} in debito` : 'in pari'}
                  </Txt>
                </View>
              )
            })}
          </Card>
          <Card elevation="soft">
            <Txt variant="heading" style={{ marginBottom: space.sm }}>💸 Come pareggiare</Txt>
            {settle.length === 0 && <Txt variant="body" color={colors.textSoft}>Tutti in pari! 🎉</Txt>}
            {settle.map((t, i) => (
              <View key={i} style={styles.settleRow}>
                <Txt variant="body" style={{ flex: 1 }}><Txt variant="bodyStrong">{nameOf(t.from)}</Txt> → <Txt variant="bodyStrong">{nameOf(t.to)}</Txt></Txt>
                <Txt variant="bodyStrong" color={colors.primary}>{eur(t.amount)}</Txt>
              </View>
            ))}
          </Card>
        </ScrollView>
      )}

      {view === 'categories' && (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + 100 }}>
          <Card elevation="soft">
            {categories.length === 0 && <Txt variant="body" color={colors.textSoft}>Nessuna spesa.</Txt>}
            {categories.map((c) => {
              const pct = total > 0 ? (c.total / total) * 100 : 0
              return (
                <View key={c.label} style={styles.catRow}>
                  <Txt style={{ fontSize: 20, marginRight: space.sm }}>{c.emoji}</Txt>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{c.label} <Txt variant="caption" color={colors.textFaint}>· {c.count}</Txt></Txt>
                    <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: space.sm }}>
                    <Txt variant="bodyStrong">{eur(c.total)}</Txt>
                    <Txt variant="caption" color={colors.textFaint}>{pct.toFixed(0)}%</Txt>
                  </View>
                </View>
              )
            })}
          </Card>
        </ScrollView>
      )}

      <FAB icon="plus" label="Movimento" gradient="ocean" onPress={openAdd} style={{ right: space.lg, bottom: insets.bottom + 92 }} />

      <Sheet visible={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? 'Modifica spesa' : 'Nuova spesa'}>
        <View style={{ gap: space.md }}>
          <Input label="Descrizione" icon="text" value={draft?.desc ?? ''} onChangeText={t => setDraft(d => d && { ...d, desc: t })} placeholder="Cena al ristorante" />
          <Input label="Importo" icon="cash" value={draft?.amount ?? ''} keyboardType="decimal-pad" onChangeText={t => setDraft(d => d && { ...d, amount: t })} placeholder="42.50" />
          <DateField label="Data" icon="calendar-blank-outline" value={draft?.date ?? ''} onChange={v => setDraft(d => d && { ...d, date: v })} />
          {/* Valuta */}
          <View>
            <Txt variant="label" color={colors.textSoft} style={{ marginBottom: 6, marginLeft: 4 }}>Valuta</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
              {CURRENCIES.map(c => {
                const on = (draft?.currency ?? 'EUR') === c.code
                return (
                  <PressableScale key={c.code} haptic="light" onPress={() => setDraft(d => d && { ...d, currency: c.code })}>
                    <View style={[styles.curPill, { backgroundColor: on ? colors.primary : colors.card }]}>
                      <Txt variant="label" color={on ? colors.white : colors.textSoft}>{c.code} {c.symbol}</Txt>
                    </View>
                  </PressableScale>
                )
              })}
            </ScrollView>
            {eurPrev !== null && <Txt variant="caption" color={colors.textFaint} style={{ marginTop: 4 }}>≈ {eur(eurPrev)} (cambio automatico)</Txt>}
          </View>
          {/* Split */}
          <View>
            <Txt variant="label" color={colors.textSoft} style={{ marginBottom: 6, marginLeft: 4 }}>Dividi tra</Txt>
            <View style={{ gap: 6 }}>
              {members.map(m => {
                const on = draft?.split.includes(m.id) ?? false
                return (
                  <PressableScale key={m.id} haptic="light" onPress={() => toggleSplit(m.id)}>
                    <View style={[styles.splitRow, { backgroundColor: on ? colors.primarySoft : colors.bg }]}>
                      <MaterialCommunityIcons name={on ? 'check-circle' : 'circle-outline'} size={22} color={on ? colors.primary : colors.textFaint} />
                      <Txt variant="body" color={on ? colors.onPrimarySoft : colors.textSoft}>{m.full_name || m.username}</Txt>
                    </View>
                  </PressableScale>
                )
              })}
            </View>
          </View>
          <Button title={draft?.id ? 'Salva' : 'Aggiungi'} gradient="ocean" icon={draft?.id ? 'content-save' : 'plus'} loading={saving} disabled={!draft?.desc.trim() || !draft?.amount || (draft?.split.length ?? 0) === 0} onPress={confirmSave} full style={{ marginTop: space.sm }} />
        </View>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  totalCard: { borderRadius: radius.xl, padding: space.lg },
  empty:     { alignItems: 'center', paddingTop: 50 },
  expCard:   { padding: space.md, marginBottom: space.sm },
  expRow:    { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  expDetail: { marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  splitLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emoji:     { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  balRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  settleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  catRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  track:     { height: 6, borderRadius: 3, backgroundColor: colors.line, marginTop: 5, overflow: 'hidden' },
  fill:      { height: '100%', borderRadius: 3, backgroundColor: colors.secondary },
  curPill:   { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, ...shadow.soft },
  splitRow:  { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.lg },
})
