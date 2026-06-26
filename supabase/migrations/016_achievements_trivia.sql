-- ============================================================
-- Modulo J: Badge + Trivia
-- ============================================================

-- ── user_achievements: cache materializzata badge ────────────
-- PK composita (user_id, trip_id, badge_id) → lookup O(1), idempotenza
create table public.user_achievements (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  trip_id    uuid not null references public.trips(id)    on delete cascade,
  badge_id   text not null,
  earned_at  timestamptz not null default now(),
  primary key (user_id, trip_id, badge_id)
);

create index idx_achievements_trip on public.user_achievements(trip_id);

alter publication supabase_realtime add table public.user_achievements;

alter table public.user_achievements enable row level security;

create policy "Badge visibili ai membri del viaggio"
  on public.user_achievements for select to authenticated
  using (exists (
    select 1 from public.trip_members
    where trip_id = user_achievements.trip_id and user_id = auth.uid()
  ));

-- Insert via service role (badge-checker.ts) — nessuna policy insert per utente

-- ── trivia_sessions: sessione di gioco (lifetime = durata partita) ──
create table public.trivia_sessions (
  id          uuid    primary key default gen_random_uuid(),
  trip_id     uuid    not null references public.trips(id) on delete cascade,
  created_by  uuid    not null references public.profiles(id),
  destination text    not null,
  questions   jsonb   not null default '[]',  -- 5 domande compresse in 1 JSONB
  status      text    not null default 'waiting'
              check (status in ('waiting','active','finished')),
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.trivia_sessions enable row level security;

create policy "Trivia visibile ai membri"
  on public.trivia_sessions for select to authenticated
  using (exists (
    select 1 from public.trip_members
    where trip_id = trivia_sessions.trip_id and user_id = auth.uid()
  ));
create policy "Membro crea sessione"
  on public.trivia_sessions for insert to authenticated
  with check (
    created_by = auth.uid() and
    exists (select 1 from public.trip_members where trip_id = trivia_sessions.trip_id and user_id = auth.uid())
  );
create policy "Creatore aggiorna sessione"
  on public.trivia_sessions for update to authenticated
  using (created_by = auth.uid());
create policy "Creatore elimina sessione"
  on public.trivia_sessions for delete to authenticated
  using (created_by = auth.uid());

alter publication supabase_realtime add table public.trivia_sessions;

-- ── trivia_answers: risposte individuali ─────────────────────
create table public.trivia_answers (
  session_id   uuid     not null references public.trivia_sessions(id) on delete cascade,
  user_id      uuid     not null references public.profiles(id) on delete cascade,
  question_idx smallint not null check (question_idx between 0 and 4),
  answer_idx   smallint not null,
  time_ms      integer  not null,   -- ms impiegati per rispondere
  answered_at  timestamptz not null default now(),
  primary key (session_id, user_id, question_idx)   -- no duplicati garantiti
);

alter table public.trivia_answers enable row level security;

create policy "Risposte visibili ai membri"
  on public.trivia_answers for select to authenticated
  using (exists (
    select 1 from public.trivia_sessions s
    join public.trip_members tm on tm.trip_id = s.trip_id
    where s.id = trivia_answers.session_id and tm.user_id = auth.uid()
  ));
create policy "Utente risponde per sé"
  on public.trivia_answers for insert to authenticated
  with check (user_id = auth.uid());

alter publication supabase_realtime add table public.trivia_answers;
