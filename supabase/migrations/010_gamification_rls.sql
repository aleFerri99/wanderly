-- ============================================================
-- Modulo J: Gamification — policy aggiuntive e realtime
-- ============================================================

-- Permetti agli utenti di eliminare il proprio voto (per cambiarlo)
create policy "Utente elimina il proprio voto"
  on public.daily_votes for delete to authenticated
  using (voter_id = auth.uid());

-- Realtime per classifica live e voti
alter publication supabase_realtime add table public.points_log;
alter publication supabase_realtime add table public.daily_votes;
