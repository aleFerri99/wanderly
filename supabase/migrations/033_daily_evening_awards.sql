-- ============================================================
-- Port in pg_cron delle meccaniche serali (niente più Vercel per queste):
--   • Miglior/Peggior attività di ieri  (+20 / -20)
--   • Malus inattività  (-30, ripetibile ogni ~48h)
--   • Bonus spese di fine viaggio  (+50 / -50)
-- Aggregate nel job serale run_daily_evening() insieme alla risoluzione MVP.
-- ============================================================

-- ── Miglior / Peggior attività di ieri ───────────────────────
-- Attività di 'p_date' con status=done, proponente e >=1 voto. Servono >=2
-- attività votate: +20 al proponente della media più alta, -20 alla più bassa
-- (se persona/attività diversa). Idempotente per giornata.
create or replace function public.apply_activity_awards(p_trip uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_best  record;
  v_worst record;
begin
  if exists (
    select 1 from points_log
    where trip_id = p_trip and event_type in ('best_activity', 'worst_activity')
      and created_at >= date_trunc('day', now())
  ) then return; end if;

  select count(*) into v_count from (
    select a.id
    from activities a join reviews r on r.activity_id = a.id
    where a.trip_id = p_trip and a.activity_date = p_date and a.status = 'done' and a.created_by is not null
    group by a.id
  ) s;
  if v_count < 2 then return; end if;

  select act_id, proposer, avg_score into v_best from (
    select a.id as act_id, a.created_by as proposer, avg(r.score)::numeric as avg_score
    from activities a join reviews r on r.activity_id = a.id
    where a.trip_id = p_trip and a.activity_date = p_date and a.status = 'done' and a.created_by is not null
    group by a.id, a.created_by
  ) s order by avg_score desc, act_id limit 1;

  select act_id, proposer, avg_score into v_worst from (
    select a.id as act_id, a.created_by as proposer, avg(r.score)::numeric as avg_score
    from activities a join reviews r on r.activity_id = a.id
    where a.trip_id = p_trip and a.activity_date = p_date and a.status = 'done' and a.created_by is not null
    group by a.id, a.created_by
  ) s order by avg_score asc, act_id limit 1;

  insert into points_log(trip_id, user_id, event_type, points, metadata)
  values (p_trip, v_best.proposer, 'best_activity', 20,
          jsonb_build_object('activity_id', v_best.act_id, 'avg_score', v_best.avg_score));

  if v_worst.proposer <> v_best.proposer or v_worst.act_id <> v_best.act_id then
    insert into points_log(trip_id, user_id, event_type, points, metadata)
    values (p_trip, v_worst.proposer, 'worst_activity', -20,
            jsonb_build_object('activity_id', v_worst.act_id, 'avg_score', v_worst.avg_score));
  end if;
end $$;

-- ── Malus inattività (-30, ripetibile) ───────────────────────
-- Applica -30 a chi (a) non ha proposto attività nelle ultime 48h e
-- (b) non ha già preso un malus inattività nelle ultime ~40h (→ cadenza ~48h
-- col job giornaliero, così i malus si sommano ogni 48h di silenzio).
create or replace function public.apply_inactivity_malus(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into points_log(trip_id, user_id, event_type, points)
  select p_trip, tm.user_id, 'inattivita', -30
  from trip_members tm
  where tm.trip_id = p_trip
    and not exists (
      select 1 from activities a
      where a.trip_id = p_trip and a.created_by = tm.user_id
        and a.created_at >= now() - interval '48 hours'
    )
    and not exists (
      select 1 from points_log pl
      where pl.trip_id = p_trip and pl.user_id = tm.user_id
        and pl.event_type = 'inattivita'
        and pl.created_at >= now() - interval '40 hours'
    );
end $$;

-- ── Bonus spese di fine viaggio (+50 / -50) ──────────────────
-- Saldo netto: +amount_eur a chi paga, -amount_eur/n a ciascun partecipante.
-- +50 al saldo positivo più alto (>0.01), -50 al negativo più basso (<-0.01).
-- Idempotente per viaggio.
create or replace function public.apply_expense_bonuses(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_members int;
  v_lender_uid uuid; v_lender_bal numeric;
  v_debtor_uid uuid; v_debtor_bal numeric;
begin
  if exists (
    select 1 from points_log where trip_id = p_trip and event_type in ('massimo_finanziatore', 'massimo_debitore')
  ) then return; end if;

  select count(*) into v_members from trip_members where trip_id = p_trip;
  if v_members < 2 then return; end if;
  if not exists (select 1 from expenses where trip_id = p_trip) then return; end if;

  with paid as (
    select paid_by as uid, sum(amount_eur) as amt from expenses where trip_id = p_trip group by paid_by
  ),
  owed as (
    select member as uid, sum(e.amount_eur / nullif(array_length(e.split_among, 1), 0)) as amt
    from expenses e, unnest(e.split_among) as member
    where e.trip_id = p_trip group by member
  ),
  bal as (
    select tm.user_id as uid, coalesce(p.amt, 0) - coalesce(o.amt, 0) as balance
    from trip_members tm
    left join paid p on p.uid = tm.user_id
    left join owed o on o.uid = tm.user_id
    where tm.trip_id = p_trip
  )
  select
    (select uid from bal order by balance desc, uid limit 1),
    (select max(balance) from bal),
    (select uid from bal order by balance asc, uid limit 1),
    (select min(balance) from bal)
  into v_lender_uid, v_lender_bal, v_debtor_uid, v_debtor_bal;

  if v_lender_bal > 0.01 then
    insert into points_log(trip_id, user_id, event_type, points, metadata)
    values (p_trip, v_lender_uid, 'massimo_finanziatore', 50, jsonb_build_object('net_balance', round(v_lender_bal, 2)));
  end if;
  if v_debtor_bal < -0.01 then
    insert into points_log(trip_id, user_id, event_type, points, metadata)
    values (p_trip, v_debtor_uid, 'massimo_debitore', -50, jsonb_build_object('net_balance', round(v_debtor_bal, 2)));
  end if;
end $$;

-- ── Job serale unico (20:00 UTC ≈ 22:00 IT) ──────────────────
create or replace function public.run_daily_evening()
returns void language plpgsql security definer set search_path = public as $$
declare r_trip record; v_yesterday date := current_date - 1;
begin
  perform public.resolve_daily_mvp_polls();  -- MVP

  for r_trip in select id, start_date, end_date from trips where start_date is not null loop
    if r_trip.start_date <= current_date and (r_trip.end_date is null or r_trip.end_date >= current_date) then
      perform public.apply_activity_awards(r_trip.id, v_yesterday);  -- best/worst di ieri
      perform public.apply_inactivity_malus(r_trip.id);              -- malus inattività
    end if;
    if r_trip.end_date = v_yesterday then
      perform public.apply_expense_bonuses(r_trip.id);               -- bonus spese
    end if;
  end loop;
end $$;

revoke execute on function public.apply_activity_awards(uuid, date) from public;
revoke execute on function public.apply_inactivity_malus(uuid)      from public;
revoke execute on function public.apply_expense_bonuses(uuid)       from public;
revoke execute on function public.run_daily_evening()               from public;

-- ── Riaggancia il cron serale a run_daily_evening (idempotente) ──
do $$ begin perform cron.unschedule('mvp-resolve-daily'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('daily-evening');     exception when others then null; end $$;
select cron.schedule('daily-evening', '0 20 * * *', $$select public.run_daily_evening();$$);
