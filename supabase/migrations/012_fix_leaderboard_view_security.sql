-- ============================================================
-- Fix: trip_leaderboard usava SECURITY DEFINER (default PostgreSQL)
-- che bypassa le RLS di points_log mostrando punti di tutti i viaggi.
-- Ricreata con SECURITY INVOKER (PG15+, Supabase default) in modo che
-- la RLS "Punti visibili ai membri del viaggio" venga rispettata.
-- ============================================================

drop view if exists public.trip_leaderboard;

create view public.trip_leaderboard
  with (security_invoker = true)
as
  select
    trip_id,
    user_id,
    sum(points)::bigint                                                    as total_points,
    rank() over (partition by trip_id order by sum(points) desc)::integer  as rank
  from public.points_log
  group by trip_id, user_id;

-- Commento esplicativo per la dashboard Supabase
comment on view public.trip_leaderboard is
  'Classifica punti per viaggio. SECURITY INVOKER: rispetta le RLS di points_log.';
