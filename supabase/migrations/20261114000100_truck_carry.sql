-- Truck carry-over: what came back on our own truck can stay on it for the next trip of the SAME truck.
-- Stock math does not change: the unload still puts it into stock (on_hand stays the true total we own).
-- vehicle_carry only marks those cases as "on truck X", so other trucks cannot load them and the godown shows them apart.
-- Next morning the loader confirms the count on the truck; anything missing is written off as an 'adjust' stock move.

create table if not exists public.vehicle_carry (
  vehicle_id uuid not null references public.vehicle(id) on delete cascade,
  variant_id uuid not null references public.variant(id),
  qty int not null check (qty > 0),
  from_plan uuid not null references public.route_day_plan(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (vehicle_id, variant_id)
);
alter table public.vehicle_carry enable row level security;
drop policy if exists vehicle_carry_staff_read on public.vehicle_carry;
create policy vehicle_carry_staff_read on public.vehicle_carry for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.vehicle_carry from anon, authenticated;

-- What a morning load took over from the truck (so "undo load" / "change load" can give it back).
alter table public.route_day_plan add column if not exists carry_in jsonb;

/** Cases of an item marked as on some truck (optionally leaving one truck out). */
create or replace function public._carry_qty(p_variant uuid, p_except_vehicle uuid default null) returns int
language sql stable security definer set search_path to '' as $$
  select coalesce(sum(qty), 0)::int from public.vehicle_carry where variant_id = p_variant and vehicle_id is distinct from p_except_vehicle
$$;
revoke all on function public._carry_qty(uuid, uuid) from public, anon, authenticated;

-- ---------- unload: keep on truck (default) or put in the godown ----------
drop function if exists public.trip_unload(uuid, jsonb);
create function public.trip_unload(p_plan uuid, p_returned jsonb, p_keep boolean default true) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v public.route_day_plan; r record; v_new int; v_back int := 0;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v from public.route_day_plan where id = p_plan for update;
  if v.id is null then raise exception 'NOT_FOUND'; end if;
  if v.status not in ('loaded', 'out') then raise exception 'PLAN_NOT_OUT'; end if;
  if jsonb_typeof(p_returned) <> 'array' or exists (
       select 1 from jsonb_array_elements(p_returned) e
       where (e ->> 'qty') !~ '^\d{1,4}$' or not exists (select 1 from public.load_line ll where ll.route_day_plan_id = p_plan and ll.variant_id = (e ->> 'variant_id')::uuid))
  then raise exception 'INVALID_INPUT'; end if;
  for r in select ll.*, t.delivered, t.billed from public.load_line ll join public._trip_left(p_plan) t on t.variant_id = ll.variant_id where ll.route_day_plan_id = p_plan loop
    v_new := coalesce((select (e ->> 'qty')::int from jsonb_array_elements(p_returned) e where (e ->> 'variant_id')::uuid = r.variant_id), 0);
    if v_new > r.qty_ordered_total + r.qty_spare - r.delivered - r.billed then raise exception 'MORE_THAN_ON_TRUCK'; end if;
    if v_new <> r.qty_returned then
      insert into public.stock_move (variant_id, qty, kind, route_day_plan_id, reason)
      values (r.variant_id, v_new - r.qty_returned, case when v_new > r.qty_returned then 'return_in' else 'return_undo' end::public.stock_move_kind, p_plan,
              case when p_keep and v.vehicle_id is not null then 'Unloaded (kept on truck)' else 'Unloaded' end);
      update public.load_line set qty_returned = v_new where id = r.id;
    end if;
    v_back := v_back + v_new;
  end loop;
  -- the truck's carry is what this trip brought back (a correction replaces it)
  delete from public.vehicle_carry where from_plan = p_plan;
  if p_keep and v.vehicle_id is not null then
    insert into public.vehicle_carry (vehicle_id, variant_id, qty, from_plan)
    select v.vehicle_id, variant_id, qty_returned, p_plan from public.load_line where route_day_plan_id = p_plan and qty_returned > 0
    on conflict (vehicle_id, variant_id) do update set qty = excluded.qty, from_plan = excluded.from_plan, updated_at = now();
  end if;
  update public.route_day_plan set unloaded_at = now(), status = 'out' where id = p_plan;
  return jsonb_build_object('returned', v_back, 'kept', p_keep and v.vehicle_id is not null,
    'left', (select coalesce(sum(left_qty), 0) from public._trip_left(p_plan)));
end $$;

/** Put a truck's leftover into the godown (no stock move: it is already counted in stock). */
create or replace function public.truck_carry_release(p_vehicle uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_n int;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  with d as (delete from public.vehicle_carry where vehicle_id = p_vehicle returning qty) select coalesce(sum(qty), 0) into v_n from d;
  insert into public.audit_log (actor, table_name, row_id, action, after) values (auth.uid(), 'vehicle', p_vehicle::text, 'truck_carry_release', jsonb_build_object('cases', v_n));
  return jsonb_build_object('cases', v_n);
end $$;

-- ---------- morning load: confirm the leftover first ----------
drop function if exists public.trip_load(uuid, uuid, jsonb);
create function public.trip_load(p_plan uuid, p_driver uuid, p_lines jsonb, p_carry jsonb default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v public.route_day_plan; v_bad int; v_total int; c record; v_ok int; v_short int := 0; v_in jsonb;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v from public.route_day_plan where id = p_plan for update;
  if v.id is null then raise exception 'NOT_FOUND'; end if;
  if v.vehicle_id is null then raise exception 'VEHICLE_REQUIRED'; end if;
  if p_driver is not null and not exists (select 1 from public.profiles where user_id = p_driver and role = 'driver' and active) then raise exception 'DRIVER_REQUIRED'; end if;
  if jsonb_typeof(p_lines) <> 'array' or exists (
       select 1 from jsonb_array_elements(p_lines) e left join public.variant x on x.id = (e ->> 'variant_id')::uuid
       where x.id is null or (e ->> 'qty') !~ '^\d{1,4}$')
     or (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_lines) e)
  then raise exception 'INVALID_INPUT'; end if;
  if p_carry is not null and (jsonb_typeof(p_carry) <> 'array' or exists (select 1 from jsonb_array_elements(p_carry) e where (e ->> 'qty') !~ '^\d{1,4}$' or (e ->> 'variant_id') is null))
  then raise exception 'INVALID_INPUT'; end if;
  select coalesce(sum((e ->> 'qty')::int), 0) into v_total from jsonb_array_elements(p_lines) e;
  if v_total = 0 then raise exception 'NOTHING_TO_LOAD'; end if;

  if v.status = 'loaded' then
    if exists (select 1 from public.cash_sale where route_day_plan_id = p_plan and voided_at is null)
       or exists (select 1 from public.invoice where route_day_plan_id = p_plan)
       or exists (select 1 from public.load_line where route_day_plan_id = p_plan and qty_returned > 0)
    then raise exception 'TRIP_STARTED'; end if;
    update public.route_day_plan set status = 'planning' where id = p_plan;
    delete from public.load_line where route_day_plan_id = p_plan;
    update public.orders set status = 'placed', updated_at = now() where route_day_plan_id = p_plan and status = 'locked';
  elsif v.status <> 'planning' then raise exception 'TRIP_STARTED';
  end if;

  -- leftover on this truck from its last trip: the loader confirms the count; missing cases are written off
  if exists (select 1 from public.vehicle_carry where vehicle_id = v.vehicle_id and from_plan <> p_plan) then
    if p_carry is null then raise exception 'CARRY_CHECK_REQUIRED'; end if;
    v_in := '[]'::jsonb;
    for c in select * from public.vehicle_carry where vehicle_id = v.vehicle_id and from_plan <> p_plan for update loop
      v_ok := coalesce((select (e ->> 'qty')::int from jsonb_array_elements(p_carry) e where (e ->> 'variant_id')::uuid = c.variant_id), 0);
      if v_ok > c.qty then raise exception 'MORE_THAN_ON_TRUCK'; end if;
      if v_ok < c.qty then
        insert into public.stock_move (variant_id, qty, kind, route_day_plan_id, reason)
        values (c.variant_id, v_ok - c.qty, 'adjust', p_plan, 'Truck leftover short at morning check');
        v_short := v_short + c.qty - v_ok;
      end if;
      v_in := v_in || jsonb_build_object('variant_id', c.variant_id, 'qty', v_ok, 'from_plan', c.from_plan);
    end loop;
    delete from public.vehicle_carry where vehicle_id = v.vehicle_id and from_plan <> p_plan;
    update public.route_day_plan set carry_in = v_in where id = p_plan;
  end if;

  -- never load more than the godown has (cases kept on other trucks are not free)
  select count(*) into v_bad from jsonb_array_elements(p_lines) e left join public.stock s on s.variant_id = (e ->> 'variant_id')::uuid
   where (e ->> 'qty')::int > coalesce(s.on_hand, 0) - public._carry_qty((e ->> 'variant_id')::uuid, v.vehicle_id);
  if v_bad > 0 then raise exception 'NOT_ENOUGH_STOCK'; end if;

  update public.orders set status = 'locked', updated_at = now() where route_day_plan_id = p_plan and status = 'placed';
  insert into public.load_line (route_day_plan_id, variant_id, qty_ordered_total, qty_spare)
  select p_plan, (e ->> 'variant_id')::uuid, least((e ->> 'qty')::int, coalesce(o.q, 0)), (e ->> 'qty')::int - least((e ->> 'qty')::int, coalesce(o.q, 0))
    from jsonb_array_elements(p_lines) e
    left join (select ol.variant_id, sum(ol.qty_ordered)::int q from public.orders od join public.order_line ol on ol.order_id = od.id
               where od.route_day_plan_id = p_plan and od.status = 'locked' group by 1) o on o.variant_id = (e ->> 'variant_id')::uuid
   where (e ->> 'qty')::int > 0;
  update public.route_day_plan set status = 'loaded', driver_id = p_driver where id = p_plan;
  return jsonb_build_object('plan_id', p_plan, 'cases', v_total, 'carry_short', v_short);
end $$;

-- Undo unload: the leftover it marked is no longer on the truck.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.trip_undo_unload(uuid)'::regprocedure);
  d := replace(d, $x$update public.load_line set qty_returned = 0 where route_day_plan_id = p_plan;$x$,
                  $x$update public.load_line set qty_returned = 0 where route_day_plan_id = p_plan;
  delete from public.vehicle_carry where from_plan = p_plan;$x$);
  execute d;
  -- Undo load: give the confirmed leftover back to the truck.
  d := pg_get_functiondef('public.trip_undo_load(uuid)'::regprocedure);
  d := replace(d, $x$delete from public.load_line where route_day_plan_id = p_plan;$x$,
                  $x$delete from public.load_line where route_day_plan_id = p_plan;
  insert into public.vehicle_carry (vehicle_id, variant_id, qty, from_plan)
  select v.vehicle_id, (e ->> 'variant_id')::uuid, (e ->> 'qty')::int, (e ->> 'from_plan')::uuid from jsonb_array_elements(coalesce(v.carry_in, '[]')) e
   where (e ->> 'qty')::int > 0 and v.vehicle_id is not null
  on conflict (vehicle_id, variant_id) do update set qty = excluded.qty, from_plan = excluded.from_plan, updated_at = now();
  update public.route_day_plan set carry_in = null where id = p_plan;$x$);
  execute d;
  -- Trip screens: free godown stock, and what is waiting on this truck.
  d := pg_get_functiondef('public.trip_detail(uuid)'::regprocedure);
  d := replace(d, $x$'godown', coalesce(s.on_hand, 0),$x$,
                  $x$'godown', greatest(0, coalesce(s.on_hand, 0) - public._carry_qty(v.id)),
        'carry', case when p.status = 'planning' then coalesce((select vc.qty from public.vehicle_carry vc where vc.variant_id = v.id and vc.vehicle_id = p.vehicle_id and vc.from_plan <> p.id), 0) else 0 end,
        'carry_in', coalesce((select (e ->> 'qty')::int from jsonb_array_elements(coalesce(p.carry_in, '[]')) e where (e ->> 'variant_id')::uuid = v.id), 0),$x$);
  d := replace(d, $x$where (v.active and pk.active) or t.variant_id is not null$x$,
                  $x$where (v.active and pk.active) or t.variant_id is not null or exists (select 1 from public.vehicle_carry vc where vc.variant_id = v.id and vc.vehicle_id = p.vehicle_id)$x$);
  d := replace(d, $x$'short_cases', p.short_cases, 'close_note', p.close_note),$x$,
                  $x$'short_cases', p.short_cases, 'close_note', p.close_note,
      'carry_date', (select min(rp2.date) from public.vehicle_carry vc join public.route_day_plan rp2 on rp2.id = vc.from_plan where vc.vehicle_id = p.vehicle_id and vc.from_plan <> p.id),
      'kept', exists (select 1 from public.vehicle_carry vc where vc.from_plan = p.id)),$x$);
  execute d;
  d := pg_get_functiondef('public.trip_board(date)'::regprocedure);
  d := replace(d, $x$'vehicle_id', v.id, 'vehicle', v.name,$x$,
                  $x$'vehicle_id', v.id, 'vehicle', v.name, 'carry', coalesce((select sum(vc.qty) from public.vehicle_carry vc where vc.vehicle_id = v.id and vc.from_plan is distinct from p.id), 0),
      'kept', coalesce((select sum(vc.qty) from public.vehicle_carry vc where vc.from_plan = p.id), 0),$x$);
  execute d;
end $$;

revoke all on function public.trip_unload(uuid, jsonb, boolean), public.trip_load(uuid, uuid, jsonb, jsonb), public.truck_carry_release(uuid) from public, anon;
grant execute on function public.trip_unload(uuid, jsonb, boolean), public.trip_load(uuid, uuid, jsonb, jsonb), public.truck_carry_release(uuid) to authenticated;
