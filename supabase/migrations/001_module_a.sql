-- ============================================================
-- MODULO A: Schema completo per Auth + Gestione Gruppo
-- Eseguire su Supabase > SQL Editor
-- ============================================================

-- Estensione UUID (già attiva su Supabase, ma per sicurezza)
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- PROFILES
-- Estende auth.users di Supabase con dati pubblici
-- ────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Trigger: crea il profilo automaticamente alla registrazione
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- TRIPS
-- ────────────────────────────────────────────────────────────
create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  destination   text,
  cover_url     text,
  start_date    date,
  end_date      date,
  invite_code   text unique not null default upper(substring(md5(random()::text) for 8)),
  created_by    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- TRIP_MEMBERS
-- Relazione many-to-many: utente <-> viaggio
-- ────────────────────────────────────────────────────────────
create type public.member_role as enum ('owner', 'editor', 'viewer');

create table public.trip_members (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.member_role not null default 'editor',
  joined_at  timestamptz not null default now(),
  unique (trip_id, user_id)
);

-- Trigger: aggiunge automaticamente il creatore come owner
create or replace function public.handle_new_trip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_trip_created
  after insert on public.trips
  for each row execute procedure public.handle_new_trip();

-- ────────────────────────────────────────────────────────────
-- PRESENZA LIVE (chi sta guardando il viaggio in questo momento)
-- Usato con Supabase Realtime Presence
-- ────────────────────────────────────────────────────────────
-- Nota: la presenza è gestita lato client via Supabase Realtime,
-- non richiede tabella dedicata. Il canale è trip:{trip_id}

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

-- PROFILES: visibili a tutti, modificabili solo dal proprietario
alter table public.profiles enable row level security;

create policy "Profili visibili a tutti gli autenticati"
  on public.profiles for select
  to authenticated using (true);

create policy "Utente può aggiornare il proprio profilo"
  on public.profiles for update
  to authenticated using (auth.uid() = id);

-- TRIPS: visibile solo ai membri
alter table public.trips enable row level security;

create policy "Viaggio visibile ai membri"
  on public.trips for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = trips.id and user_id = auth.uid()
    )
  );

create policy "Viaggio creabile da utenti autenticati"
  on public.trips for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Viaggio modificabile da owner/editor"
  on public.trips for update
  to authenticated
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = trips.id
        and user_id = auth.uid()
        and role in ('owner', 'editor')
    )
  );

create policy "Viaggio eliminabile solo dall'owner"
  on public.trips for delete
  to authenticated
  using (created_by = auth.uid());

-- TRIP_MEMBERS: visibile ai membri dello stesso viaggio
alter table public.trip_members enable row level security;

create policy "Membri visibili agli altri membri"
  on public.trip_members for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_members tm
      where tm.trip_id = trip_members.trip_id and tm.user_id = auth.uid()
    )
  );

create policy "Join via invite code (gestito da server function)"
  on public.trip_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Owner può rimuovere membri"
  on public.trip_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.trip_members tm
      where tm.trip_id = trip_members.trip_id
        and tm.user_id = auth.uid()
        and tm.role = 'owner'
    )
  );

-- ────────────────────────────────────────────────────────────
-- FUNZIONE: join tramite invite code
-- Chiamata dal client, eseguita con security definer
-- ────────────────────────────────────────────────────────────
create or replace function public.join_trip_by_code(p_invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_trip_id uuid;
begin
  -- Trova il viaggio
  select id into v_trip_id
  from public.trips
  where invite_code = upper(p_invite_code);

  if v_trip_id is null then
    raise exception 'Codice invito non valido';
  end if;

  -- Inserisci il membro (ignora se già membro)
  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, auth.uid(), 'editor')
  on conflict (trip_id, user_id) do nothing;

  return v_trip_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- INDICI per performance
-- ────────────────────────────────────────────────────────────
create index idx_trip_members_trip_id on public.trip_members(trip_id);
create index idx_trip_members_user_id on public.trip_members(user_id);
create index idx_trips_invite_code on public.trips(invite_code);
create index idx_trips_created_by on public.trips(created_by);

-- ────────────────────────────────────────────────────────────
-- REALTIME: abilita le tabelle per i broadcast
-- ────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.trip_members;
