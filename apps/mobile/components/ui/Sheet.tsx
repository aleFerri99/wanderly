import { Modal, Pressable, View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Txt } from './Txt'
import { colors, radius, space } from '@/lib/tokens'
import type { ReactNode } from 'react'

// Bottom sheet leggero (RN Modal). Più avanti potremo passare a una
// versione con gesture/spring di Reanimated.
export function Sheet({
  visible, onClose, title, children,
}: {
  visible: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,16,40,0.45)' }} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ alignItems: 'center' }}>
        <View
          style={{
            width: '100%',
            maxWidth: Platform.OS === 'web' ? 460 : undefined,
            alignSelf: 'center',
            backgroundColor: colors.bg,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            paddingHorizontal: space.xl,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.xl,
            maxHeight: '88%',
          }}
        >
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: colors.line, marginBottom: space.lg }} />
          {title && <Txt variant="heading" style={{ marginBottom: space.md }}>{title}</Txt>}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
