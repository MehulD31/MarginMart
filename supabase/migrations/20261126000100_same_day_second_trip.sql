-- Allow a vehicle to do multiple trips on the same day once its previous trip is closed.
drop index if exists public.route_day_plan_route_date_vehicle;
create unique index route_day_plan_route_date_vehicle
  on public.route_day_plan (route_id, date, coalesce(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status <> 'closed';

drop function if exists public.trip_open(uuid, date);

create or replace function public.trip_open(p_vehicle uuid, p_date date, p_new boolean default false) returns uuid
language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_route uuid; v_dow int := extract(dow from p_date);
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Kolkata')::date - 1 or p_date > (now() at time zone 'Asia/Kolkata')::date + 14 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.vehicle where id = p_vehicle and active) then raise exception 'VEHICLE_REQUIRED'; end if;

  if p_new then
    -- If there is already an open trip for this vehicle today, reuse it rather than opening two active trips at once.
    select p.id into v_id
      from public.route_day_plan p
      left join public.route r on r.id = p.route_id
     where p.date = p_date and coalesce(p.vehicle_id, r.default_vehicle_id) = p_vehicle and p.status <> 'closed'
     order by p.created_at desc limit 1;
    if v_id is not null then
      update public.route_day_plan set vehicle_id = p_vehicle where id = v_id and vehicle_id is null;
      return v_id;
    end if;
  else
    v_id := public._trip_of(p_vehicle, p_date);
    if v_id is not null then
      update public.route_day_plan set vehicle_id = p_vehicle where id = v_id and vehicle_id is null;
      return v_id;
    end if;
  end if;

  select id into v_route from public.route where active and default_vehicle_id = p_vehicle and v_dow = any(visit_days) order by name limit 1;
  if v_route is null then select id into v_route from public.route where name = 'Direct sales' limit 1; end if;
  insert into public.route_day_plan (route_id, date, vehicle_id) values (v_route, p_date, p_vehicle)
  on conflict do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.route_day_plan where route_id = v_route and date = p_date and vehicle_id = p_vehicle and status <> 'closed' order by created_at desc limit 1;
  end if;
  return v_id;
end $$;

revoke all on function public.trip_open(uuid, date, boolean) from public, anon;
grant execute on function public.trip_open(uuid, date, boolean) to authenticated, service_role;
