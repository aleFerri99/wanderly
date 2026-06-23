-- ============================================================
-- Modulo F: Rimozione likes/votes + sistema recensioni 1-10
-- Eseguire su Supabase > SQL Editor
-- ============================================================

-- ── RIMOZIONE VOTES (likes) ───────────────────────────────────
drop table if exists public.votes cascade;
-- Rimuove anche la publication realtime se presente
-- (la tabella votes era stata aggiunta in 001_module_a.sql)

-- ── TABELLA REVIEWS ──────────────────────────────────────────
create table public.reviews (
  id          uuid     primary key default gen_random_uuid(),
  user_id     uuid     not null references public.profiles(id)   on delete cascade,
  trip_id     uuid     not null references public.trips(id)      on delete cascade,
  activity_id uuid              references public.activities(id) on delete cascade,
  day_id      uuid              references public.days(id)       on delete cascade,
  score       smallint not null check (score between 1 and 10),
  content     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Esattamente uno tra activity_id e day_id deve essere valorizzato
  constraint reviews_target_check check (
    (activity_id is not null and day_id is null) or
    (activity_id is null     and day_id is not null)
  ),

  -- Un utente può lasciare una sola recensione per item
  unique (user_id, activity_id),
  unique (user_id, day_id)
);

create index idx_reviews_activity on public.reviews(activity_id);
create index idx_reviews_day      on public.reviews(day_id);
create index idx_reviews_trip     on public.reviews(trip_id);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
alter table public.reviews enable row level security;

-- Visibile a tutti i membri del viaggio
create policy "Recensioni visibili ai membri del viaggio"
  on public.reviews for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = reviews.trip_id and user_id = auth.uid()
    )
  );

-- Inserimento: solo la propria recensione
create policy "Utente può aggiungere la propria recensione"
  on public.reviews for insert
  to authenticated
  with check (user_id = auth.uid());

-- Modifica: solo la propria
create policy "Utente può modificare la propria recensione"
  on public.reviews for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Cancellazione: solo la propria
create policy "Utente può eliminare la propria recensione"
  on public.reviews for delete
  to authenticated
  using (user_id = auth.uid());

-- Realtime abilitato
alter publication supabase_realtime add table public.reviews;
