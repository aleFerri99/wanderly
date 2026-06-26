// ============================================================
// Badge definitions — solo stringhe/emoji, zero immagini (vincolo memoria)
// I colori usano i token M3 del tema
// ============================================================

export interface BadgeDef {
  id:          string
  name:        string
  description: string
  icon:        string    // emoji — no file immagine
  color:       string    // testo/icona
  bgColor:     string    // sfondo chip
  trigger:     'on_review' | 'on_trip_end' | 'on_trivia'
}

export const BADGES: BadgeDef[] = [
  {
    id:          'critico_severo',
    name:        'Critico Severo',
    description: 'Hai scritto una recensione impietosa: più di 100 caratteri con voto inferiore a 4.',
    icon:        '⚖️',
    color:       '#DC2626',
    bgColor:     '#FEE2E2',
    trigger:     'on_review',
  },
  {
    id:          'forchetta_oro',
    name:        'Forchetta d\'Oro',
    description: 'Hai recensito almeno 3 attività di ristorazione durante il viaggio.',
    icon:        '🍴',
    color:       '#D97706',
    bgColor:     '#FEF3C7',
    trigger:     'on_review',
  },
  {
    id:          'intasatore_bagni',
    name:        'Intasatore di Bagni',
    description: 'Sei andato al bagno in media più di una volta al giorno durante il viaggio.',
    icon:        '🚽',
    color:       '#7C3AED',
    bgColor:     '#EDE9FE',
    trigger:     'on_trip_end',
  },
  {
    id:          'mvp_del_viaggio',
    name:        'MVP del Viaggio',
    description: 'Hai vinto il sondaggio giornaliero più volte di chiunque altro nel gruppo.',
    icon:        '🏆',
    color:       '#B45309',
    bgColor:     '#FEF3C7',
    trigger:     'on_trip_end',
  },
  {
    id:          'cervellone_viaggio',
    name:        'Cervellone del Viaggio',
    description: 'Hai vinto una sessione di Trivia del Luogo. La mente del gruppo.',
    icon:        '🧠',
    color:       '#0D9488',
    bgColor:     '#CCFBF1',
    trigger:     'on_trivia',
  },
]

export const BADGES_BY_ID = new Map<string, BadgeDef>(BADGES.map(b => [b.id, b]))

// Keyword per riconoscere attività di ristorazione (Forchetta d'Oro)
export const FOOD_KEYWORDS = [
  'ristoran', 'trattoria', 'osteria', 'pizzeria', 'pizza', 'cena', 'pranzo',
  'colazione', 'brunch', 'gelateria', 'pasticceria', 'bar ', 'café', 'caffè',
  'bakery', 'bistrot', 'food', 'sushi', 'ramen', 'burger', 'kebab', 'street food',
  'mercato', 'degustazione', 'dinner', 'lunch', 'breakfast', 'snack',
]
