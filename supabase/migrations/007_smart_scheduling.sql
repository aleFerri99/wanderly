-- ============================================================
-- Modulo H: Campi per Smart Scheduling
-- Eseguire su Supabase > SQL Editor
-- ============================================================

alter table public.activities
  -- Durata stimata in minuti (usata dall'algoritmo di scheduling)
  add column if not exists duration_minutes integer,
  -- Coordinate geografiche salvate al primo geocoding (evita richieste ripetute a Nominatim)
  add column if not exists lat              numeric(10, 7),
  add column if not exists lng              numeric(10, 7);

-- Indice per query geografiche veloci nell'algoritmo di clustering
create index if not exists idx_activities_coords
  on public.activities(lat, lng)
  where lat is not null and lng is not null;
