-- ============================================================
-- Lettura co-membri senza service role (abilita la dashboard mobile).
-- La RLS storica su trip_members era self-referenziale → per evitare
-- ricorsione limitava la SELECT alle proprie righe, e il web usava il
-- service role per leggere tutti i membri. Qui usiamo una funzione
-- SECURITY DEFINER (bypassa la RLS internamente, niente ricorsione),
-- così qualsiasi membro può leggere i membri dei propri viaggi — sia
-- da web sia da mobile, client-side.
-- ============================================================

create or replace function public.is_trip_member(p_trip_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = p_user_id
  );
$$;

-- Policy SELECT additiva: i membri vedono tutti i co-membri dei loro viaggi.
-- (Va in OR con le policy esistenti: nessuna regressione.)
drop policy if exists "trip_members_select_comembers" on public.trip_members;
create policy "trip_members_select_comembers" on public.trip_members
  for select
  using ( public.is_trip_member(trip_members.trip_id, auth.uid()) );
