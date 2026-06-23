-- ============================================================
-- MODULO C: aggiunge colonna location alle activities
-- Eseguire su Supabase > SQL Editor
-- ============================================================
alter table public.activities
  add column if not exists location text;
