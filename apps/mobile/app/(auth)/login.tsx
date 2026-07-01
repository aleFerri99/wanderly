import { useState } from 'react'
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Link } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Txt, Card, Button, Input, PressableScale } from '@/components/ui'
import { colors, gradients, radius, space, shadow } from '@/lib/tokens'

export default function Login() {
  const insets = useSafeAreaInsets()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [okMsg,    setOkMsg]    = useState<string | null>(null)
  const [busy,     setBusy]     = useState(false)

  async function handleLogin() {
    setError(null); setOkMsg(null); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError('Email o password non corretti.')
  }
  async function handleReset() {
    if (!email.trim()) { setError('Inserisci la tua email, poi tocca di nuovo.'); return }
    setError(null); setOkMsg(null); setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setBusy(false)
    if (error) setError(error.message); else setOkMsg('Email di reset inviata! Controlla la casella.')
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.logo, shadow.pop]}>
          <LinearGradient colors={gradients.party} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoInner}>
            <MaterialCommunityIcons name="airplane" size={32} color={colors.white} />
          </LinearGradient>
        </View>
        <Txt variant="display" style={{ textAlign: 'center', marginTop: space.md }}>Wanderly</Txt>
        <Txt variant="body" color={colors.textSoft} style={{ textAlign: 'center', marginTop: 4, marginBottom: space.xl }}>Bentornato! Accedi al tuo account.</Txt>

        <Card elevation="card">
          <View style={{ gap: space.md }}>
            <Input label="Email" icon="email-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Input
              label="Password" icon="lock-outline" value={password} onChangeText={setPassword} secureTextEntry={!showPwd}
              right={<PressableScale onPress={() => setShowPwd(s => !s)} haptic="none"><MaterialCommunityIcons name={showPwd ? 'eye-off' : 'eye'} size={20} color={colors.textFaint} /></PressableScale>}
            />
            {error && <Txt variant="label" color={colors.danger}>❌ {error}</Txt>}
            {okMsg && <Txt variant="label" color={colors.tertiary}>✓ {okMsg}</Txt>}
            <Button title="Accedi" gradient="party" icon="login" loading={busy} disabled={!email || !password} onPress={handleLogin} full style={{ marginTop: space.xs }} />
            <PressableScale onPress={handleReset} style={{ alignSelf: 'center', padding: 6 }}><Txt variant="label" color={colors.primary}>Password dimenticata?</Txt></PressableScale>
          </View>
        </Card>

        <View style={styles.footer}>
          <Txt variant="body" color={colors.textSoft}>Non hai un account? </Txt>
          <Link href="/(auth)/register"><Txt variant="bodyStrong" color={colors.primary}>Registrati</Txt></Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  scroll:    { flexGrow: 1, paddingHorizontal: space.lg, paddingBottom: 40 },
  logo:      { alignSelf: 'center', borderRadius: radius.xl },
  logoInner: { width: 68, height: 68, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  footer:    { flexDirection: 'row', justifyContent: 'center', marginTop: space.xl, alignItems: 'center' },
})
