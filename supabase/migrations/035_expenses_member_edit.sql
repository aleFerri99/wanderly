-- ============================================================
-- Spese collaborative: qualsiasi membro del viaggio può modificare/eliminare
-- un movimento (non solo chi l'ha inserito). Prima erano limitate a paid_by.
-- ============================================================

drop policy if exists "Spesa modificabile da chi l'ha inserita" on public.expenses;
drop policy if exists "Spesa eliminabile da chi l'ha inserita"  on public.expenses;

create policy "Spesa modificabile dai membri"
  on public.expenses for update to authenticated
  using (trip_id in (select trip_id from public.trip_members where user_id = auth.uid()));

create policy "Spesa eliminabile dai membri"
  on public.expenses for delete to authenticated
  using (trip_id in (select trip_id from public.trip_members where user_id = auth.uid()));
