-- Cambia birth_date da date a text per salvare solo l'anno (es. "1995")
-- I dati esistenti vengono migrati estraendo solo l'anno dalla data
ALTER TABLE public.profiles
  ALTER COLUMN birth_date TYPE text
  USING CASE
    WHEN birth_date IS NOT NULL THEN EXTRACT(YEAR FROM birth_date)::text
    ELSE NULL
  END;
