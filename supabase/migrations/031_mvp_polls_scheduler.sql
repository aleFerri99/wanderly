-- ============================================================
-- Sondaggio MVP giornaliero — scheduler dentro Supabase (niente Vercel)
--   • pg_cron  → job schedulati in Postgres
--   • pg_net   → push a Expo (best-effort)
--   • 07:00 UTC (~09:00 IT): apre i sondaggi del giorno + notifiche
--   • 20:00 UTC (~22:00 IT): risolve i sondaggi e assegna i punti
-- Il sondaggio parte dal giorno DOPO la partenza, ogni giorno fino a fine viaggio.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Tabelle ──────────────────────────────────────────────────
-- Un sondaggio per trip+giorno.
create table if not exists public.mvp_polls (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  poll_date   date not null,
  status      text not null default 'open' check (status in ('open','resolved')),
  opened_at   timestamptz not null default now(),
  resolved_at timestamptz,
  unique (trip_id, poll_date)
);
alter table public.mvp_polls enable row level security;
create policy "Poll visibili ai membri" on public.mvp_polls for select to authenticated
  using (exists (select 1 from public.trip_members where trip_id = mvp_polls.trip_id and user_id = auth.uid()));
alter publication supabase_realtime add table public.mvp_polls;

-- Notifiche in-app (una riga per utente).
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid references public.trips(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  data       jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "Notifiche proprie: leggi"   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "Notifiche proprie: aggiorna" on public.notifications for update to authenticated using (user_id = auth.uid());
alter publication supabase_realtime add table public.notifications;

-- Token push Expo (per le notifiche vere sul telefono).
create table if not exists public.push_tokens (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token      text not null,
  platform   text,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.push_tokens enable row level security;
create policy "Token propri: leggi"    on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy "Token propri: inserisci" on public.push_tokens for insert to authenticated with check (user_id = auth.uid());
create policy "Token propri: aggiorna"  on public.push_tokens for update to authenticated using (user_id = auth.uid());
create policy "Token propri: elimina"   on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- ── Risoluzione di UN sondaggio (trip+giorno) ────────────────
-- +50 al vincitore unico, +20 a testa in caso di pareggio, -20 a chi non ha votato.
create or replace function public.resolve_one_mvp(p_trip uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_members int;
  v_max int;
  v_winners uuid[];
  v_pts int;
  v_evt text;
begin
  if exists (select 1 from mvp_results where trip_id = p_trip and vote_date = p_date) then
    return;  -- idempotente
  end if;

  select count(*) into v_members from trip_members where trip_id = p_trip;
  if v_members < 2 then
    insert into mvp_results(trip_id, vote_date, winner_ids, points_each) values (p_trip, p_date, '{}', 0);
    return;
  end if;

  -- Malus -20 ai non votanti
  insert into points_log(trip_id, user_id, event_type, points, reference_id, metadata)
  select p_trip, tm.user_id, 'mvp_no_vote', -20, null, jsonb_build_object('vote_date', p_date)
  from trip_members tm
  where tm.trip_id = p_trip
    and not exists (select 1 from daily_votes dv
                    where dv.trip_id = p_trip and dv.vote_date = p_date and dv.voter_id = tm.user_id);

  -- Vincitore/i (max voti)
  select max(c) into v_max from (
    select count(*) c from daily_votes where trip_id = p_trip and vote_date = p_date group by voted_for
  ) t;

  if v_max is null then
    insert into mvp_results(trip_id, vote_date, winner_ids, points_each) values (p_trip, p_date, '{}', 0);
    return;
  end if;

  select array_agg(voted_for) into v_winners from (
    select voted_for, count(*) c from daily_votes where trip_id = p_trip and vote_date = p_date group by voted_for
  ) t where c = v_max;

  if array_length(v_winners, 1) = 1 then
    v_pts := 50; v_evt := 'mvp_winner';
  else
    v_pts := 20; v_evt := 'mvp_tie_winner';
  end if;

  insert into points_log(trip_id, user_id, event_type, points, reference_id, metadata)
  select p_trip, uid, v_evt, v_pts, null, jsonb_build_object('vote_date', p_date)
  from unnest(v_winners) as uid;

  insert into mvp_results(trip_id, vote_date, winner_ids, points_each) values (p_trip, p_date, v_winners, v_pts);
end $$;

-- ── Job 22:00: risolvi tutti i sondaggi aperti ───────────────
create or replace function public.resolve_daily_mvp_polls()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id, trip_id, poll_date from mvp_polls where status = 'open' and poll_date <= current_date loop
    perform public.resolve_one_mvp(r.trip_id, r.poll_date);
    update mvp_polls set status = 'resolved', resolved_at = now() where id = r.id;
  end loop;
end $$;

-- ── Job 09:00: apri i sondaggi del giorno + notifiche ────────
create or replace function public.open_daily_mvp_polls()
returns void language plpgsql security definer set search_path = public as $$
declare
  r_trip record; r_mem record;
  v_poll uuid;
  v_yesterday date := current_date - 1;
  v_had_yesterday boolean;
  v_skipped boolean;
  v_title text; v_body text;
  v_threats text[] := array[
    'Ieri hai saltato il voto… 👀 stavolta non farti pregare o paghi il primo giro! 🍹',
    'Niente voto ieri? 😏 Occhio, o ti tocca portare gli zaini di tutti domani! 🎒',
    'Assente al sondaggio di ieri 🚨 Vota adesso… o lavi i piatti stasera! 🍽️',
    'Ieri hai fatto finta di niente 🙈 Rimedia ora o niente dolce! 🍰'
  ];
begin
  for r_trip in
    select id, name, start_date, end_date from trips
    where start_date is not null
      and current_date >= start_date + 1
      and (end_date is null or current_date <= end_date)
  loop
    v_poll := null;  -- reset: 'returning into' non azzera su conflitto
    insert into mvp_polls(trip_id, poll_date, status)
    values (r_trip.id, current_date, 'open')
    on conflict (trip_id, poll_date) do nothing
    returning id into v_poll;

    if v_poll is null then continue; end if;  -- già aperto: niente doppie notifiche

    v_had_yesterday := exists (select 1 from mvp_polls where trip_id = r_trip.id and poll_date = v_yesterday);

    for r_mem in select user_id from trip_members where trip_id = r_trip.id loop
      v_skipped := v_had_yesterday and not exists (
        select 1 from daily_votes where trip_id = r_trip.id and vote_date = v_yesterday and voter_id = r_mem.user_id
      );
      v_title := '🗳️ Sondaggio MVP di oggi!';
      if v_skipped then
        v_body := 'Vota il migliore di ieri. ' || v_threats[1 + floor(random() * array_length(v_threats, 1))::int];
      else
        v_body := 'Chi è stato il migliore di ieri? Entra e vota il tuo MVP! 🏆';
      end if;

      insert into notifications(trip_id, user_id, type, title, body, data)
      values (r_trip.id, r_mem.user_id, 'mvp_poll', v_title, v_body,
              jsonb_build_object('poll_date', current_date, 'trip_id', r_trip.id));

      -- Push Expo (best-effort, solo se l'utente ha token registrati)
      if exists (select 1 from push_tokens where user_id = r_mem.user_id) then
        perform net.http_post(
          url     := 'https://exp.host/--/api/v2/push/send',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := (select jsonb_agg(jsonb_build_object(
                        'to', pt.token, 'title', v_title, 'body', v_body, 'sound', 'default',
                        'data', jsonb_build_object('trip_id', r_trip.id, 'type', 'mvp_poll')))
                      from push_tokens pt where pt.user_id = r_mem.user_id)
        );
      end if;
    end loop;
  end loop;
end $$;

-- Solo il sistema/cron esegue queste funzioni (non gli utenti).
revoke execute on function public.open_daily_mvp_polls()    from public;
revoke execute on function public.resolve_daily_mvp_polls() from public;
revoke execute on function public.resolve_one_mvp(uuid, date) from public;

-- ── Schedulazione pg_cron (idempotente) ──────────────────────
do $$ begin perform cron.unschedule('mvp-open-daily');    exception when others then null; end $$;
do $$ begin perform cron.unschedule('mvp-resolve-daily');  exception when others then null; end $$;
select cron.schedule('mvp-open-daily',    '0 7 * * *',  $$select public.open_daily_mvp_polls();$$);
select cron.schedule('mvp-resolve-daily', '0 20 * * *', $$select public.resolve_daily_mvp_polls();$$);
