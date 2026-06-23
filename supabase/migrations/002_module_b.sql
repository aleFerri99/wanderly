-- ============================================================
-- MODULO B: Itinerario, Tappe e Attività
-- Eseguire su Supabase > SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- DAYS (Tappe / Giorni del viaggio)
-- ────────────────────────────────────────────────────────────
create table public.days (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  title       text not null default '',
  date        date,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- ACTIVITIES (Attività per ogni tappa)
-- ────────────────────────────────────────────────────────────
create type public.activity_status as enum ('todo', 'done');

create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  day_id      uuid not null references public.days(id) on delete cascade,
  trip_id     uuid not null references public.trips(id) on delete cascade,
  title       text not null,
  notes       text,
  time_start  time,
  position    integer not null default 0,
  status      public.activity_status not null default 'todo',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
alter table public.days enable row level security;
alter table public.activities enable row level security;

-- DAYS: visibili/modificabili ai membri del viaggio
create policy "Days visibili ai membri"
  on public.days for select
  to authenticated
  using (
    trip_id in (
      select trip_id from public.trip_members where user_id = auth.uid()
    )
  );

create policy "Days creabili dai membri"
  on public.days for insert
  to authenticated
  with check (
    trip_id in (
      select trip_id from public.trip_members where user_id = auth.uid()
    )
  );

create policy "Days modificabili dai membri"
  on public.days for update
  to authenticated
  using (
    trip_id in (
      select trip_id from public.trip_members where user_id = auth.uid()
    )
  );

create policy "Days eliminabili dai membri"
  on public.days for delete
  to authenticated
  using (
    trip_id in (
      select trip_id from public.trip_members where user_id = auth.uid()
    )
  );

-- ACTIVITIES: stessa logica via trip_id
create policy "Activities visibili ai membri"
  on public.activities for select
  to authenticated
  using (
    trip_id in (
      select trip_id from public.trip_members where user_id = auth.uid()
    )
  );

create policy "Activities creabili dai membri"
  on public.activities for insert
  to authenticated
  with check (
    trip_id in (
      select trip_id from public.trip_members where user_id = auth.uid()
    )
  );

create policy "Activities modificabili dai membri"
  on public.activities for update
  to authenticated
  using (
    trip_id in (
      select trip_id from public.trip_members where user_id = auth.uid()
    )
  );

create policy "Activities eliminabili dai membri"
  on public.activities for delete
  to authenticated
  using (
    trip_id in (
      select trip_id from public.trip_members where user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- INDICI
-- ────────────────────────────────────────────────────────────
create index idx_days_trip_id on public.days(trip_id);
create index idx_days_position on public.days(trip_id, position);
create index idx_activities_day_id on public.activities(day_id);
create index idx_activities_trip_id on public.activities(trip_id);

-- ────────────────────────────────────────────────────────────
-- REALTIME
-- ────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.days;
alter publication supabase_realtime add table public.activities;
