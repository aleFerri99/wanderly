import { Text, type TextProps } from 'react-native'
import { type as typeTokens, colors } from '@/lib/tokens'

type Variant = keyof typeof typeTokens

export function Txt({
  variant = 'body', color, style, ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...rest} style={[typeTokens[variant], { color: color ?? colors.text }, style]} />
}
