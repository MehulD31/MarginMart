-- Staff: start an (empty) trip for a truck on a route and day, e.g. to load stock/spares with no orders yet.
-- Returns the truck's existing trip if there is one. Never takes over another trip.
create function public.start_truck_trip(p_route_id uuid, p_date date, p_vehicle_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Kolkata')::date or p_date > (now() at time zone 'Asia/Kolkata')::date + 14 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.route where id = p_route_id and active) then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from public.vehicle where id = p_vehicle_id and active) then raise exception 'VEHICLE_REQUIRED'; end if;
  select id into v_id from public.route_day_plan where route_id = p_route_id and date = p_date and vehicle_id = p_vehicle_id;
  if v_id is null then
    insert into public.route_day_plan (route_id, date, vehicle_id) values (p_route_id, p_date, p_vehicle_id) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke execute on function public.start_truck_trip(uuid, date, uuid) from public, anon;
grant execute on function public.start_truck_trip(uuid, date, uuid) to authenticated;
