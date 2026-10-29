-- Trips stay route + date, but the admin can put any shop's order on any open trip (e.g. an urgent shop
-- from another route rides on today's Gaadi 1). The truck then serves its route's shops plus those extra shops.
-- A shop is "on" a trip if it is on the trip's route OR has an order on that trip.

-- Helpers (security definer, so policies don't recurse through orders <-> plans <-> shops).
create function public.driver_shop_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select s.id from public.shop s where s.route_id in (select public.driver_route_ids())
  union
  select o.shop_id from public.orders o where o.route_day_plan_id in (select public.driver_plan_ids())
$$;
create function public.shop_plan_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select route_day_plan_id from public.orders where shop_id = public.auth_shop_id()
$$;
revoke execute on function public.driver_shop_ids(), public.shop_plan_ids() from public, anon;
grant execute on function public.driver_shop_ids(), public.shop_plan_ids() to authenticated;

-- Drivers see (and collect dues from) extra shops on their trip too.
drop policy shop_driver_read on public.shop;
create policy shop_driver_read on public.shop for select to authenticated using (id in (select public.driver_shop_ids()));
drop policy ledger_read on public.ledger_entry;
create policy ledger_read on public.ledger_entry for select to authenticated using (
  (select public.is_staff()) or shop_id = (select public.auth_shop_id()) or shop_id in (select public.driver_shop_ids()));
-- A shop sees the trips its orders are on (order history shows the delivery date).
create policy plan_shop_order_read on public.route_day_plan for select to authenticated using (id in (select public.shop_plan_ids()));

-- One condition changes in each of save_order, record_delivery and record_payment. Patched in place and
-- asserted, so the rest of each function stays exactly as in M5.
do $outer$
declare d text; n text;
begin
  -- save_order: staff passing a plan no longer need it to be the shop's own route.
  select pg_get_functiondef('public.save_order(jsonb, uuid, uuid)'::regprocedure) into d;
  n := replace(d,
    'select p.* into v_plan from public.route_day_plan p join public.shop s on s.route_id = p.route_id
     where p.id = p_plan_id and s.id = v_shop;',
    'select p.* into v_plan from public.route_day_plan p where p.id = p_plan_id;');
  if n = d then raise exception 'save_order patch did not apply'; end if;
  execute n;
  -- record_delivery: the shop may be on the route or have an order on the trip.
  select pg_get_functiondef('public.record_delivery(uuid, uuid, uuid, jsonb, jsonb)'::regprocedure) into d;
  n := replace(d,
    'if not exists (select 1 from public.shop where id = p_shop_id and route_id = v_plan.route_id) then',
    'if not (exists (select 1 from public.shop where id = p_shop_id and route_id = v_plan.route_id)
          or exists (select 1 from public.orders where shop_id = p_shop_id and route_day_plan_id = p_plan_id and status <> ''cancelled'')) then');
  if n = d then raise exception 'record_delivery patch did not apply'; end if;
  execute n;
  -- record_payment (driver): same rule for finding the driver's trip.
  select pg_get_functiondef('public.record_payment(uuid, uuid, text, bigint, text, text)'::regprocedure) into d;
  n := replace(d,
    'where s.id = p_shop_id and p.id in (select public.driver_plan_ids()) limit 1;',
    'where s.id = p_shop_id and p.id in (select public.driver_plan_ids()) limit 1;
    if v_plan is null then
      select o.route_day_plan_id into v_plan from public.orders o
       where o.shop_id = p_shop_id and o.route_day_plan_id in (select public.driver_plan_ids()) limit 1;
    end if;');
  if n = d then raise exception 'record_payment patch did not apply'; end if;
  execute n;
end $outer$;

-- Admin: add a trip for any route on any day in the next two weeks, optionally pre-setting its vehicle.
drop function public.add_delivery_day(uuid, date);
create function public.add_delivery_day(p_route_id uuid, p_date date, p_vehicle_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Kolkata')::date or p_date > (now() at time zone 'Asia/Kolkata')::date + 14 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.route where id = p_route_id and active) then raise exception 'NOT_FOUND'; end if;
  if p_vehicle_id is not null and not exists (select 1 from public.vehicle where id = p_vehicle_id and active) then raise exception 'VEHICLE_REQUIRED'; end if;
  insert into public.route_day_plan (route_id, date) values (p_route_id, p_date) on conflict (route_id, date) do nothing;
  select id into v_id from public.route_day_plan where route_id = p_route_id and date = p_date;
  if p_vehicle_id is not null then
    update public.route_day_plan set vehicle_id = p_vehicle_id where id = v_id and status = 'planning';
  end if;
  return v_id;
end $$;
revoke execute on function public.add_delivery_day(uuid, date, uuid) from public, anon;
grant execute on function public.add_delivery_day(uuid, date, uuid) to authenticated;
