import { useState } from 'react'
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Txt } from './Txt'
import { Sheet } from './Sheet'
import { Button } from './Button'
import { colors, radius, space } from '@/lib/tokens'

type Mode = 'date' | 'time'
export interface DateFieldProps {
  label?: string
  value: string                 // 'YYYY-MM-DD' (date) o 'HH:MM' (time), '' se vuoto
  onChange: (v: string) => void
  mode?: Mode
  icon?: keyof typeof MaterialCommunityIcons.glyphMap
  placeholder?: string
  containerStyle?: StyleProp<ViewStyle>
}

const pad = (n: number) => String(n).padStart(2, '0')

function toDate(value: string, mode: Mode): Date {
  const now = new Date()
  if (mode === 'time') {
    const [h, m] = value.split(':').map(Number)
    if (!isNaN(h)) now.setHours(h, m || 0, 0, 0)
    return now
  }
  if (value) { const d = new Date(value + 'T00:00:00'); if (!isNaN(d.getTime())) return d }
  return now
}
function fromDate(d: Date, mode: Mode): string {
  return mode === 'time'
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function display(value: string, mode: Mode): string {
  if (!value) return ''
  if (mode === 'time') return value
  const d = new Date(value + 'T00:00:00')
  return isNaN(d.getTime()) ? value : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function DateField({ label, value, onChange, mode = 'date', icon, placeholder, containerStyle }: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const [temp, setTemp] = useState<Date>(() => toDate(value, mode))
  const shown = display(value, mode)

  return (
    <View style={containerStyle}>
      {label && <Txt variant="label" color={colors.textSoft} style={{ marginBottom: 6, marginLeft: 4 }}>{label}</Txt>}
      <Pressable onPress={() => { setTemp(toDate(value, mode)); setOpen(true) }} style={styles.box}>
        {icon && <MaterialCommunityIcons name={icon} size={20} color={colors.textFaint} />}
        <Txt style={{ flex: 1 }} color={shown ? colors.text : colors.textFaint}>
          {shown || placeholder || (mode === 'time' ? 'Seleziona orario' : 'Seleziona data')}
        </Txt>
        <MaterialCommunityIcons name={mode === 'time' ? 'clock-outline' : 'calendar'} size={18} color={colors.textFaint} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={mode === 'time' ? 'Orario' : 'Data'}>
        <View style={{ alignItems: 'center' }}>
          <DateTimePicker
            value={temp}
            mode={mode}
            display="spinner"
            themeVariant="light"
            locale="it-IT"
            is24Hour
            onChange={(_, d) => { if (d) setTemp(d) }}
          />
        </View>
        <Button title="Fatto" gradient="party" icon="check" full onPress={() => { onChange(fromDate(temp, mode)); setOpen(false) }} style={{ marginTop: space.md }} />
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: 15 },
})
