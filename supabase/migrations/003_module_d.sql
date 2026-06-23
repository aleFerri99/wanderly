-- ============================================================
-- MODULO D: Voti, Spese, Note condivise
-- Eseguire su Supabase > SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- VOTES (Sistema di votazione per attività)
-- ────────────────────────────────────────────────────────────
create type public.vote_value as enum ('up', 'down');

create table public.votes (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  trip_id     uuid not null references public.trips(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  value       public.vote_value not null,
  created_at  timestamptz not null default now(),
  unique (activity_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- EXPENSES (Spese condivise)
-- ────────────────────────────────────────────────────────────
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  paid_by      uuid not null references public.profiles(id) on delete cascade,
  description  text not null,
  amount       numeric(10,2) not null check (amount > 0),
  split_among  uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- NOTES (Note condivise del viaggio)
-- ────────────────────────────────────────────────────────────
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  content    text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Una sola nota condivisa per viaggio — inserita automaticamente
create or replace function public.handle_new_trip_note()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notes (trip_id, content, updated_by)
  values (new.id, '', new.created_by);
  return new;
end;
$$;

create trigger on_trip_created_note
  after insert on public.trips
  for each row execute procedure public.handle_new_trip_note();

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
alter table public.votes enable row level security;
alter table public.expenses enable row level security;
alter table public.notes enable row level security;

-- VOTES
create policy "Voti visibili ai membri"
  on public.votes for select to authenticated
  using (trip_id in (select trip_id from public.trip_members where user_id = auth.uid()));

create policy "Voto inseribile dai membri"
  on public.votes for insert to authenticated
  with check (user_id = auth.uid() and trip_id in (select trip_id from public.trip_members where user_id = auth.uid()));

create policy "Voto modificabile dal votante"
  on public.votes for update to authenticated
  using (user_id = auth.uid());

create policy "Voto eliminabile dal votante"
  on public.votes for delete to authenticated
  using (user_id = auth.uid());

-- EXPENSES
create policy "Spese visibili ai membri"
  on public.expenses for select to authenticated
  using (trip_id in (select trip_id from public.trip_members where user_id = auth.uid()));

create policy "Spesa inseribile dai membri"
  on public.expenses for insert to authenticated
  with check (trip_id in (select trip_id from public.trip_members where user_id = auth.uid()));

create policy "Spesa modificabile da chi l'ha inserita"
  on public.expenses for update to authenticated
  using (paid_by = auth.uid());

create policy "Spesa eliminabile da chi l'ha inserita"
  on public.expenses for delete to authenticated
  using (paid_by = auth.uid());

-- NOTES
create policy "Note visibili ai membri"
  on public.notes for select to authenticated
  using (trip_id in (select trip_id from public.trip_members where user_id = auth.uid()));

create policy "Note modificabili dai membri"
  on public.notes for update to authenticated
  using (trip_id in (select trip_id from public.trip_members where user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- INDICI
-- ────────────────────────────────────────────────────────────
create index idx_votes_activity_id on public.votes(activity_id);
create index idx_votes_trip_id on public.votes(trip_id);
create index idx_expenses_trip_id on public.expenses(trip_id);
create index idx_notes_trip_id on public.notes(trip_id);

-- ────────────────────────────────────────────────────────────
-- REALTIME
-- ────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.notes;
