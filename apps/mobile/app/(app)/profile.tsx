import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, ScrollView, StyleSheet, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { confirmAction } from '@/lib/confirm'
import {
  getProfile, updateProfile, getVisitedCountries, addVisitedCountry, removeVisitedCountry,
} from '@repo/shared/supabase/queries/profile'
import { COUNTRIES, COUNTRIES_BY_CODE, TOTAL_COUNTRIES } from '@repo/shared/countries'
import { LANGUAGES, TRAVEL_INTERESTS, GENDERS } from '@repo/shared/constants'
import {
  Header, Txt, Card, Button, Chip, IconButton, Input, Sheet, Skeleton, PressableScale, Avatar,
} from '@/components/ui'
import { colors, radius, space } from '@/lib/tokens'

export default function ProfileScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const userId = session?.user?.id
  const email  = session?.user?.email ?? ''

  const [loading,  setLoading]  = useState(true)
  const [fullName, setFullName] = useState('')
  const [nat,      setNat]      = useState('')
  const [birth,    setBirth]    = useState('')
  const [gender,   setGender]   = useState<string | null>(null)
  const [langs,    setLangs]    = useState<string[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [notes,    setNotes]    = useState('')
  const [savedMsg, setSavedMsg] = useState(false)
  const [visited,  setVisited]  = useState<string[]>([])
  const [pickOpen, setPickOpen] = useState(false)
  const [search,   setSearch]   = useState('')
  const [pwdOpen,  setPwdOpen]  = useState(false)
  const [newPwd,   setNewPwd]   = useState('')
  const [pwdBusy,  setPwdBusy]  = useState(false)
  const [pwdMsg,   setPwdMsg]   = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    const [prof, codes] = await Promise.all([getProfile(supabase, userId), getVisitedCountries(supabase, userId)])
    setFullName(prof?.full_name ?? ''); setNat(prof?.nationality ?? '')
    setBirth(prof?.birth_date ?? ''); setGender(prof?.gender ?? null)
    setLangs(prof?.languages ?? []); setInterests(prof?.travel_interests ?? []); setNotes(prof?.trip_notes ?? '')
    setVisited(codes); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  function toggleArr(arr: string[], v: string, set: (a: string[]) => void) {
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  }

  async function save() {
    if (!userId) return
    await updateProfile(supabase, userId, {
      full_name: fullName.trim() || null, nationality: nat.trim() || null,
      birth_date: birth.trim() || null, gender, languages: langs, travel_interests: interests,
      trip_notes: notes.trim() || null,
    })
    setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2000)
  }
  async function addCountry(code: string) {
    if (!userId) return
    setVisited(prev => [...prev, code]); setPickOpen(false); setSearch('')
    await addVisitedCountry(supabase, userId, code)
  }
  function removeCountry(code: string) {
    const c = COUNTRIES_BY_CODE.get(code)
    confirmAction('Rimuovere?', `${c?.flag ?? ''} ${c?.name ?? code}`, async () => {
      setVisited(prev => prev.filter(x => x !== code)); if (userId) await removeVisitedCountry(supabase, userId, code)
    }, { confirmLabel: 'Rimuovi', destructive: true })
  }
  async function changePassword() {
    if (newPwd.length < 6) { setPwdMsg('Almeno 6 caratteri.'); return }
    setPwdBusy(true); setPwdMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setPwdBusy(false)
    if (error) { setPwdMsg(`❌ ${error.message}`); return }
    setNewPwd(''); setPwdOpen(false)
  }
  function deleteAccount() {
    confirmAction('Eliminare l\'account?', 'Azione irreversibile: verranno rimossi tutti i tuoi dati.', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('delete_own_account')
      if (error) { Alert.alert('Errore', error.message); return }
      await supabase.auth.signOut()
    }, { confirmLabel: 'Elimina', destructive: true })
  }

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return COUNTRIES.filter(c => !visited.includes(c.code) && (!q || c.name.toLowerCase().includes(q))).slice(0, 60)
  }, [search, visited])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Profilo" onBack={() => router.back()} />

      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}><Skeleton height={120} radius={radius.xl} /><Skeleton height={120} radius={radius.xl} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 24 }}>
          <View style={{ alignItems: 'center', marginBottom: space.lg }}>
            <Avatar name={fullName || email} size={72} />
            <Txt variant="title" style={{ marginTop: space.sm }}>{fullName || 'Viaggiatore'}</Txt>
            <Txt variant="caption" color={colors.textSoft}>{email}</Txt>
          </View>

          {/* Dati */}
          <Card elevation="soft">
            <Txt variant="heading" style={{ marginBottom: space.md }}>I tuoi dati</Txt>
            <View style={{ gap: space.md }}>
              <Input label="Nome completo" icon="account-outline" value={fullName} onChangeText={setFullName} />
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <Input label="Nazionalità" icon="flag-outline" value={nat} onChangeText={setNat} containerStyle={{ flex: 2 }} />
                <Input label="Anno nascita" icon="cake-variant-outline" value={birth} onChangeText={t => setBirth(t.replace(/[^0-9]/g, '').slice(0, 4))} keyboardType="numeric" placeholder="1995" containerStyle={{ flex: 1 }} />
              </View>

              <View>
                <Txt variant="label" color={colors.textSoft} style={{ marginBottom: 6, marginLeft: 4 }}>Genere</Txt>
                <View style={styles.chipWrap}>
                  {GENDERS.map(g => {
                    const on = gender === g.value
                    return (
                      <PressableScale key={g.value} haptic="light" onPress={() => setGender(on ? null : g.value)}>
                        <View style={[styles.selChip, { backgroundColor: on ? colors.primary : colors.bg }]}><Txt variant="label" color={on ? colors.white : colors.textSoft}>{g.label}</Txt></View>
                      </PressableScale>
                    )
                  })}
                </View>
              </View>

              <View>
                <Txt variant="label" color={colors.textSoft} style={{ marginBottom: 6, marginLeft: 4 }}>Lingue parlate</Txt>
                <View style={styles.chipWrap}>
                  {LANGUAGES.map(l => {
                    const on = langs.includes(l)
                    return (
                      <PressableScale key={l} haptic="light" onPress={() => toggleArr(langs, l, setLangs)}>
                        <View style={[styles.selChip, { backgroundColor: on ? colors.tertiary : colors.bg }]}><Txt variant="label" color={on ? colors.white : colors.textSoft}>{l}</Txt></View>
                      </PressableScale>
                    )
                  })}
                </View>
              </View>

              <View>
                <Txt variant="label" color={colors.textSoft} style={{ marginBottom: 6, marginLeft: 4 }}>Interessi di viaggio</Txt>
                <View style={styles.chipWrap}>
                  {TRAVEL_INTERESTS.map(it => {
                    const on = interests.includes(it)
                    return (
                      <PressableScale key={it} haptic="light" onPress={() => toggleArr(interests, it, setInterests)}>
                        <View style={[styles.selChip, { backgroundColor: on ? colors.secondary : colors.bg }]}><Txt variant="label" color={on ? colors.white : colors.textSoft}>{it}</Txt></View>
                      </PressableScale>
                    )
                  })}
                </View>
              </View>

              <Input label="Preferenze / note per i viaggi" icon="note-text-outline" value={notes} onChangeText={setNotes} multiline placeholder="Es. preferisco ritmi rilassati, evito il caldo…" />

              <Button title={savedMsg ? '✓ Salvato' : 'Salva'} gradient="party" icon="content-save" onPress={save} full style={{ marginTop: space.xs }} />
            </View>
          </Card>

          {/* Passaporto */}
          <Card gradient="ocean" style={{ marginTop: space.md }}>
            <View style={styles.rowBetween}>
              <Txt variant="heading" color={colors.white}>🌍 Passaporto</Txt>
              <Txt variant="bodyStrong" color={colors.white}>{visited.length} / {TOTAL_COUNTRIES}</Txt>
            </View>
            <View style={styles.flags}>
              {visited.map(code => {
                const c = COUNTRIES_BY_CODE.get(code)
                return (
                  <PressableScale key={code} haptic="light" onPress={() => removeCountry(code)}>
                    <View style={styles.flagChip}><Txt variant="label" color={colors.white}>{c?.flag ?? '🏳️'} {c?.name ?? code}</Txt></View>
                  </PressableScale>
                )
              })}
              {visited.length === 0 && <Txt variant="body" color="rgba(255,255,255,0.9)">Nessun paese ancora. Aggiungine uno!</Txt>}
            </View>
            <Button title="Aggiungi paese" variant="ghost" icon="plus" onPress={() => setPickOpen(true)} style={{ alignSelf: 'flex-start', marginTop: space.md, borderColor: colors.white }} />
          </Card>

          {/* Sicurezza */}
          <Card elevation="soft" style={{ marginTop: space.md }}>
            <Txt variant="heading">🔐 Sicurezza</Txt>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <Button title="Cambia password" variant="secondary" size="sm" icon="lock-reset" onPress={() => { setNewPwd(''); setPwdMsg(null); setPwdOpen(true) }} />
              <Button title="Elimina account" variant="danger" size="sm" icon="account-remove" onPress={deleteAccount} />
            </View>
          </Card>

          <Button title="Esci" variant="ghost" icon="logout" onPress={() => supabase.auth.signOut()} full style={{ marginTop: space.lg }} />
        </ScrollView>
      )}

      {/* Picker paese */}
      <Sheet visible={pickOpen} onClose={() => { setPickOpen(false); setSearch('') }} title="Aggiungi paese">
        <Input label="Cerca" icon="magnify" value={search} onChangeText={setSearch} placeholder="Italia, Francia…" />
        <ScrollView style={{ maxHeight: 340, marginTop: space.sm }} keyboardShouldPersistTaps="handled">
          {candidates.map(c => (
            <PressableScale key={c.code} haptic="light" onPress={() => addCountry(c.code)}>
              <View style={styles.countryRow}><Txt variant="body">{c.flag}  {c.name}</Txt></View>
            </PressableScale>
          ))}
        </ScrollView>
      </Sheet>

      {/* Cambia password */}
      <Sheet visible={pwdOpen} onClose={() => setPwdOpen(false)} title="Cambia password">
        <View style={{ gap: space.md }}>
          <Input label="Nuova password" icon="lock-outline" value={newPwd} onChangeText={setNewPwd} secureTextEntry />
          {pwdMsg && <Txt variant="label" color={colors.danger}>{pwdMsg}</Txt>}
          <Button title="Salva" gradient="party" icon="content-save" loading={pwdBusy} disabled={newPwd.length < 6} onPress={changePassword} full />
        </View>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flags:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md },
  flagChip:   { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  chipWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selChip:    { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 13 },
  countryRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
})
