import { useState, type ReactNode } from 'react'
import { View, TextInput, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Txt } from './Txt'
import { colors, radius, space, FONT } from '@/lib/tokens'

export function Input({
  label, icon, right, containerStyle, style, multiline, ...rest
}: TextInputProps & {
  label?: string
  icon?: keyof typeof MaterialCommunityIcons.glyphMap
  right?: ReactNode
  containerStyle?: StyleProp<ViewStyle>
}) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={containerStyle}>
      {label && (
        <Txt variant="label" color={focused ? colors.primary : colors.textSoft} style={{ marginBottom: 6, marginLeft: 4 }}>
          {label}
        </Txt>
      )}
      {/* Sfondo SEMPRE uguale (bianco): il focus non disegna nessun riquadro,
          colora solo icona e label. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: space.sm,
          backgroundColor: colors.white,
          borderRadius: radius.lg,
          paddingHorizontal: space.md,
          paddingVertical: multiline ? space.md : 2,
        }}
      >
        {icon && (
          <MaterialCommunityIcons
            name={icon} size={20}
            color={focused ? colors.primary : colors.textFaint}
            style={{ marginTop: multiline ? 10 : 0 }}
          />
        )}
        <TextInput
          placeholderTextColor={colors.textFaint}
          multiline={multiline}
          onFocus={e => { setFocused(true); rest.onFocus?.(e) }}
          onBlur={e => { setFocused(false); rest.onBlur?.(e) }}
          {...rest}
          style={[
            {
              flex: 1,
              paddingVertical: multiline ? 0 : space.md,
              minHeight: multiline ? 56 : undefined,
              fontFamily: FONT.regular,
              fontSize: 15,
              color: colors.text,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            style,
          ]}
        />
        {right}
      </View>
    </View>
  )
}
