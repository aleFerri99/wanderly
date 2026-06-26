-- ============================================================
-- Gamification V3 (J.7 / J.8 / J.9)
-- ============================================================

-- J.7: proposed_by → activities.created_by già esiste e viene sempre
--       popolato all'inserimento. Nessuna nuova colonna necessaria;
--       creiamo solo un indice per velocizzare le query del cron.
CREATE INDEX IF NOT EXISTS idx_activities_created_by
  ON public.activities (trip_id, created_by, created_at);

-- J.9: Tabella gara mattutina "Speedy"
-- UNIQUE(trip_id, sprint_date) garantisce atomicità: solo il primo
-- INSERT vince; i successivi ricevono un conflict silenzioso.
CREATE TABLE IF NOT EXISTS public.daily_sprints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  winner_id   uuid NOT NULL REFERENCES public.profiles(id),
  sprint_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (trip_id, sprint_date)
);

-- RLS: visibile a tutti i membri del viaggio
ALTER TABLE public.daily_sprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membri possono leggere sprint del loro viaggio"
  ON public.daily_sprints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = daily_sprints.trip_id
        AND tm.user_id = auth.uid()
    )
  );
