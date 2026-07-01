import { useState } from 'react'
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Link } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Txt, Card, Button, Input, PressableScale } from '@/components/ui'
import { colors, gradients, radius, space, shadow } from '@/lib/tokens'

export default function Register() {
  const insets = useSafeAreaInsets()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [info,     setInfo]     = useState<string | null>(null)
  const [busy,     setBusy]     = useState(false)

  async function handleRegister() {
    setError(null); setInfo(null)
    if (password.length < 8) { setError('La password deve avere almeno 8 caratteri.'); return }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) { setError('Username: 3-20 caratteri minuscoli, numeri o underscore.'); return }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: fullName.trim() || null, username: username.trim(), birth_date: null, nationality: null, gender: null, languages: [], travel_interests: [] } },
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    if (!data.session) setInfo('Account creato! Controlla la tua email per confermare, poi accedi.')
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.logo, shadow.pop]}>
          <LinearGradient colors={gradients.ocean} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoInner}>
            <MaterialCommunityIcons name="account-plus" size={30} color={colors.white} />
          </LinearGradient>
        </View>
        <Txt variant="title" style={{ textAlign: 'center', marginTop: space.md }}>Crea account</Txt>
        <Txt variant="body" color={colors.textSoft} style={{ textAlign: 'center', marginTop: 4, marginBottom: space.lg }}>Inizia a pianificare i tuoi viaggi.</Txt>

        <Card elevation="card">
          <View style={{ gap: space.md }}>
            <Input label="Nome completo" icon="account-outline" value={fullName} onChangeText={setFullName} />
            <Input label="Username" icon="at" value={username} onChangeText={t => setUsername(t.toLowerCase())} autoCapitalize="none" />
            <Input label="Email" icon="email-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Input
              label="Password" icon="lock-outline" value={password} onChangeText={setPassword} secureTextEntry={!showPwd}
              right={<PressableScale onPress={() => setShowPwd(s => !s)} haptic="none"><MaterialCommunityIcons name={showPwd ? 'eye-off' : 'eye'} size={20} color={colors.textFaint} /></PressableScale>}
            />
            {error && <Txt variant="label" color={colors.danger}>❌ {error}</Txt>}
            {info  && <Txt variant="label" color={colors.tertiary}>✓ {info}</Txt>}
            <Button title="Crea account" gradient="ocean" icon="rocket-launch" loading={busy} disabled={!email || !password || !username} onPress={handleRegister} full style={{ marginTop: space.xs }} />
          </View>
        </Card>

        <View style={styles.footer}>
          <Txt variant="body" color={colors.textSoft}>Hai già un account? </Txt>
          <Link href="/(auth)/login"><Txt variant="bodyStrong" color={colors.primary}>Accedi</Txt></Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  scroll:    { flexGrow: 1, paddingHorizontal: space.lg, paddingBottom: 40 },
  logo:      { alignSelf: 'center', borderRadius: radius.xl },
  logoInner: { width: 64, height: 64, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  footer:    { flexDirection: 'row', justifyContent: 'center', marginTop: space.xl, alignItems: 'center' },
})
