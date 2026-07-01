-- ============================================================
-- Condivisione itinerario tramite link (deep link nativo wanderly://import/<token>).
-- L'export salva l'itinerario "spogliato" (solo tappe + attività, senza recensioni,
-- orari e date assolute) con un token; l'import lo legge via RPC pubblica.
-- ============================================================

create table if not exists public.shared_itineraries (
  token       uuid primary key default gen_random_uuid(),
  created_by  uuid references public.profiles(id) on delete set null,
  name        text not null,
  destination text,
  data        jsonb not null,        -- { name, destination, stops: [...] }
  created_at  timestamptz not null default now()
);

alter table public.shared_itineraries enable row level security;

-- Solo creare i propri share; la lettura NON è via select diretta (niente
-- enumerazione): si usa la RPC get_shared_itinerary col token.
create policy "Crea share" on public.shared_itineraries for insert to authenticated
  with check (created_by = auth.uid());

create or replace function public.get_shared_itinerary(p_token uuid)
returns table (name text, destination text, data jsonb)
language sql security definer set search_path = public as $$
  select s.name, s.destination, s.data from public.shared_itineraries s where s.token = p_token;
$$;

revoke all on function public.get_shared_itinerary(uuid) from public;
grant execute on function public.get_shared_itinerary(uuid) to anon, authenticated;
