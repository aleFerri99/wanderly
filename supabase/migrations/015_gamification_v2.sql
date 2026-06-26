-- ============================================================
-- Gamification V2: nuovo sistema di punteggio
-- ============================================================

-- Traccia se il sondaggio MVP è già stato risolto per un trip+giorno.
-- Garantisce idempotenza: cron e early-close non duplicano i punti.
create table public.mvp_results (
  id          uuid        primary key default gen_random_uuid(),
  trip_id     uuid        not null references public.trips(id) on delete cascade,
  vote_date   date        not null,
  winner_ids  uuid[]      not null default '{}',  -- uno o più in caso di pareggio
  points_each integer     not null default 50,
  closed_at   timestamptz not null default now(),
  unique (trip_id, vote_date)
);

alter table public.mvp_results enable row level security;
create policy "MVP visibile ai membri"
  on public.mvp_results for select to authenticated
  using (exists (
    select 1 from public.trip_members
    where trip_id = mvp_results.trip_id and user_id = auth.uid()
  ));

-- Indice per verificare rapidamente il rate-limit del bagno
create index idx_points_log_bathroom
  on public.points_log(trip_id, user_id, event_type, created_at)
  where event_type = 'bathroom';
