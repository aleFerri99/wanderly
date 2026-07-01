-- ============================================================
-- Gamification — funzioni SECURITY DEFINER per le azioni interattive.
-- Spostano l'assegnazione punti nel DB: web e mobile chiamano le stesse
-- RPC col JWT utente, senza service role. La sicurezza è garantita da
-- is_trip_member (migration 028). Atomiche → niente doppio-conteggio.
-- ============================================================

-- ── Completa un task della bacheca: +5 punti al chiamante, poi elimina.
-- Il DELETE con guard è atomico: se il task è già stato completato/eliminato
-- (riga assente) non assegna punti.
create or replace function public.complete_board_task(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_trip uuid;
begin
  delete from public.group_board
   where id = p_item_id and content_type = 'task'
   returning trip_id into v_trip;

  if v_trip is null then
    return false;                       -- già completato/eliminato
  end if;
  if not public.is_trip_member(v_trip, auth.uid()) then
    return false;
  end if;

  insert into public.points_log (trip_id, user_id, event_type, points)
  values (v_trip, auth.uid(), 'task_completed', 5);
  return true;
end;
$$;

-- ── Pulsante Bagno: +10 al target, max 6/giorno, cooldown 30s.
-- Ritorna 'ok' | 'max' | 'cooldown' | 'denied'.
create or replace function public.award_bathroom(p_trip_id uuid, p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_cnt int; v_recent int;
begin
  if not public.is_trip_member(p_trip_id, auth.uid()) then
    return 'denied';
  end if;

  select count(*) into v_cnt from public.points_log
   where trip_id = p_trip_id and user_id = p_target
     and event_type = 'bathroom' and created_at >= date_trunc('day', now());
  if v_cnt >= 6 then return 'max'; end if;

  select count(*) into v_recent from public.points_log
   where trip_id = p_trip_id and user_id = p_target
     and event_type = 'bathroom' and created_at >= now() - interval '30 seconds';
  if v_recent > 0 then return 'cooldown'; end if;

  insert into public.points_log (trip_id, user_id, event_type, points)
  values (p_trip_id, p_target, 'bathroom', 10);
  return 'ok';
end;
$$;

-- ── Gara mattutina "Speedy": primo a reclamare → +20.
-- INSERT atomico su daily_sprints (UNIQUE trip+data). Assegna i punti solo
-- se il chiamante ha vinto ORA. Ritorna { winner_id, awarded }.
create or replace function public.claim_morning_sprint(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_inserted uuid; v_winner uuid;
begin
  if not public.is_trip_member(p_trip_id, auth.uid()) then
    return jsonb_build_object('winner_id', null, 'awarded', false);
  end if;

  insert into public.daily_sprints (trip_id, winner_id, sprint_date)
  values (p_trip_id, auth.uid(), current_date)
  on conflict (trip_id, sprint_date) do nothing
  returning winner_id into v_inserted;

  if v_inserted is not null then
    insert into public.points_log (trip_id, user_id, event_type, points)
    values (p_trip_id, auth.uid(), 'morning_sprint', 20);
    return jsonb_build_object('winner_id', v_inserted, 'awarded', true);
  end if;

  select winner_id into v_winner from public.daily_sprints
   where trip_id = p_trip_id and sprint_date = current_date;
  return jsonb_build_object('winner_id', v_winner, 'awarded', false);
end;
$$;

-- Permessi: chiamabili dagli utenti autenticati
grant execute on function public.complete_board_task(uuid)        to authenticated;
grant execute on function public.award_bathroom(uuid, uuid)       to authenticated;
grant execute on function public.claim_morning_sprint(uuid)       to authenticated;
