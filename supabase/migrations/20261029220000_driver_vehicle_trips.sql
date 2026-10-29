-- Vehicle logins: a driver sees every upcoming trip of his vehicle (dates and orders), can lock the load
-- for it himself, and then delivers it. Before, only trips locked with him chosen as driver were visible.

create function public.driver_vehicle_plan_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.route_day_plan
  where public.auth_role() = 'driver' and vehicle_id is not null and vehicle_id = public.auth_vehicle_id()
    and date between (now() at time zone 'Asia/Kolkata')::date - 1 and (now() at time zone 'Asia/Kolkata')::date + 14
$$;
revoke execute on function public.driver_vehicle_plan_ids() from public, anon;
grant execute on function public.driver_vehicle_plan_ids() to authenticated;

create policy plan_vehicle_read on public.route_day_plan for select to authenticated using (id in (select public.driver_vehicle_plan_ids()));
create policy orders_vehicle_read on public.orders for select to authenticated using (route_day_plan_id in (select public.driver_vehicle_plan_ids()));
create policy order_line_vehicle_read on public.order_line for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.route_day_plan_id in (select public.driver_vehicle_plan_ids())));
create policy load_line_vehicle_read on public.load_line for select to authenticated using (route_day_plan_id in (select public.driver_vehicle_plan_ids()));

-- Delivering: a loaded trip of his own vehicle counts as his, whoever was picked as driver.
create or replace function public.driver_plan_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.route_day_plan
  where (driver_id = auth.uid() or (vehicle_id is not null and vehicle_id = public.auth_vehicle_id() and public.auth_role() = 'driver'))
    and status in ('loaded', 'out') and date between (now() at time zone 'Asia/Kolkata')::date - 1 and (now() at time zone 'Asia/Kolkata')::date
$$;

-- lock_load: a driver may lock his own vehicle's trip (he becomes its driver).
do $outer$
declare d text; n text;
begin
  select pg_get_functiondef('public.lock_load(uuid, uuid, uuid, jsonb)'::regprocedure) into d;
  n := replace(d, 'if not public.is_staff() then raise exception ''FORBIDDEN''; end if;',
    'if not (public.is_staff() or (public.auth_role() = ''driver'' and p_driver_id = auth.uid() and p_vehicle_id = public.auth_vehicle_id()
      and exists (select 1 from public.route_day_plan where id = p_plan_id and vehicle_id = public.auth_vehicle_id()))) then raise exception ''FORBIDDEN''; end if;');
  if n = d then raise exception 'lock_load patch did not apply'; end if;
  execute n;
end $outer$;

-- Trucks are often loaded the evening before: a loaded trip for tomorrow is already the driver's.
create or replace function public.driver_plan_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.route_day_plan
  where (driver_id = auth.uid() or (vehicle_id is not null and vehicle_id = public.auth_vehicle_id() and public.auth_role() = 'driver'))
    and status in ('loaded', 'out') and date between (now() at time zone 'Asia/Kolkata')::date - 1 and (now() at time zone 'Asia/Kolkata')::date + 1
$$;
