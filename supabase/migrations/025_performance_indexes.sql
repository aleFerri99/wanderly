-- ============================================================
-- Performance — indici sulle query calde (Batch 1)
-- Trasforma i sequential scan in index scan sulle tabelle più
-- interrogate. Tutti IF NOT EXISTS: sicuri da rieseguire.
-- ============================================================

-- points_log: filtrato da malus inattività, sprint, daily awards,
-- shame MVP → sempre per (trip_id, event_type, created_at).
-- (esiste già idx_points_log_trip_user su (trip_id, user_id))
CREATE INDEX IF NOT EXISTS idx_points_log_trip_event_created
  ON public.points_log (trip_id, event_type, created_at);

-- reviews: lette per attività (ReviewSection + daily awards via IN activity_id)
CREATE INDEX IF NOT EXISTS idx_reviews_activity
  ON public.reviews (activity_id);
CREATE INDEX IF NOT EXISTS idx_reviews_trip
  ON public.reviews (trip_id);

-- daily_votes: sondaggio MVP, sempre per (trip_id, vote_date)
CREATE INDEX IF NOT EXISTS idx_daily_votes_trip_date
  ON public.daily_votes (trip_id, vote_date);
