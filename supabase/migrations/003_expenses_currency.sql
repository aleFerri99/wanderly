-- ============================================================
-- Aggiunge supporto multi-valuta alle spese
-- Eseguire su Supabase > SQL Editor
-- ============================================================

alter table public.expenses
  add column if not exists currency     text    not null default 'EUR',
  add column if not exists amount_eur   numeric not null default 0;

-- Backfill: le spese esistenti sono in EUR → amount_eur = amount
update public.expenses
  set amount_eur = amount
  where currency = 'EUR' and amount_eur = 0;
