-- Admin: move an open order to another open trip (any route, any day), e.g. onto a different truck.
create function public.move_order(p_order_id uuid, p_plan_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_plan public.route_day_plan;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.status <> 'placed' then raise exception 'ORDER_LOCKED'; end if;
  select * into v_plan from public.route_day_plan where id = p_plan_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_plan.status <> 'planning' then raise exception 'ORDER_LOCKED'; end if;
  if v_plan.id = v_order.route_day_plan_id then return; end if;
  if exists (select 1 from public.orders where shop_id = v_order.shop_id and route_day_plan_id = p_plan_id and status = 'placed') then raise exception 'ORDER_EXISTS'; end if;
  update public.orders set route_day_plan_id = p_plan_id, updated_at = now() where id = p_order_id;
end $$;
revoke execute on function public.move_order(uuid, uuid) from public, anon;
grant execute on function public.move_order(uuid, uuid) to authenticated;
