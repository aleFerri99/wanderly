-- ============================================================
-- Modulo N: Il Passaporto del Viaggiatore
-- Tabella user_visited_countries con PK composita (user_id, country_code)
-- garantisce unicità e rende ogni UPSERT idempotente.
-- ============================================================

create table public.user_visited_countries (
  user_id      uuid    not null references public.profiles(id) on delete cascade,
  country_code char(2) not null,                -- ISO Alpha-2: "IT", "FR", "US" ...
  source       text    not null default 'manual'
                       check (source in ('manual', 'trip')),
  trip_id      uuid    references public.trips(id) on delete set null,
  visited_at   date    not null default current_date,
  created_at   timestamptz not null default now(),
  primary key (user_id, country_code)           -- unicità naturale + indice cluster
);

create index idx_uvc_user_id on public.user_visited_countries(user_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.user_visited_countries enable row level security;

create policy "Utente vede il proprio passaporto"
  on public.user_visited_countries for select
  to authenticated
  using (user_id = auth.uid());

create policy "Utente inserisce nel proprio passaporto"
  on public.user_visited_countries for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Utente elimina dal proprio passaporto"
  on public.user_visited_countries for delete
  to authenticated
  using (user_id = auth.uid());
