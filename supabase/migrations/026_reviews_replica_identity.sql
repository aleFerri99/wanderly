-- ============================================================
-- Performance (Batch 2) — canale Realtime recensioni condiviso
-- REPLICA IDENTITY FULL fa sì che i payload Realtime di DELETE
-- includano activity_id/day_id, così il canale unico per viaggio
-- (useReviewsChannel) può smistare il delete all'item corretto.
-- Costo trascurabile: reviews è una tabella a basso volume.
-- ============================================================

ALTER TABLE public.reviews REPLICA IDENTITY FULL;
