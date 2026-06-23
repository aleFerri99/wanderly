-- ============================================================
-- Fase 3: Meteo, Gamification e Agentic AI
-- Eseguire su Supabase > SQL Editor
-- ============================================================

-- ── Modulo I: Cache previsioni meteo ─────────────────────────
-- UPSERT per (trip_id, forecast_date): sovrascrive il vecchio,
-- nessun accumulo storico.
create table public.weather_cache (
  id                  uuid        primary key default gen_random_uuid(),
  trip_id             uuid        not null references public.trips(id) on delete cascade,
  forecast_date       date        not null,
  destination         text        not null,
  condition           text        not null, -- 'clear'|'cloudy'|'foggy'|'rainy'|'showers'|'snowy'|'stormy'
  temp_max            numeric,
  temp_min            numeric,
  apparent_temp_max   numeric,              -- temperatura percepita massima
  apparent_temp_min   numeric,              -- temperatura percepita minima
  precipitation       numeric,              -- mm totali
  precipitation_prob  integer,              -- probabilità pioggia 0-100%
  windspeed_max       numeric,              -- km/h massima
  uv_index            numeric,              -- indice UV massimo
  weather_code        integer,
  comfort_score       integer,              -- 1-10 qualità giornata per outdoor
  fetched_at          timestamptz not null default now(),
  unique (trip_id, forecast_date)
);

alter table public.weather_cache enable row level security;
create policy "Meteo visibile ai membri del viaggio"
  on public.weather_cache for select to authenticated
  using (exists (
    select 1 from public.trip_members
    where trip_id = weather_cache.trip_id and user_id = auth.uid()
  ));
-- Insert/Update gestito solo dal cron server-side (service role)

-- ── Modulo I + K: Suggerimenti degli agenti ──────────────────
-- DELETE + INSERT per trip_id: un solo set di suggerimenti attivi.
create table public.trip_suggestions (
  id            uuid        primary key default gen_random_uuid(),
  trip_id       uuid        not null references public.trips(id) on delete cascade,
  type          text        not null, -- 'weather_alert'|'reschedule'|'activity_suggestion'
  title         text        not null,
  body          text        not null,
  activity_data jsonb,               -- dati per aggiungere l'attività con 1 clic
  priority      integer     not null default 0,
  created_at    timestamptz not null default now()
);

create index idx_trip_suggestions_trip on public.trip_suggestions(trip_id);

alter table public.trip_suggestions enable row level security;
create policy "Suggerimenti visibili ai membri del viaggio"
  on public.trip_suggestions for select to authenticated
  using (exists (
    select 1 from public.trip_members
    where trip_id = trip_suggestions.trip_id and user_id = auth.uid()
  ));

alter publication supabase_realtime add table public.trip_suggestions;

-- ── Modulo K: Profili viaggiatore (Agente Psicologo) ─────────
-- UPSERT per (user_id, trip_id): un profilo attivo per utente.
create table public.traveler_profiles (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.profiles(id) on delete cascade,
  trip_id           uuid        not null references public.trips(id) on delete cascade,
  adventure_level   integer     check (adventure_level between 1 and 5),
  cultural_interest integer     check (cultural_interest between 1 and 5),
  food_focus        integer     check (food_focus between 1 and 5),
  personality_tags  text[]      not null default '{}',
  raw_analysis      text,
  generated_at      timestamptz not null default now(),
  unique (user_id, trip_id)
);

alter table public.traveler_profiles enable row level security;
create policy "Profilo visibile ai membri del viaggio"
  on public.traveler_profiles for select to authenticated
  using (exists (
    select 1 from public.trip_members
    where trip_id = traveler_profiles.trip_id and user_id = auth.uid()
  ));

-- ── Modulo J: Gamification ────────────────────────────────────
-- Event-sourced: ogni regola futura = nuovo event_type.
create table public.points_log (
  id           uuid        primary key default gen_random_uuid(),
  trip_id      uuid        not null references public.trips(id) on delete cascade,
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  event_type   text        not null,
  reference_id uuid,
  points       integer     not null,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

create index idx_points_log_trip_user on public.points_log(trip_id, user_id);

alter table public.points_log enable row level security;
create policy "Punti visibili ai membri del viaggio"
  on public.points_log for select to authenticated
  using (exists (
    select 1 from public.trip_members
    where trip_id = points_log.trip_id and user_id = auth.uid()
  ));
create policy "Utente inserisce i propri punti"
  on public.points_log for insert to authenticated
  with check (user_id = auth.uid());

-- Vista classifica (calcolata on-the-fly, zero manutenzione futura)
create or replace view public.trip_leaderboard as
  select
    trip_id,
    user_id,
    sum(points)  as total_points,
    rank() over (partition by trip_id order by sum(points) desc) as rank
  from public.points_log
  group by trip_id, user_id;

-- Voti giornalieri "miglior viaggiatore"
create table public.daily_votes (
  id         uuid        primary key default gen_random_uuid(),
  trip_id    uuid        not null references public.trips(id) on delete cascade,
  voter_id   uuid        not null references public.profiles(id) on delete cascade,
  voted_for  uuid        not null references public.profiles(id) on delete cascade,
  vote_date  date        not null,
  created_at timestamptz not null default now(),
  unique (trip_id, voter_id, vote_date)
);

alter table public.daily_votes enable row level security;
create policy "Voti visibili ai membri del viaggio"
  on public.daily_votes for select to authenticated
  using (exists (
    select 1 from public.trip_members
    where trip_id = daily_votes.trip_id and user_id = auth.uid()
  ));
create policy "Utente inserisce il proprio voto"
  on public.daily_votes for insert to authenticated
  with check (voter_id = auth.uid());
