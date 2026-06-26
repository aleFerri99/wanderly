-- Aggiunge campo libero per preferenze specifiche del prossimo viaggio
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trip_notes text;
