-- A route can now have several trips on the same day, one per vehicle (e.g. route C on Vehicle 2 and Vehicle 3).
-- Each trip has its own orders, loading, driver and end of day. At most one trip per route/day has no vehicle yet.
alter table public.route_day_plan drop constraint route_day_plan_route_id_date_key;
create unique index route_day_plan_route_date_vehicle on public.route_day_plan (route_id, date, coalesce(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index route_day_plan_route_date on public.route_day_plan (route_id, date);

-- Scheduled trips: only add one when the route has no trip at all that day.
create or replace function public.ensure_route_day_plans(p_days int default 14) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.route_day_plan (route_id, date)
  select r.id, d::date
  from public.route r
  cross join generate_series((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + p_days, interval '1 day') d
  where r.active and extract(isodow from d)::smallint = any (r.visit_days)
    and not exists (select 1 from public.route_day_plan p where p.route_id = r.id and p.date = d::date)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Get or create the trip for route + day + vehicle. With a vehicle: reuse that vehicle's trip, else give the
-- route's vehicle-less open trip that vehicle, else create a new trip. Without a vehicle: any trip of that route/day.
create or replace function public.add_delivery_day(p_route_id uuid, p_date date, p_vehicle_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Kolkata')::date or p_date > (now() at time zone 'Asia/Kolkata')::date + 14 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.route where id = p_route_id and active) then raise exception 'NOT_FOUND'; end if;
  if p_vehicle_id is null then
    select id into v_id from public.route_day_plan where route_id = p_route_id and date = p_date
     order by (status = 'planning') desc, (vehicle_id is null) desc, created_at limit 1;
    if v_id is null then
      insert into public.route_day_plan (route_id, date) values (p_route_id, p_date) returning id into v_id;
    end if;
    return v_id;
  end if;
  if not exists (select 1 from public.vehicle where id = p_vehicle_id and active) then raise exception 'VEHICLE_REQUIRED'; end if;
  select id into v_id from public.route_day_plan where route_id = p_route_id and date = p_date and vehicle_id = p_vehicle_id;
  if v_id is not null then return v_id; end if;
  update public.route_day_plan set vehicle_id = p_vehicle_id
   where id = (select id from public.route_day_plan where route_id = p_route_id and date = p_date and vehicle_id is null and status = 'planning' limit 1)
  returning id into v_id;
  if v_id is null then
    insert into public.route_day_plan (route_id, date, vehicle_id) values (p_route_id, p_date, p_vehicle_id) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Change the truck of one open trip. Refused if that truck already has a trip on this route and day
-- (move the orders instead).
create function public.set_trip_vehicle(p_plan_id uuid, p_vehicle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_plan public.route_day_plan;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_plan from public.route_day_plan where id = p_plan_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_plan.status <> 'planning' then raise exception 'ORDER_LOCKED'; end if;
  if p_vehicle_id is not null and not exists (select 1 from public.vehicle where id = p_vehicle_id and active) then raise exception 'VEHICLE_REQUIRED'; end if;
  if exists (select 1 from public.route_day_plan where route_id = v_plan.route_id and date = v_plan.date and id <> p_plan_id
             and coalesce(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid))
  then raise exception 'TRIP_EXISTS'; end if;
  update public.route_day_plan set vehicle_id = p_vehicle_id where id = p_plan_id;
end $$;
revoke execute on function public.set_trip_vehicle(uuid, uuid) from public, anon;
grant execute on function public.set_trip_vehicle(uuid, uuid) to authenticated;

-- lock_load sets the vehicle too; give a clear error instead of a unique-index failure.
do $outer$
declare d text; n text;
begin
  select pg_get_functiondef('public.lock_load(uuid, uuid, uuid, jsonb)'::regprocedure) into d;
  n := replace(d,
    'if not exists (select 1 from public.vehicle where id = p_vehicle_id and active) then raise exception ''VEHICLE_REQUIRED''; end if;',
    'if not exists (select 1 from public.vehicle where id = p_vehicle_id and active) then raise exception ''VEHICLE_REQUIRED''; end if;
  if exists (select 1 from public.route_day_plan where route_id = v_plan.route_id and date = v_plan.date and id <> p_plan_id and vehicle_id = p_vehicle_id) then raise exception ''TRIP_EXISTS''; end if;');
  if n = d then raise exception 'lock_load patch did not apply'; end if;
  execute n;
end $outer$;
