-- Estende traveler_profiles con i nuovi campi dello Psicologo V2
ALTER TABLE public.traveler_profiles
  ADD COLUMN IF NOT EXISTS pace_preference  smallint CHECK (pace_preference  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS social_openness  smallint CHECK (social_openness  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS novelty_seeking  smallint CHECK (novelty_seeking  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS mobility_level   text     CHECK (mobility_level   IN ('full','moderate','limited')),
  ADD COLUMN IF NOT EXISTS travel_style     text     CHECK (travel_style     IN ('planner','spontaneous','mixed')),
  ADD COLUMN IF NOT EXISTS language_comfort text     CHECK (language_comfort IN ('local_only','english_ok','multilingual')),
  ADD COLUMN IF NOT EXISTS pace_note        text;
