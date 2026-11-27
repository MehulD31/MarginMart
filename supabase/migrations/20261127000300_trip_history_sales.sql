-- Add billed_paise, billed_bills, sold_cases to trip_history for vehicle sales visibility
CREATE OR REPLACE FUNCTION public.trip_history(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.is_staff() or coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user = 'postgres') then
    raise exception 'FORBIDDEN';
  end if;
  return coalesce((select jsonb_agg(x order by x->>'date' desc, x->>'loaded_at' desc nulls last) from (
    select jsonb_build_object(
      'id', p.id, 'date', p.date, 'status', p.status, 'route', r.name, 'vehicle', v.name,
      'driver', (select pr.name from public.profiles pr where pr.user_id = p.driver_id),
      'loaded', coalesce((select sum(l.qty_ordered_total + l.qty_spare) from public.load_line l where l.route_day_plan_id = p.id), 0),
      'returned', coalesce((select sum(l.qty_returned) from public.load_line l where l.route_day_plan_id = p.id), 0),
      'items', (select count(*) from public.load_line l where l.route_day_plan_id = p.id and l.qty_ordered_total + l.qty_spare > 0),
      'loaded_at', ld.at, 'loaded_by', (select pr.name from public.profiles pr where pr.user_id = ld.actor),
      'unloaded_at', p.unloaded_at, 'closed_at', p.closed_at, 'short_cases', p.short_cases,
      'billed_paise', coalesce((select sum(cs.total_paise) from public.cash_sale cs where cs.route_day_plan_id = p.id and cs.voided_at is null), 0),
      'billed_bills', coalesce((select count(*) from public.cash_sale cs where cs.route_day_plan_id = p.id and cs.voided_at is null), 0),
      'sold_cases', coalesce((select sum(l.qty_ordered_total + l.qty_spare - l.qty_returned) from public.load_line l where l.route_day_plan_id = p.id), 0)
    ) x
    from public.route_day_plan p
    join public.route r on r.id = p.route_id
    left join public.vehicle v on v.id = p.vehicle_id
    left join lateral (
      select a.at, a.actor from public.audit_log a
      where a.table_name = 'route_day_plan' and a.row_id = p.id::text and a.action = 'update'
        and a.before->>'status' = 'planning' and a.after->>'status' = 'loaded'
      order by a.id desc limit 1) ld on true
    where p.date between p_from and p_to and p.status <> 'planning'
  ) t), '[]'::jsonb);
end $function$;
