-- Pieces, not only whole cases: a crate of 24 cans can sell 18 and bring 6 back.
-- Quantities become fractional cases (numeric, 6 decimals): 18 of 24 cans = 0.75, 15 of 30 = 0.5. Every existing report that does
-- qty * price keeps working by itself. Each piece quantity must be a whole number of pieces (checked against the pack's units_per_case).
-- Advance orders, loading and purchases stay in whole cases. Only parchis (truck + counter) and "came back" can have pieces.
-- Pieces that come back go to the godown stock (not carried on the truck); only whole cases stay on the truck for tomorrow.

alter table public.cash_sale_line drop constraint if exists cash_sale_line_qty_check;
alter table public.cash_sale_line alter column qty type numeric(12,6);
alter table public.cash_sale_line add constraint cash_sale_line_qty_check check (qty > 0 and qty <= 9999);
alter table public.stock_move alter column qty type numeric(12,6);
alter table public.stock_move alter column balance_after type numeric(12,6);
alter table public.stock alter column on_hand type numeric(12,6);
alter table public.load_line alter column qty_returned type numeric(12,6);

-- stock moves take pieces too
drop function if exists public._cash_sale_stock(uuid, uuid, integer, text);
create or replace function public._cash_sale_stock(p_sale uuid, p_variant uuid, p_out numeric, p_reason text) returns void
language plpgsql security definer set search_path to '' as $function$
begin
  if p_out = 0 then return; end if;
  insert into public.stock_move (variant_id, qty, kind, reason, cash_sale_id)
  values (p_variant, -p_out, case when p_out > 0 then 'sale' else 'adjust' end::public.stock_move_kind, left(p_reason, 200), p_sale);
end $function$;
revoke all on function public._cash_sale_stock(uuid, uuid, numeric, text) from public, anon, authenticated;

-- what is left on a truck, in cases with pieces
drop function if exists public._trip_left(uuid);
create function public._trip_left(p_plan uuid)
returns table (variant_id uuid, loaded int, returned numeric, delivered int, billed numeric, left_qty numeric)
language sql stable security definer set search_path to '' as $$
  with ids as (
    select ll.variant_id from public.load_line ll where ll.route_day_plan_id = p_plan
    union select dl.variant_id from public.delivery_line dl join public.orders o on o.id = dl.order_id where o.route_day_plan_id = p_plan
    union select l.variant_id from public.cash_sale_line l join public.cash_sale c on c.id = l.cash_sale_id where c.route_day_plan_id = p_plan and c.voided_at is null),
  t as (
    select i.variant_id,
      coalesce((select ll.qty_ordered_total + ll.qty_spare from public.load_line ll where ll.route_day_plan_id = p_plan and ll.variant_id = i.variant_id), 0)::int loaded,
      coalesce((select ll.qty_returned from public.load_line ll where ll.route_day_plan_id = p_plan and ll.variant_id = i.variant_id), 0)::numeric returned,
      coalesce((select sum(dl.qty_delivered) from public.delivery_line dl join public.orders o on o.id = dl.order_id where o.route_day_plan_id = p_plan and dl.variant_id = i.variant_id), 0)::int delivered,
      coalesce((select sum(l.qty) from public.cash_sale_line l join public.cash_sale c on c.id = l.cash_sale_id where c.route_day_plan_id = p_plan and c.voided_at is null and l.variant_id = i.variant_id), 0)::numeric billed
    from ids i)
  select t.variant_id, t.loaded, t.returned, t.delivered, t.billed, (t.loaded - t.returned - t.delivered - t.billed) from t
$$;
revoke all on function public._trip_left(uuid) from public, anon, authenticated;

do $$
declare d text; w regprocedure;
  frac text := $f$abs(((e ->> 'qty')::numeric) * k.units_per_case - round(((e ->> 'qty')::numeric) * k.units_per_case)) > 0.01$f$;
begin
  -- stock_watch returns on_hand as numeric
  select p.oid::regprocedure into w from pg_proc p where p.proname = '_stock_watch' and p.pronamespace = 'public'::regnamespace;
  d := pg_get_functiondef(w);
  if position('on_hand integer' in d) = 0 then raise exception 'stock_watch pattern missing'; end if;
  d := replace(d, 'on_hand integer', 'on_hand numeric');
  execute 'drop function ' || w::text;
  execute d;

  -- counter_sale_save: decimals allowed, whole pieces only, truck limit in numeric
  d := pg_get_functiondef('public.counter_sale_save(uuid, uuid, uuid, text, jsonb, bigint, uuid)'::regprocedure);
  if position($x$(e ->> 'qty') !~ '^\d{1,4}$' or (e ->> 'qty')::int < 1$x$ in d) = 0 then raise exception 'counter_sale_save regex pattern missing'; end if;
  d := replace(d, $x$(e ->> 'qty') !~ '^\d{1,4}$' or (e ->> 'qty')::int < 1$x$, $x$(e ->> 'qty') !~ '^\d{1,4}(\.\d{1,6})?$' or (e ->> 'qty')::numeric <= 0$x$);
  d := replace(d, $x$(e ->> 'qty')::int qty$x$, $x$(e ->> 'qty')::numeric qty$x$);
  if position($x$(e ->> 'qty')::int > coalesce(t.left_qty, 0)$x$ in d) = 0 then raise exception 'counter_sale_save truck pattern missing'; end if;
  d := replace(d, $x$(e ->> 'qty')::int > coalesce(t.left_qty, 0)$x$, $x$(e ->> 'qty')::numeric > coalesce(t.left_qty, 0)$x$);
  if position($x$  select left(name, 60) into v_by from public.profiles$x$ in d) = 0 then raise exception 'counter_sale_save anchor missing'; end if;
  d := replace(d, $x$  select left(name, 60) into v_by from public.profiles$x$,
    $x$  if exists (select 1 from jsonb_array_elements(p_lines) e join public.variant vv on vv.id = (e ->> 'variant_id')::uuid join public.pack k on k.id = vv.pack_id where $x$ || frac || $x$) then raise exception 'INVALID_INPUT'; end if;
  select left(name, 60) into v_by from public.profiles$x$);
  execute d;

  -- trip_unload: came-back pieces; only whole cases stay on the truck
  d := pg_get_functiondef('public.trip_unload(uuid, jsonb, boolean)'::regprocedure);
  if position($x$(e ->> 'qty') !~ '^\d{1,4}$'$x$ in d) = 0 then raise exception 'trip_unload regex pattern missing'; end if;
  d := replace(d, $x$(e ->> 'qty') !~ '^\d{1,4}$'$x$, $x$(e ->> 'qty') !~ '^\d{1,4}(\.\d{1,6})?$'$x$);
  if position('v_new int; v_back int := 0;' in d) = 0 then raise exception 'trip_unload declare missing'; end if;
  d := replace(d, 'v_new int; v_back int := 0;', 'v_new numeric; v_back numeric := 0;');
  d := replace(d, $x$(select (e ->> 'qty')::int from jsonb_array_elements(p_returned) e$x$, $x$(select (e ->> 'qty')::numeric from jsonb_array_elements(p_returned) e$x$);
  if position($x$select v.vehicle_id, variant_id, qty_returned, p_plan from public.load_line where route_day_plan_id = p_plan and qty_returned > 0$x$ in d) = 0 then raise exception 'trip_unload carry missing'; end if;
  d := replace(d, $x$select v.vehicle_id, variant_id, qty_returned, p_plan from public.load_line where route_day_plan_id = p_plan and qty_returned > 0$x$,
    $x$select v.vehicle_id, variant_id, floor(qty_returned)::int, p_plan from public.load_line where route_day_plan_id = p_plan and qty_returned >= 1$x$);
  if position($x$  for r in select ll.*, t.delivered, t.billed from public.load_line ll$x$ in d) = 0 then raise exception 'trip_unload loop anchor missing'; end if;
  d := replace(d, $x$  for r in select ll.*, t.delivered, t.billed from public.load_line ll$x$,
    $x$  if exists (select 1 from jsonb_array_elements(p_returned) e join public.variant vv on vv.id = (e ->> 'variant_id')::uuid join public.pack k on k.id = vv.pack_id where $x$ || frac || $x$) then raise exception 'INVALID_INPUT'; end if;
  for r in select ll.*, t.delivered, t.billed from public.load_line ll$x$);
  execute d;

  -- closing a trip: no truncation of pieces
  d := pg_get_functiondef('public.plan_stock_sync()'::regprocedure);
  if position('-sum(qty)::int' in d) = 0 then raise exception 'plan_stock_sync pattern missing'; end if;
  d := replace(d, '-sum(qty)::int', '-sum(qty)');
  execute d;
end $$;

-- the screens need to know how many pieces make a case
do $$
declare d text;
begin
  d := pg_get_functiondef('public.trip_detail(uuid)'::regprocedure);
  if position('''units''' in d) = 0 then
    if position($x$'variant_id', v.id, 'label', public._item_label(v.id),$x$ in d) = 0 then raise exception 'trip_detail anchor missing'; end if;
    d := replace(d, $x$'variant_id', v.id, 'label', public._item_label(v.id),$x$, $x$'variant_id', v.id, 'label', public._item_label(v.id), 'units', pk.units_per_case,$x$);
    execute d;
  end if;
end $$;
