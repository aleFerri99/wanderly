// ============================================================
// Design tokens — Wanderly mobile "Bubbly & Vibrante"
// Sorgente unica di verità per colori, gradienti, raggi, ombre,
// spaziatura, tipografia e motion. Zero dipendenze.
// ============================================================
import type { TextStyle, ViewStyle } from 'react-native'

// ── Colori — palette "Salvia & Crema" (editoriale, calma) ─────
export const palette = {
  // Brand: verde salvia/foresta
  sage:     '#5B7553',
  sageHi:   '#789A6E',
  forest:   '#46583B',
  // Accenti terra (muti)
  clay:     '#B07F4F',   // terracotta/ambra
  clayLo:   '#9A6A3E',
  teal:     '#5F8278',   // verde-acqua muto
  tealLo:   '#4E7178',
  rose:     '#A56F73',   // rosa-terracotta
  gold:     '#C9A24B',
  blue:     '#6E89A6',   // blu polvere
  // Semantici
  success:  '#4C7A3F',
  warning:  '#C18A3E',
  danger:   '#C2553F',   // rosso mattone (non acceso)
  // Neutri caldi
  ink:      '#24291F',
  inkSoft:  '#5C6356',
  inkFaint: '#9AA092',
  line:     '#E8E6DB',
  card:     '#FFFFFF',
  bg:       '#F4F2EA',   // crema
  bgWarm:   '#F7F4EB',
  white:    '#FFFFFF',
}

export const colors = {
  primary:        palette.sage,
  onPrimary:      palette.white,
  primarySoft:    '#E7EDE1',
  onPrimarySoft:  '#33402B',

  secondary:      palette.clay,
  onSecondary:    palette.white,
  secondarySoft:  '#F2E7D8',
  onSecondarySoft:'#6A4622',

  tertiary:       palette.teal,
  onTertiary:     palette.white,
  tertiarySoft:   '#DEEAE5',
  onTertiarySoft: '#2C453E',

  pink:           palette.rose,
  pinkSoft:       '#F0E2E2',

  danger:         palette.danger,
  dangerSoft:     '#F6E1DB',
  success:        palette.success,
  successSoft:    '#E3EEDC',

  bg:             palette.bg,
  card:           palette.card,
  text:           palette.ink,
  textSoft:       palette.inkSoft,
  textFaint:      palette.inkFaint,
  line:           palette.line,
  white:          palette.white,
}

// Coppie di gradiente [from, to] — toni terra/salvia, calmi
export const gradients = {
  primary:   ['#6E8C64', '#4C6444'] as const,   // salvia → foresta
  party:     ['#5E7C5A', '#3F5436'] as const,   // hero/celebrazioni (verde profondo)
  sunset:    ['#C7956A', '#A86B43'] as const,   // clay/terracotta
  ocean:     ['#7FA0A6', '#4E7178'] as const,   // verde-acqua muto
  amber:     ['#D2A95E', '#B07F38'] as const,
  teal:      ['#7BA39A', '#4F756B'] as const,
  slateDark: ['#3A4636', '#222C20'] as const,   // verde-carbone scuro
}
export type GradientName = keyof typeof gradients

// ── Raggi ─────────────────────────────────────────────────────
export const radius = {
  sm: 12, md: 16, lg: 20, xl: 26, xxl: 34, pill: 999,
}

// ── Spaziatura ────────────────────────────────────────────────
export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40,
}

// ── Ombre morbide (per elevazione "bubbly") ───────────────────
export const shadow = {
  none: {} as ViewStyle,
  soft: {
    shadowColor: '#3F4A38', shadowOpacity: 0.07, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 3,
  } as ViewStyle,
  card: {
    shadowColor: '#3F4A38', shadowOpacity: 0.09, shadowRadius: 20,
    shadowOffset: { width: 0, height: 9 }, elevation: 5,
  } as ViewStyle,
  pop: {
    shadowColor: '#46583B', shadowOpacity: 0.20, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 9,
  } as ViewStyle,
}

// ── Tipografia ────────────────────────────────────────────────
// fontFamily viene impostato a 'Nunito' dopo il caricamento del font
// (vedi _layout). Finché non è caricato, RN usa il font di sistema.
export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium:  'PlusJakartaSans_600SemiBold',
  bold:    'PlusJakartaSans_700Bold',
  black:   'PlusJakartaSans_800ExtraBold',
}

type TypeVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption'
export const type: Record<TypeVariant, TextStyle> = {
  display:    { fontFamily: FONT.black,   fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  title:      { fontFamily: FONT.bold,    fontSize: 23, lineHeight: 29, letterSpacing: -0.4 },
  heading:    { fontFamily: FONT.bold,    fontSize: 17, lineHeight: 23, letterSpacing: -0.2 },
  body:       { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: FONT.bold,    fontSize: 15, lineHeight: 22 },
  label:      { fontFamily: FONT.medium,  fontSize: 13, lineHeight: 18 },
  caption:    { fontFamily: FONT.medium,  fontSize: 11, lineHeight: 15, letterSpacing: 0.2 },
}

// ── Motion (curve/spring condivise) ───────────────────────────
export const motion = {
  // Spring "bouncy" per i tap e gli ingressi
  springBouncy: { damping: 12, stiffness: 220, mass: 0.7 },
  springSoft:   { damping: 18, stiffness: 180, mass: 0.9 },
  pressScale:   0.96,
  durationFast: 160,
  durationMed:  280,
  stagger:      55,   // ritardo tra elementi di lista
}
