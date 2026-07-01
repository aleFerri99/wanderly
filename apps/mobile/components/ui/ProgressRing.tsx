import { View, StyleSheet } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import type { ReactNode } from 'react'

// Anello di progresso (SVG). `progress` 0..1.
export function ProgressRing({
  progress, size = 84, stroke = 8, color, track, children,
}: {
  progress: number
  size?: number
  stroke?: number
  color: string
  track: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  const offset = c - p * c
  const center = size / 2

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={center} cy={center} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={center} cy={center} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={{ alignItems: 'center' }}>{children}</View>
    </View>
  )
}
