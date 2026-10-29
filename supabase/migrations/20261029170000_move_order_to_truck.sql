-- Admin: put an open order on another truck for the same day. Uses that truck's trip on the order's route,
-- or starts a new trip for it (never takes over another trip).
create function public.move_order_to_truck(p_order_id uuid, p_vehicle_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_from public.route_day_plan; v_to uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.status <> 'placed' then raise exception 'ORDER_LOCKED'; end if;
  if not exists (select 1 from public.vehicle where id = p_vehicle_id and active) then raise exception 'VEHICLE_REQUIRED'; end if;
  select * into v_from from public.route_day_plan where id = v_order.route_day_plan_id;
  if v_from.vehicle_id = p_vehicle_id then return v_from.id; end if;
  select id into v_to from public.route_day_plan where route_id = v_from.route_id and date = v_from.date and vehicle_id = p_vehicle_id;
  if v_to is null then
    insert into public.route_day_plan (route_id, date, vehicle_id) values (v_from.route_id, v_from.date, p_vehicle_id) returning id into v_to;
  end if;
  perform public.move_order(p_order_id, v_to);
  return v_to;
end $$;
revoke execute on function public.move_order_to_truck(uuid, uuid) from public, anon;
grant execute on function public.move_order_to_truck(uuid, uuid) to authenticated;
