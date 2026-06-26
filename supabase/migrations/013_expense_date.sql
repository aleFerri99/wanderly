-- Aggiunge la data della spesa (default oggi per retrocompatibilità)
alter table public.expenses
  add column if not exists expense_date date not null default current_date;
