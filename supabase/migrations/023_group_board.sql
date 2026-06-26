-- ============================================================
-- Modulo O — Bacheca Note & Task Collaborativa
-- ============================================================

CREATE TABLE IF NOT EXISTS public.group_board (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES public.profiles(id),
  content_type text NOT NULL CHECK (content_type IN ('nota', 'task')),
  text_content text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES public.profiles(id),
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_board_trip
  ON public.group_board (trip_id, created_at DESC);

-- RLS
ALTER TABLE public.group_board ENABLE ROW LEVEL SECURITY;

-- SELECT: tutti i membri del viaggio
CREATE POLICY "board_select" ON public.group_board FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = group_board.trip_id
        AND tm.user_id = auth.uid()
    )
  );

-- INSERT: solo il proprio item
CREATE POLICY "board_insert" ON public.group_board FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = group_board.trip_id
        AND tm.user_id = auth.uid()
    )
  );

-- UPDATE: chiunque può completare un task; solo il creatore può modificare il testo
CREATE POLICY "board_update" ON public.group_board FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = group_board.trip_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Il testo può essere modificato solo dal creatore
    (text_content = (SELECT text_content FROM public.group_board b WHERE b.id = group_board.id)
     OR created_by = auth.uid())
  );

-- DELETE: solo il creatore
CREATE POLICY "board_delete" ON public.group_board FOR DELETE
  USING (created_by = auth.uid());

-- Abilita Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_board;
