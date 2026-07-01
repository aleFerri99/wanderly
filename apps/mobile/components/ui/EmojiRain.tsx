import { useEffect, useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { MotiView } from 'moti'
import { Txt } from './Txt'

interface Drop { id: number; x: number; delay: number; size: number; dur: number; spin: string }

// Pioggia di emoji dall'alto: incrementa `fireKey` per farne cadere una raffica.
export function EmojiRain({ fireKey, emoji = '💩', count = 46 }: { fireKey: number; emoji?: string; count?: number }) {
  const { width, height } = useWindowDimensions()
  const [drops, setDrops] = useState<Drop[]>([])

  useEffect(() => {
    if (!fireKey) return
    const items: Drop[] = Array.from({ length: count }, (_, i) => ({
      id:    fireKey * 1000 + i,
      x:     Math.random() * (width - 36),
      delay: Math.random() * 650,
      size:  26 + Math.random() * 26,
      dur:   1300 + Math.random() * 1000,
      spin:  `${Math.random() > 0.5 ? '' : '-'}${180 + Math.round(Math.random() * 360)}deg`,
    }))
    setDrops(items)
    const t = setTimeout(() => setDrops([]), 3200)
    return () => clearTimeout(t)
  }, [fireKey])

  if (!drops.length) return null
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {drops.map(d => (
        <MotiView
          key={d.id}
          from={{ translateX: d.x, translateY: -60, rotate: '0deg', opacity: 0 }}
          animate={{ translateX: d.x, translateY: height + 60, rotate: d.spin, opacity: 1 }}
          transition={{ type: 'timing', duration: d.dur, delay: d.delay }}
          style={styles.drop}
        >
          <Txt style={{ fontSize: d.size }}>{emoji}</Txt>
        </MotiView>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  drop: { position: 'absolute', top: 0, left: 0 },
})
