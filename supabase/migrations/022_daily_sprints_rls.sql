-- Fix RLS daily_sprints: aggiunge policy INSERT mancante.
-- Un membro può inserire solo se:
--   1. è membro del viaggio (trip_id)
--   2. sta reclamando per sé stesso (winner_id = auth.uid())
CREATE POLICY "Membri possono reclamare sprint del loro viaggio"
  ON public.daily_sprints FOR INSERT
  WITH CHECK (
    winner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = daily_sprints.trip_id
        AND tm.user_id = auth.uid()
    )
  );
