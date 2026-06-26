// ============================================================
// src/lib/constants.ts
// Costanti condivise tra registrazione, profilo e UI
// ============================================================

export const TRAVEL_INTERESTS = [
  'Natura e Trekking',
  'Spiagge e Mare',
  'Arte e Cultura',
  'Gastronomia e Cucina locale',
  'Avventura e Sport estremi',
  'Shopping',
  'Vita notturna',
  'Architettura e Storia',
  'Fotografia',
  'Benessere e Yoga',
  'Musei',
  'Festival ed eventi',
  'Ecoturismo',
  'Touring in moto/auto',
  'Crociere',
  'Nomadismo digitale',
] as const

export const LANGUAGES = [
  'Italiano', 'Inglese', 'Spagnolo', 'Francese', 'Tedesco',
  'Portoghese', 'Russo', 'Cinese', 'Giapponese', 'Arabo',
  'Olandese', 'Svedese', 'Polacco', 'Turco', 'Coreano',
  'Hindi', 'Vietnamita', 'Thai',
] as const

export const GENDERS = [
  { value: 'uomo',       label: 'Uomo' },
  { value: 'donna',      label: 'Donna' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'altro',      label: 'Altro' },
  { value: 'nd',         label: 'Preferisco non specificare' },
] as const
