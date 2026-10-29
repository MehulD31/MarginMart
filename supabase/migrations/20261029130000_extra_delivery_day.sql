-- Admin can add a delivery on any day (e.g. today) for a route, even if the route does not
-- normally visit that day. Creates the route-day plan if missing; returns its id.
-- The plan then flows through orders -> loading -> delivery -> end of day like any other.
create function public.add_delivery_day(p_route_id uuid, p_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Kolkata')::date or p_date > (now() at time zone 'Asia/Kolkata')::date + 14 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.route where id = p_route_id and active) then raise exception 'NOT_FOUND'; end if;
  insert into public.route_day_plan (route_id, date) values (p_route_id, p_date) on conflict (route_id, date) do nothing;
  select id into v_id from public.route_day_plan where route_id = p_route_id and date = p_date;
  return v_id;
end $$;
revoke execute on function public.add_delivery_day(uuid, date) from public, anon;
grant execute on function public.add_delivery_day(uuid, date) to authenticated;
