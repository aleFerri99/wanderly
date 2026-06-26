-- ============================================================
-- Modulo P — Documenti & Prenotazioni + Packing List AI
-- ============================================================

-- ── Documenti di viaggio ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES public.profiles(id),
  doc_type     text NOT NULL CHECK (doc_type IN ('volo','hotel','treno','bus','noleggio','biglietto','assicurazione','altro')),
  title        text NOT NULL,
  booking_code text,
  doc_date     date,
  doc_time     text,
  link_url     text,
  notes        text,
  day_id       uuid REFERENCES public.days(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_documents_trip
  ON public.trip_documents (trip_id, doc_date);

ALTER TABLE public.trip_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "docs_select" ON public.trip_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = trip_documents.trip_id AND tm.user_id = auth.uid()
  ));

CREATE POLICY "docs_insert" ON public.trip_documents FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = trip_documents.trip_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "docs_update" ON public.trip_documents FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "docs_delete" ON public.trip_documents FOR DELETE
  USING (created_by = auth.uid());

-- ── Packing list: estende group_board ─────────────────────────
ALTER TABLE public.group_board DROP CONSTRAINT IF EXISTS group_board_content_type_check;
ALTER TABLE public.group_board ADD CONSTRAINT group_board_content_type_check
  CHECK (content_type IN ('nota','task','packing'));

-- Le voci 'packing' sono PERSONALI: visibili solo al proprietario.
-- note/task restano condivise con tutti i membri.
DROP POLICY IF EXISTS "board_select" ON public.group_board;
CREATE POLICY "board_select" ON public.group_board FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = group_board.trip_id AND tm.user_id = auth.uid()
    )
    AND (content_type <> 'packing' OR created_by = auth.uid())
  );

-- ── Template packing generato dall'AI (una volta per viaggio) ──
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS packing_template jsonb;
