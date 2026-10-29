create or replace function public.expected_returns(p_plan_id uuid)
returns table (variant_id uuid, loaded int, delivered int, expected int)
language sql stable security definer set search_path = '' as $$
  select ll.variant_id, (ll.qty_ordered_total + ll.qty_spare)::int,
         coalesce(d.qty, 0)::int, (ll.qty_ordered_total + ll.qty_spare - coalesce(d.qty, 0))::int
  from public.load_line ll
  left join (select dl.variant_id, sum(dl.qty_delivered) qty from public.delivery_line dl
             join public.orders o on o.id = dl.order_id where o.route_day_plan_id = p_plan_id group by 1) d on d.variant_id = ll.variant_id
  where ll.route_day_plan_id = p_plan_id
    and (public.is_staff() or p_plan_id in (select public.driver_plan_ids()))
$$;
