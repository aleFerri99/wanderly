import { View, StyleSheet, useWindowDimensions } from 'react-native'
import ConfettiCannon from 'react-native-confetti-cannon'
import { palette } from '@/lib/tokens'

const COLORS = [palette.sage, palette.clay, palette.gold, palette.teal, palette.rose, palette.blue]

// Spara coriandoli ogni volta che `fireKey` cambia (incrementa il contatore per ri-sparare).
export function Confetti({ fireKey }: { fireKey: number }) {
  const { width } = useWindowDimensions()
  if (!fireKey) return null
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ConfettiCannon
        key={fireKey}
        count={90}
        origin={{ x: width / 2, y: -20 }}
        autoStart
        fadeOut
        explosionSpeed={360}
        fallSpeed={2600}
        colors={COLORS}
      />
    </View>
  )
}
