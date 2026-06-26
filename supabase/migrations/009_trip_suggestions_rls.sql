-- ============================================================
-- Fix RLS: aggiunge policy INSERT e DELETE su trip_suggestions
-- per consentire ai membri di rigenerare i suggerimenti
-- (il cron usa service role e bypassa RLS automaticamente)
-- ============================================================

create policy "Membri possono inserire suggerimenti"
  on public.trip_suggestions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trip_members
      where trip_id = trip_suggestions.trip_id
        and user_id = auth.uid()
    )
  );

create policy "Membri possono eliminare suggerimenti del proprio viaggio"
  on public.trip_suggestions for delete
  to authenticated
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = trip_suggestions.trip_id
        and user_id = auth.uid()
    )
  );
