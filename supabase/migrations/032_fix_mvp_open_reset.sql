-- ============================================================
-- Fix: in open_daily_mvp_polls il 'returning ... into v_poll' non azzera
-- la variabile su conflitto (poll già esistente), causando notifiche doppie
-- per i viaggi successivi nello stesso giro. Aggiungiamo il reset per iterazione.
-- Sicuro anche se la 031 è già stata applicata (create or replace).
-- ============================================================

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
