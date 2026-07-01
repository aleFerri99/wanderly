-- ============================================================
-- Meteo fuori da Vercel: pg_cron chiama la Edge Function weather-cron via pg_net.
-- 10:00 UTC (~12:00 IT), come il vecchio cron Vercel.
-- Il secret 'cron_secret' va creato una volta in Vault (vedi istruzioni) e
-- impostato anche come secret della function (CRON_SECRET).
-- ============================================================

do $$ begin perform cron.unschedule('weather-daily'); exception when others then null; end $$;

select cron.schedule('weather-daily', '0 10 * * *', $$
  select net.http_post(
    url     := 'https://tocvrknzhhnvuumoxvwj.supabase.co/functions/v1/weather-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
    ),
    body    := '{}'::jsonb
  );
$$);
