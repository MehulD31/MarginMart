-- Once a later trip of the same truck has taken over the leftover, yesterday's unload can no longer be undone or corrected
-- (the cases are already on the road; changing stock now would count them twice).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.trip_undo_unload(uuid)'::regprocedure);
  d := replace(d, $x$if v.status not in ('loaded', 'out') or v.unloaded_at is null then raise exception 'PLAN_NOT_OUT'; end if;$x$,
    $x$if v.status not in ('loaded', 'out') or v.unloaded_at is null then raise exception 'PLAN_NOT_OUT'; end if;
  if exists (select 1 from public.route_day_plan n, jsonb_array_elements(coalesce(n.carry_in, '[]')) e where n.vehicle_id = v.vehicle_id and e ->> 'from_plan' = p_plan::text) then raise exception 'CARRY_USED'; end if;$x$);
  execute d;
  d := pg_get_functiondef('public.trip_unload(uuid, jsonb, boolean)'::regprocedure);
  d := replace(d, $x$if v.status not in ('loaded', 'out') then raise exception 'PLAN_NOT_OUT'; end if;$x$,
    $x$if v.status not in ('loaded', 'out') then raise exception 'PLAN_NOT_OUT'; end if;
  if exists (select 1 from public.route_day_plan n, jsonb_array_elements(coalesce(n.carry_in, '[]')) e where n.vehicle_id = v.vehicle_id and e ->> 'from_plan' = p_plan::text) then raise exception 'CARRY_USED'; end if;$x$);
  execute d;
end $$;
