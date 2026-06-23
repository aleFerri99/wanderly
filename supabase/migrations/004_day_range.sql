-- ============================================================
-- Supporto tappe multi-giorno
-- Eseguire su Supabase > SQL Editor
-- ============================================================

-- Intervallo date per la tappa
alter table public.days
  add column if not exists date_end date;

-- Giorno specifico a cui appartiene l'attività (rilevante nelle tappe multi-giorno)
alter table public.activities
  add column if not exists activity_date date;
