// Tema Material 3 per React Native Paper, con la palette di Wanderly (web).
// Primary viola, Secondary ambra, Tertiary teal.
import { MD3LightTheme } from 'react-native-paper'

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary:              '#7C3AED',
    onPrimary:            '#FFFFFF',
    primaryContainer:     '#EDE9FE',
    onPrimaryContainer:   '#2E1065',
    secondary:            '#D97706',
    onSecondary:          '#FFFFFF',
    secondaryContainer:   '#FEF3C7',
    onSecondaryContainer: '#451A00',
    tertiary:             '#0D9488',
    onTertiary:           '#FFFFFF',
    tertiaryContainer:    '#CCFBF1',
    onTertiaryContainer:  '#042F2E',
    error:                '#DC2626',
    errorContainer:       '#FEE2E2',
    background:           '#FAFAFA',
    onBackground:         '#18181B',
    surface:              '#FFFFFF',
    onSurface:            '#18181B',
    surfaceVariant:       '#EEECF8',
    onSurfaceVariant:     '#52525B',
    outline:              '#A1A1AA',
    outlineVariant:       '#D4D4D8',
  },
}

export type AppTheme = typeof theme
