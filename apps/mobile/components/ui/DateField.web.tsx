import { type CSSProperties } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Txt } from './Txt'
import { colors, radius, space, FONT } from '@/lib/tokens'

type Mode = 'date' | 'time'
export interface DateFieldProps {
  label?: string
  value: string
  onChange: (v: string) => void
  mode?: Mode
  icon?: keyof typeof MaterialCommunityIcons.glyphMap
  placeholder?: string
  containerStyle?: StyleProp<ViewStyle>
}

// Su web usiamo l'input nativo del browser: calendario per 'date', orologio per 'time'.
export function DateField({ label, value, onChange, mode = 'date', icon, containerStyle }: DateFieldProps) {
  const inputStyle: CSSProperties = {
    flex: 1, border: 'none', outline: 'none', background: 'transparent',
    fontFamily: FONT.regular, fontSize: 15, color: colors.text,
    paddingTop: 14, paddingBottom: 14,
  }
  return (
    <View style={containerStyle}>
      {label && <Txt variant="label" color={colors.textSoft} style={{ marginBottom: 6, marginLeft: 4 }}>{label}</Txt>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: space.md }}>
        {icon && <MaterialCommunityIcons name={icon} size={20} color={colors.textFaint} />}
        <input type={mode} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
      </View>
    </View>
  )
}
