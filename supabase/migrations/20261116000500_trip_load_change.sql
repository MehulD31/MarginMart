-- Change the load of a truck after it was loaded, even after selling has started (a forgotten item can be added).
-- p_lines is the full wanted load (whole cases). Nothing can go below what is already sold or delivered.
create or replace function public.trip_load_change(p_plan uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.route_day_plan; r record; w int; s numeric; o int;
  v_add int := 0; v_rem int := 0;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v from public.route_day_plan where id = p_plan for update;
  if v.id is null then raise exception 'NOT_FOUND'; end if;
  if v.status not in ('loaded', 'out') or v.unloaded_at is not null then raise exception 'TRIP_CLOSED'; end if;
  if jsonb_typeof(p_lines) <> 'array' or exists (
       select 1 from jsonb_array_elements(p_lines) e left join public.variant x on x.id = (e ->> 'variant_id')::uuid
       where x.id is null or (e ->> 'qty') !~ '^\d{1,4}$')
     or (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_lines) e)
  then raise exception 'INVALID_INPUT'; end if;

  for r in
    select coalesce(t.variant_id, (e ->> 'variant_id')::uuid) vid, coalesce((e ->> 'qty')::int, 0) want,
           coalesce(t.loaded, 0) loaded, coalesce(t.billed, 0) billed, coalesce(t.delivered, 0) delivered
      from public._trip_left(p_plan) t
      full join jsonb_array_elements(p_lines) e on (e ->> 'variant_id')::uuid = t.variant_id
  loop
    w := r.want;
    if w = r.loaded then continue; end if;
    s := ceil(r.billed) + r.delivered;
    if w < s then raise exception 'BELOW_SOLD'; end if;
    if w > r.loaded and (w - r.loaded) > coalesce((select on_hand from public.stock where variant_id = r.vid), 0) - public._carry_qty(r.vid, v.vehicle_id)
    then raise exception 'NOT_ENOUGH_STOCK'; end if;

    select coalesce(sum(ol.qty_ordered), 0)::int into o
      from public.orders od join public.order_line ol on ol.order_id = od.id
     where od.route_day_plan_id = p_plan and od.status in ('locked', 'delivered', 'partially_delivered') and ol.variant_id = r.vid;
    if exists (select 1 from public.load_line where route_day_plan_id = p_plan and variant_id = r.vid) then
      if w = 0 then
        delete from public.load_line where route_day_plan_id = p_plan and variant_id = r.vid;
      else
        update public.load_line set qty_ordered_total = least(w, o), qty_spare = w - least(w, o)
         where route_day_plan_id = p_plan and variant_id = r.vid;
      end if;
    else
      insert into public.load_line (route_day_plan_id, variant_id, qty_ordered_total, qty_spare) values (p_plan, r.vid, least(w, o), w - least(w, o));
    end if;
    insert into public.stock_move (variant_id, qty, kind, route_day_plan_id, reason)
    values (r.vid, -(w - r.loaded), (case when w > r.loaded then 'load_out' else 'load_undo' end)::public.stock_move_kind, p_plan, 'Load changed after loading');
    if w > r.loaded then v_add := v_add + (w - r.loaded); else v_rem := v_rem + (r.loaded - w); end if;
  end loop;

  insert into public.audit_log (actor, table_name, row_id, action, after)
  values (auth.uid(), 'route_day_plan', p_plan, 'trip_load_change', jsonb_build_object('added', v_add, 'removed', v_rem));
  return jsonb_build_object('plan_id', p_plan, 'added', v_add, 'removed', v_rem);
end $$;

revoke all on function public.trip_load_change(uuid, jsonb) from public, anon;
grant execute on function public.trip_load_change(uuid, jsonb) to authenticated, service_role;
