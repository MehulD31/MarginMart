-- Driver delivers a shop's later order today ("pull it forward") instead of selling it again as a van sale,
-- so the shop is not served twice. The order moves onto the trip being delivered.
--   from an open trip (not loaded): its cases must be free as spare on today's truck; spare becomes ordered.
--   from a loaded trip of the same vehicle: its cases move from that trip's load to today's load.
create function public.driver_pull_order(p_order_id uuid, p_plan_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_from public.route_day_plan; v_to public.route_day_plan; l record; v_spare int;
begin
  select * into v_to from public.route_day_plan where id = p_plan_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or p_plan_id in (select public.driver_plan_ids())) then raise exception 'FORBIDDEN'; end if;
  if v_to.status not in ('loaded', 'out') then raise exception 'PLAN_NOT_OUT'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.route_day_plan_id = p_plan_id then return; end if;
  if v_order.status not in ('placed', 'locked') then raise exception 'ORDER_LOCKED'; end if;
  if exists (select 1 from public.orders where shop_id = v_order.shop_id and route_day_plan_id = p_plan_id and status in ('placed', 'locked')) then raise exception 'ORDER_EXISTS'; end if;
  select * into v_from from public.route_day_plan where id = v_order.route_day_plan_id for update;

  if v_order.status = 'placed' then
    if v_from.status <> 'planning' then raise exception 'ORDER_LOCKED'; end if;
    for l in select variant_id, qty_ordered from public.order_line where order_id = p_order_id loop
      select qty_spare into v_spare from public.load_line where route_day_plan_id = p_plan_id and variant_id = l.variant_id for update;
      if coalesce(v_spare, 0) < l.qty_ordered then raise exception 'NOT_ON_TRUCK'; end if;
      update public.load_line set qty_spare = qty_spare - l.qty_ordered, qty_ordered_total = qty_ordered_total + l.qty_ordered
       where route_day_plan_id = p_plan_id and variant_id = l.variant_id;
    end loop;
  else
    -- Already loaded for its own day: only if it is on the same truck.
    if v_from.vehicle_id is distinct from v_to.vehicle_id or v_from.status not in ('loaded', 'out') then raise exception 'ORDER_LOCKED'; end if;
    for l in select variant_id, qty_ordered from public.order_line where order_id = p_order_id loop
      update public.load_line set qty_ordered_total = greatest(qty_ordered_total - l.qty_ordered, 0)
       where route_day_plan_id = v_from.id and variant_id = l.variant_id;
      insert into public.load_line (route_day_plan_id, variant_id, qty_ordered_total) values (p_plan_id, l.variant_id, l.qty_ordered)
      on conflict (route_day_plan_id, variant_id) do update set qty_ordered_total = public.load_line.qty_ordered_total + excluded.qty_ordered_total;
    end loop;
  end if;
  update public.orders set route_day_plan_id = p_plan_id, status = 'locked', updated_at = now() where id = p_order_id;
end $$;
revoke execute on function public.driver_pull_order(uuid, uuid) from public, anon;
grant execute on function public.driver_pull_order(uuid, uuid) to authenticated;

-- The driver needs to see his shops' upcoming orders (to pull them forward), on any trip.
create function public.driver_upcoming_orders(p_plan_id uuid) returns table (order_id uuid, shop_id uuid, plan_id uuid, date date, status public.order_status, vehicle_id uuid, cases bigint, lines jsonb)
language sql stable security definer set search_path = '' as $$
  select o.id, o.shop_id, p.id, p.date, o.status, p.vehicle_id, sum(l.qty_ordered),
         jsonb_agg(jsonb_build_object('variant_id', l.variant_id, 'qty', l.qty_ordered))
  from public.orders o join public.route_day_plan p on p.id = o.route_day_plan_id join public.order_line l on l.order_id = o.id
  where public.auth_role() in ('driver', 'admin', 'manager') and o.status in ('placed', 'locked')
    and p.date between (now() at time zone 'Asia/Kolkata')::date and (now() at time zone 'Asia/Kolkata')::date + 7
    and p.id <> p_plan_id
    and (public.is_staff() or o.shop_id in (select s.id from public.shop s where s.active))
  group by o.id, o.shop_id, p.id, p.date, o.status, p.vehicle_id
$$;
revoke execute on function public.driver_upcoming_orders(uuid) from public, anon;
grant execute on function public.driver_upcoming_orders(uuid) to authenticated;
