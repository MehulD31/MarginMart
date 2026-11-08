-- Vehicle trips: morning load from the godown -> evening unload (what came back) -> bill the parchis from the truck -> close.
-- A trip is a route_day_plan (so advance orders, the driver app and End of day keep working).
--   left on truck = loaded - came back - delivered (advance orders) - billed (truck counter sales)
-- Truck bills are counter sales with route_day_plan_id set: they never take stock from the godown again (it left at loading).
-- Close: anything still "left" is a shortage; it needs a reason and is reported in the nightly Telegram report.

alter table public.route_day_plan add column if not exists unloaded_at timestamptz;
alter table public.route_day_plan add column if not exists closed_at timestamptz;
alter table public.route_day_plan add column if not exists short_cases int not null default 0;
alter table public.route_day_plan add column if not exists close_note text;
alter table public.cash_sale add column if not exists route_day_plan_id uuid references public.route_day_plan(id);
create index if not exists cash_sale_plan on public.cash_sale (route_day_plan_id) where route_day_plan_id is not null;

-- Stock on close: only what has not already been unloaded goes back (unloading now moves stock straight away).
create or replace function public.plan_stock_sync() returns trigger
language plpgsql security definer set search_path to '' as $function$
begin
  if old.status = 'planning' and new.status = 'loaded' then
    insert into public.stock_move (variant_id, qty, kind, route_day_plan_id)
    select variant_id, -(qty_ordered_total + qty_spare), 'load_out', new.id
      from public.load_line where route_day_plan_id = new.id and qty_ordered_total + qty_spare > 0;
  elsif old.status = 'loaded' and new.status = 'planning' then
    insert into public.stock_move (variant_id, qty, kind, route_day_plan_id)
    select variant_id, -sum(qty)::int, 'load_undo', new.id from public.stock_move
     where route_day_plan_id = new.id and kind in ('load_out', 'load_undo') group by 1 having sum(qty) <> 0;
  elsif new.status = 'closed' and old.status <> 'closed' then
    insert into public.stock_move (variant_id, qty, kind, route_day_plan_id)
    select ll.variant_id, ll.qty_returned - coalesce(m.q, 0), case when ll.qty_returned - coalesce(m.q, 0) > 0 then 'return_in' else 'return_undo' end::public.stock_move_kind, new.id
      from public.load_line ll
      left join (select variant_id, sum(qty) q from public.stock_move where route_day_plan_id = new.id and kind in ('return_in', 'return_undo') group by 1) m on m.variant_id = ll.variant_id
     where ll.route_day_plan_id = new.id and ll.qty_returned - coalesce(m.q, 0) <> 0;
  elsif old.status = 'closed' and new.status <> 'closed' then
    insert into public.stock_move (variant_id, qty, kind, route_day_plan_id)
    select variant_id, -sum(qty)::int, 'return_undo', new.id from public.stock_move
     where route_day_plan_id = new.id and kind in ('return_in', 'return_undo') group by 1 having sum(qty) <> 0;
  end if;
  return new;
end $function$;

/** Per item on a trip: loaded, came back, delivered (advance orders), billed (truck bills), left on truck. */
create or replace function public._trip_left(p_plan uuid)
returns table (variant_id uuid, loaded int, returned int, delivered int, billed int, left_qty int)
language sql stable security definer set search_path to '' as $$
  with ids as (
    select ll.variant_id from public.load_line ll where ll.route_day_plan_id = p_plan
    union select dl.variant_id from public.delivery_line dl join public.orders o on o.id = dl.order_id where o.route_day_plan_id = p_plan
    union select l.variant_id from public.cash_sale_line l join public.cash_sale c on c.id = l.cash_sale_id where c.route_day_plan_id = p_plan and c.voided_at is null),
  t as (
    select i.variant_id,
      coalesce((select ll.qty_ordered_total + ll.qty_spare from public.load_line ll where ll.route_day_plan_id = p_plan and ll.variant_id = i.variant_id), 0)::int loaded,
      coalesce((select ll.qty_returned from public.load_line ll where ll.route_day_plan_id = p_plan and ll.variant_id = i.variant_id), 0)::int returned,
      coalesce((select sum(dl.qty_delivered) from public.delivery_line dl join public.orders o on o.id = dl.order_id where o.route_day_plan_id = p_plan and dl.variant_id = i.variant_id), 0)::int delivered,
      coalesce((select sum(l.qty) from public.cash_sale_line l join public.cash_sale c on c.id = l.cash_sale_id where c.route_day_plan_id = p_plan and c.voided_at is null and l.variant_id = i.variant_id), 0)::int billed
    from ids i)
  select t.variant_id, t.loaded, t.returned, t.delivered, t.billed, (t.loaded - t.returned - t.delivered - t.billed)::int from t
$$;
revoke all on function public._trip_left(uuid) from public, anon, authenticated;

create or replace function public._item_label(p_variant uuid) returns text
language sql stable security definer set search_path to '' as $$
  select case when v.flavour_en = p.name_en or coalesce(v.flavour_en, '') = '' then p.name_en else p.name_en || ' (' || v.flavour_en || ')' end
    from public.variant v join public.pack p on p.id = v.pack_id where v.id = p_variant
$$;
revoke all on function public._item_label(uuid) from public, anon, authenticated;

/** The trip a vehicle is on (or should be on) that day. */
create or replace function public._trip_of(p_vehicle uuid, p_date date) returns uuid
language sql stable security definer set search_path to '' as $$
  select p.id from public.route_day_plan p join public.route r on r.id = p.route_id
   where p.date = p_date and coalesce(p.vehicle_id, r.default_vehicle_id) = p_vehicle
   order by (p.status = 'closed'), p.created_at desc limit 1
$$;
revoke all on function public._trip_of(uuid, date) from public, anon, authenticated;

/** One card per active vehicle for that day: its trip, status, counters, the next step. */
create or replace function public.trip_board(p_date date) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(x order by x->>'vehicle') from (
    select jsonb_build_object(
      'vehicle_id', v.id, 'vehicle', v.name, 'capacity', v.capacity_cases,
      'plan_id', p.id, 'route', r.name, 'status', p.status, 'driver', d.name,
      'loaded_at', (select min(m.at) from public.stock_move m where m.route_day_plan_id = p.id and m.kind = 'load_out'),
      'unloaded_at', p.unloaded_at, 'closed_at', p.closed_at, 'short_cases', p.short_cases, 'close_note', p.close_note,
      'orders', (select count(*) from public.orders o where o.route_day_plan_id = p.id and o.status <> 'cancelled'),
      'ordered_cases', coalesce((select sum(ol.qty_ordered) from public.orders o join public.order_line ol on ol.order_id = o.id where o.route_day_plan_id = p.id and o.status in ('placed', 'locked')), 0),
      'loaded', coalesce((select sum(loaded) from public._trip_left(p.id)), 0),
      'returned', coalesce((select sum(returned) from public._trip_left(p.id)), 0),
      'sold', coalesce((select sum(delivered + billed) from public._trip_left(p.id)), 0),
      'left', coalesce((select sum(greatest(left_qty, 0)) from public._trip_left(p.id)), 0),
      'sales_paise', coalesce((select sum(c.total_paise) from public.cash_sale c where c.route_day_plan_id = p.id and c.voided_at is null), 0)
                   + coalesce((select sum(i.total_paise) from public.invoice i where i.route_day_plan_id = p.id and coalesce(i.status, '') <> 'void'), 0)) x
    from public.vehicle v
    left join public.route_day_plan p on p.id = public._trip_of(v.id, p_date)
    left join public.route r on r.id = p.route_id
    left join public.profiles d on d.user_id = p.driver_id
    where v.active) y), '[]'::jsonb);
end $$;

/** Opens (or creates) the trip for a vehicle on a day: its weekday route, else "Direct sales". */
create or replace function public.trip_open(p_vehicle uuid, p_date date) returns uuid
language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_route uuid; v_dow int := extract(dow from p_date);
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Kolkata')::date - 1 or p_date > (now() at time zone 'Asia/Kolkata')::date + 14 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.vehicle where id = p_vehicle and active) then raise exception 'VEHICLE_REQUIRED'; end if;
  v_id := public._trip_of(p_vehicle, p_date);
  if v_id is not null then
    update public.route_day_plan set vehicle_id = p_vehicle where id = v_id and vehicle_id is null;
    return v_id;
  end if;
  select id into v_route from public.route where active and default_vehicle_id = p_vehicle and v_dow = any(visit_days) order by name limit 1;
  if v_route is null then select id into v_route from public.route where name = 'Direct sales' limit 1; end if;
  insert into public.route_day_plan (route_id, date, vehicle_id) values (v_route, p_date, p_vehicle)
  on conflict do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.route_day_plan where route_id = v_route and date = p_date and vehicle_id = p_vehicle; end if;
  return v_id;
end $$;

/** Everything the trip screens need. */
create or replace function public.trip_detail(p_plan uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare p record;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select rp.*, r.name route_name, v.name vehicle_name, v.capacity_cases, d.name driver_name
    into p from public.route_day_plan rp join public.route r on r.id = rp.route_id
    left join public.vehicle v on v.id = rp.vehicle_id left join public.profiles d on d.user_id = rp.driver_id where rp.id = p_plan;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object(
    'plan', jsonb_build_object('id', p.id, 'date', p.date, 'status', p.status, 'route', p.route_name, 'vehicle_id', p.vehicle_id, 'vehicle', p.vehicle_name,
      'capacity', p.capacity_cases, 'driver_id', p.driver_id, 'driver', p.driver_name, 'unloaded_at', p.unloaded_at, 'closed_at', p.closed_at,
      'short_cases', p.short_cases, 'close_note', p.close_note),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'variant_id', v.id, 'label', public._item_label(v.id), 'brand', b.name, 'pack_sort', pk.sort, 'godown', coalesce(s.on_hand, 0),
        'ordered', coalesce(o.q, 0), 'loaded', coalesce(t.loaded, 0), 'returned', coalesce(t.returned, 0),
        'delivered', coalesce(t.delivered, 0), 'billed', coalesce(t.billed, 0), 'left', coalesce(t.left_qty, 0))
        order by pk.sort, public._item_label(v.id))
      from public.variant v join public.pack pk on pk.id = v.pack_id left join public.brand b on b.id = pk.brand_id
      left join public.stock s on s.variant_id = v.id
      left join public._trip_left(p_plan) t on t.variant_id = v.id
      left join (select ol.variant_id, sum(ol.qty_ordered) q from public.orders od join public.order_line ol on ol.order_id = od.id
                 where od.route_day_plan_id = p_plan and od.status in ('placed', 'locked') group by 1) o on o.variant_id = v.id
      where (v.active and pk.active) or t.variant_id is not null or o.variant_id is not null), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
        'id', od.id, 'status', od.status, 'shop_id', sh.id, 'shop', sh.name, 'owner', nullif(trim(sh.owner_name), ''), 'phone', sh.phone, 'stop_seq', sh.stop_seq,
        'lines', (select jsonb_agg(jsonb_build_object('variant_id', ol.variant_id, 'label', public._item_label(ol.variant_id), 'qty', ol.qty_ordered, 'price_paise', ol.unit_price_paise)) from public.order_line ol where ol.order_id = od.id),
        'total_paise', (select coalesce(sum(ol.qty_ordered * ol.unit_price_paise), 0) from public.order_line ol where ol.order_id = od.id),
        'delivered_paise', (select coalesce(sum(i.total_paise), 0) from public.invoice i where i.order_id = od.id))
        order by sh.stop_seq, sh.name)
      from public.orders od join public.shop sh on sh.id = od.shop_id where od.route_day_plan_id = p_plan and od.status <> 'cancelled'), '[]'::jsonb),
    'bills', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'shop', sh.name, 'owner', nullif(trim(sh.owner_name), ''),
        'total_paise', c.total_paise, 'mode', c.payment_mode, 'cases', (select sum(l.qty) from public.cash_sale_line l where l.cash_sale_id = c.id), 'at', c.created_at) order by c.created_at desc)
      from public.cash_sale c join public.shop sh on sh.id = c.shop_id where c.route_day_plan_id = p_plan and c.voided_at is null), '[]'::jsonb));
end $$;

/** Morning load. Manager or admin. Driver optional. Can be changed until something is sold, delivered or unloaded. */
create or replace function public.trip_load(p_plan uuid, p_driver uuid, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v public.route_day_plan; v_bad int; v_total int;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v from public.route_day_plan where id = p_plan for update;
  if v.id is null then raise exception 'NOT_FOUND'; end if;
  if v.vehicle_id is null then raise exception 'VEHICLE_REQUIRED'; end if;
  if p_driver is not null and not exists (select 1 from public.profiles where user_id = p_driver and role = 'driver' and active) then raise exception 'DRIVER_REQUIRED'; end if;
  if jsonb_typeof(p_lines) <> 'array' or exists (
       select 1 from jsonb_array_elements(p_lines) e left join public.variant x on x.id = (e ->> 'variant_id')::uuid
       where x.id is null or (e ->> 'qty') !~ '^\d{1,4}$')
     or (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_lines) e)
  then raise exception 'INVALID_INPUT'; end if;
  select coalesce(sum((e ->> 'qty')::int), 0) into v_total from jsonb_array_elements(p_lines) e;
  if v_total = 0 then raise exception 'NOTHING_TO_LOAD'; end if;

  if v.status = 'loaded' then
    -- change the morning load: only while nothing has happened on the trip yet
    if exists (select 1 from public.cash_sale where route_day_plan_id = p_plan and voided_at is null)
       or exists (select 1 from public.invoice where route_day_plan_id = p_plan)
       or exists (select 1 from public.load_line where route_day_plan_id = p_plan and qty_returned > 0)
    then raise exception 'TRIP_STARTED'; end if;
    update public.route_day_plan set status = 'planning' where id = p_plan;            -- trigger puts the old load back in the godown
    delete from public.load_line where route_day_plan_id = p_plan;
    update public.orders set status = 'placed', updated_at = now() where route_day_plan_id = p_plan and status = 'locked';
  elsif v.status <> 'planning' then raise exception 'TRIP_STARTED';
  end if;

  -- never load more than the godown has
  select count(*) into v_bad from jsonb_array_elements(p_lines) e left join public.stock s on s.variant_id = (e ->> 'variant_id')::uuid
   where (e ->> 'qty')::int > coalesce(s.on_hand, 0);
  if v_bad > 0 then raise exception 'NOT_ENOUGH_STOCK'; end if;

  update public.orders set status = 'locked', updated_at = now() where route_day_plan_id = p_plan and status = 'placed';
  insert into public.load_line (route_day_plan_id, variant_id, qty_ordered_total, qty_spare)
  select p_plan, (e ->> 'variant_id')::uuid, least((e ->> 'qty')::int, coalesce(o.q, 0)), (e ->> 'qty')::int - least((e ->> 'qty')::int, coalesce(o.q, 0))
    from jsonb_array_elements(p_lines) e
    left join (select ol.variant_id, sum(ol.qty_ordered)::int q from public.orders od join public.order_line ol on ol.order_id = od.id
               where od.route_day_plan_id = p_plan and od.status = 'locked' group by 1) o on o.variant_id = (e ->> 'variant_id')::uuid
   where (e ->> 'qty')::int > 0;
  update public.route_day_plan set status = 'loaded', driver_id = p_driver where id = p_plan;   -- trigger takes the load out of the godown
  return jsonb_build_object('plan_id', p_plan, 'cases', v_total);
end $$;

/** Evening: what came back goes into the godown now. Can be corrected until the trip is closed. */
create or replace function public.trip_unload(p_plan uuid, p_returned jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v public.route_day_plan; r record; v_new int; v_back int := 0;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v from public.route_day_plan where id = p_plan for update;
  if v.id is null then raise exception 'NOT_FOUND'; end if;
  if v.status not in ('loaded', 'out') then raise exception 'PLAN_NOT_OUT'; end if;
  if jsonb_typeof(p_returned) <> 'array' or exists (
       select 1 from jsonb_array_elements(p_returned) e
       where (e ->> 'qty') !~ '^\d{1,4}$' or not exists (select 1 from public.load_line ll where ll.route_day_plan_id = p_plan and ll.variant_id = (e ->> 'variant_id')::uuid))
  then raise exception 'INVALID_INPUT'; end if;
  for r in select ll.*, t.delivered, t.billed from public.load_line ll join public._trip_left(p_plan) t on t.variant_id = ll.variant_id where ll.route_day_plan_id = p_plan loop
    v_new := coalesce((select (e ->> 'qty')::int from jsonb_array_elements(p_returned) e where (e ->> 'variant_id')::uuid = r.variant_id), 0);
    if v_new > r.qty_ordered_total + r.qty_spare - r.delivered - r.billed then raise exception 'MORE_THAN_ON_TRUCK'; end if;
    if v_new <> r.qty_returned then
      insert into public.stock_move (variant_id, qty, kind, route_day_plan_id, reason)
      values (r.variant_id, v_new - r.qty_returned, case when v_new > r.qty_returned then 'return_in' else 'return_undo' end::public.stock_move_kind, p_plan, 'Unloaded');
      update public.load_line set qty_returned = v_new where id = r.id;
    end if;
    v_back := v_back + v_new;
  end loop;
  update public.route_day_plan set unloaded_at = now(), status = 'out' where id = p_plan;
  return jsonb_build_object('returned', v_back, 'left', (select coalesce(sum(left_qty), 0) from public._trip_left(p_plan)));
end $$;

/** Close the trip. Anything still on the truck is a shortage and needs a reason. */
create or replace function public.trip_close(p_plan uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v public.route_day_plan; v_short int; v_diff jsonb; v_cash bigint; v_upi bigint;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v from public.route_day_plan where id = p_plan for update;
  if v.id is null then raise exception 'NOT_FOUND'; end if;
  if v.status not in ('loaded', 'out') then raise exception 'PLAN_NOT_OUT'; end if;
  if v.unloaded_at is null then raise exception 'UNLOAD_FIRST'; end if;
  select coalesce(sum(left_qty), 0), coalesce(jsonb_agg(jsonb_build_object('variant_id', variant_id, 'item', public._item_label(variant_id), 'short', left_qty)) filter (where left_qty <> 0), '[]')
    into v_short, v_diff from public._trip_left(p_plan);
  if v_short > 0 and coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select coalesce(-sum(amount_paise) filter (where payment_mode = 'cash'), 0), coalesce(-sum(amount_paise) filter (where payment_mode = 'upi'), 0)
    into v_cash, v_upi from public.ledger_entry where route_day_plan_id = p_plan and type = 'payment';
  if not exists (select 1 from public.cash_handover where route_day_plan_id = p_plan) then
    insert into public.cash_handover (route_day_plan_id, expected_cash_paise, expected_upi_paise, handed_cash_paise, stock_diff, note, closed_by, received_paise, received_by, received_at)
    values (p_plan, v_cash, v_upi, v_cash, v_diff, left(trim(p_reason), 300), auth.uid(), v_cash, auth.uid(), now());
  end if;
  update public.orders set status = 'cancelled', cancel_reason = 'not delivered (trip closed)', updated_at = now()
   where route_day_plan_id = p_plan and status = 'locked';
  update public.route_day_plan set status = 'closed', closed_at = now(), short_cases = greatest(v_short, 0), close_note = nullif(left(trim(coalesce(p_reason, '')), 300), '')
   where id = p_plan;
  return jsonb_build_object('short', v_short, 'items', v_diff);
end $$;

revoke all on function public.trip_board(date), public.trip_open(uuid, date), public.trip_detail(uuid), public.trip_load(uuid, uuid, jsonb),
  public.trip_unload(uuid, jsonb), public.trip_close(uuid, text) from public, anon;
grant execute on function public.trip_board(date), public.trip_open(uuid, date), public.trip_detail(uuid), public.trip_load(uuid, uuid, jsonb),
  public.trip_unload(uuid, jsonb), public.trip_close(uuid, text) to authenticated;

-- ---------- truck bills: counter sales from a vehicle ----------
drop function if exists public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid, bigint);
drop function if exists public.counter_sale_save(uuid, uuid, uuid, text, jsonb, bigint);
create function public.counter_sale_save(p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb, p_discount bigint default 0, p_plan uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  c public.cash_sale; v_id uuid; v_no text; v_by text; r record; o record; v_buy bigint; v_plan uuid; v_status public.plan_status;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_mode not in ('cash', 'upi') then raise exception 'INVALID_INPUT'; end if;
  if p_discount is null or p_discount < 0 or p_discount > 100000000 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.shop where id = p_shop and active) then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 40 or exists (
    select 1 from jsonb_array_elements(p_lines) e left join public.variant v on v.id = (e ->> 'variant_id')::uuid
    where v.id is null or (e ->> 'qty') !~ '^\d{1,4}$' or (e ->> 'qty')::int < 1 or (e ->> 'price_paise') !~ '^\d{1,8}$'
       or (e ->> 'price_paise')::bigint < 2000 or (e ->> 'price_paise')::bigint > 10000000)
  then raise exception 'INVALID_INPUT'; end if;
  if (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_lines) e) then
    raise exception 'INVALID_INPUT';
  end if;
  if p_discount > (select sum((e ->> 'qty')::bigint * (e ->> 'price_paise')::bigint) from jsonb_array_elements(p_lines) e) then
    raise exception 'DISCOUNT_TOO_BIG';
  end if;
  select left(name, 60) into v_by from public.profiles where user_id = auth.uid();

  if p_id is null then
    select id, number into v_id, v_no from public.cash_sale where action_id = p_action;
    if v_id is not null then return jsonb_build_object('id', v_id, 'number', v_no, 'repeat', true); end if;
    v_plan := p_plan;
    if v_plan is not null then
      select status into v_status from public.route_day_plan where id = v_plan for update;
      if v_status is null then raise exception 'NOT_FOUND'; end if;
      if v_status not in ('loaded', 'out') then raise exception 'TRIP_NOT_OUT'; end if;
    end if;
    v_no := 'KD-' || lpad(nextval('public.cash_sale_no_seq')::text, 5, '0');
    insert into public.cash_sale (action_id, number, shop_id, payment_mode, total_paise, entered_by, discount_paise, route_day_plan_id)
    values (p_action, v_no, p_shop, p_mode, 0, coalesce(v_by, 'App'), p_discount, v_plan) returning id into v_id;
    for r in select (e ->> 'variant_id')::uuid vid, (e ->> 'qty')::int qty, (e ->> 'price_paise')::bigint price from jsonb_array_elements(p_lines) e loop
      select c2.buy_paise into v_buy from public.bot_secret b cross join lateral public.bot_catalog(b.bot_key) c2 where c2.variant_id = r.vid;
      insert into public.cash_sale_line (cash_sale_id, variant_id, qty, price_paise, buy_paise) values (v_id, r.vid, r.qty, r.price, coalesce(v_buy, 0));
      if v_plan is null then perform public._cash_sale_stock(v_id, r.vid, r.qty, v_no); end if;    -- truck bill: stock already left at loading
    end loop;
  else
    select * into c from public.cash_sale where id = p_id for update;
    if c.id is null then raise exception 'NOT_FOUND'; end if;
    if c.voided_at is not null then raise exception 'ALREADY_VOIDED'; end if;
    v_id := c.id; v_no := c.number; v_plan := c.route_day_plan_id;
    if v_plan is not null and (select status from public.route_day_plan where id = v_plan for update) = 'closed' then raise exception 'TRIP_CLOSED'; end if;
    update public.cash_sale set shop_id = p_shop, payment_mode = p_mode, discount_paise = p_discount
     where id = c.id and (shop_id <> p_shop or payment_mode <> p_mode or discount_paise <> p_discount);
    for o in select * from public.cash_sale_line l where l.cash_sale_id = c.id
             and not exists (select 1 from jsonb_array_elements(p_lines) e where (e ->> 'variant_id')::uuid = l.variant_id) loop
      if v_plan is null then perform public._cash_sale_stock(c.id, o.variant_id, -o.qty, 'App: removed from ' || c.number); end if;
      delete from public.cash_sale_line where id = o.id;
    end loop;
    for r in select (e ->> 'variant_id')::uuid vid, (e ->> 'qty')::int qty, (e ->> 'price_paise')::bigint price from jsonb_array_elements(p_lines) e loop
      select * into o from public.cash_sale_line where cash_sale_id = c.id and variant_id = r.vid;
      if o.id is null then
        select c2.buy_paise into v_buy from public.bot_secret b cross join lateral public.bot_catalog(b.bot_key) c2 where c2.variant_id = r.vid;
        insert into public.cash_sale_line (cash_sale_id, variant_id, qty, price_paise, buy_paise) values (c.id, r.vid, r.qty, r.price, coalesce(v_buy, 0));
        if v_plan is null then perform public._cash_sale_stock(c.id, r.vid, r.qty, 'App: added to ' || c.number); end if;
      elsif o.qty <> r.qty or o.price_paise <> r.price then
        if v_plan is null then perform public._cash_sale_stock(c.id, r.vid, r.qty - o.qty, 'App: changed on ' || c.number); end if;
        update public.cash_sale_line set qty = r.qty, price_paise = r.price where id = o.id;
      end if;
    end loop;
  end if;
  -- a truck bill can only sell what is still on that truck
  if v_plan is not null then
    if exists (select 1 from public._trip_left(v_plan) where left_qty < 0) then raise exception 'NOT_ON_TRUCK'; end if;
    update public.route_day_plan set status = 'out' where id = v_plan and status = 'loaded';
  end if;
  perform public._cash_sale_total(v_id);
  return jsonb_build_object('id', v_id, 'number', v_no, 'total_paise', (select total_paise from public.cash_sale where id = v_id), 'repeat', false);
end $function$;
revoke all on function public.counter_sale_save(uuid, uuid, uuid, text, jsonb, bigint, uuid) from public, anon;
grant execute on function public.counter_sale_save(uuid, uuid, uuid, text, jsonb, bigint, uuid) to authenticated;

create function public.counter_sale_save_into(p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb, p_account uuid, p_discount bigint default 0, p_plan uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb;
begin
  perform public._money_check(p_account);
  r := public.counter_sale_save(p_id, p_action, p_shop, p_mode, p_lines, p_discount, p_plan);
  perform public._set_payment_account('counter_sale', (r->>'id')::uuid, p_account, auth.uid());
  return r;
end $$;
revoke all on function public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid) from public, anon;
grant execute on function public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid) to authenticated;

-- Cancelling a truck bill puts the cases back "on the truck" (no godown stock move).
create or replace function public._cash_sale_void(p_id uuid, p_reason text, p_user uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare c public.cash_sale; l record;
begin
  select * into c from public.cash_sale where id = p_id for update;
  if c.id is null then raise exception 'NOT_FOUND'; end if;
  if c.voided_at is not null then raise exception 'ALREADY_VOIDED'; end if;
  if c.route_day_plan_id is not null and (select status from public.route_day_plan where id = c.route_day_plan_id) = 'closed' then raise exception 'TRIP_CLOSED'; end if;
  if c.route_day_plan_id is null then
    for l in select variant_id, qty from public.cash_sale_line where cash_sale_id = c.id loop
      perform public._cash_sale_stock(c.id, l.variant_id, -l.qty, 'Void ' || c.number || ': ' || left(trim(p_reason), 150));
    end loop;
  end if;
  update public.cash_sale set voided_at = now(), voided_by = p_user, void_reason = left(trim(p_reason), 200) where id = c.id;
end $function$;

-- Counter sales list: which truck a bill came from.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.counter_sales(date, date)'::regprocedure);
  d := replace(d, $x$'owner', nullif(trim(s.owner_name), ''),$x$,
                  $x$'owner', nullif(trim(s.owner_name), ''), 'plan_id', c.route_day_plan_id,
        'vehicle', (select v.name from public.route_day_plan rp join public.vehicle v on v.id = rp.vehicle_id where rp.id = c.route_day_plan_id),$x$);
  execute d;
  -- nightly report: trip shortages
  d := pg_get_functiondef('public.ops_daily(date)'::regprocedure);
  d := replace(d, $x$h.expected_cash_paise, h.handed_cash_paise$x$,
                  $x$h.expected_cash_paise, h.handed_cash_paise, rp.short_cases, rp.close_note, (select v.name from public.vehicle v where v.id = rp.vehicle_id) vehicle$x$);
  execute d;
end $$;

-- Truck bills are checked against the truck BEFORE a bill number is taken (a refused bill must never leave a gap).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.counter_sale_save(uuid, uuid, uuid, text, jsonb, bigint, uuid)'::regprocedure);
  d := replace(d, $x$      if v_status not in ('loaded', 'out') then raise exception 'TRIP_NOT_OUT'; end if;
    end if;$x$,
                  $x$      if v_status not in ('loaded', 'out') then raise exception 'TRIP_NOT_OUT'; end if;
      -- checked before a bill number is taken, so a refused truck bill never leaves a gap in the numbers
      if exists (select 1 from jsonb_array_elements(p_lines) e left join public._trip_left(v_plan) t on t.variant_id = (e ->> 'variant_id')::uuid
                 where (e ->> 'qty')::int > coalesce(t.left_qty, 0)) then raise exception 'NOT_ON_TRUCK'; end if;
    end if;$x$);
  if position('a refused truck bill never leaves a gap' in d) = 0 then raise exception 'patch did not apply'; end if;
  execute d;
end $$;

-- Advance-order deliveries also respect truck bills and unloaded cases (one "left on truck" rule for everything).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.record_delivery(uuid, uuid, uuid, jsonb, jsonb)'::regprocedure);
  d := replace(d, $x$  if v_bad > 0 then raise exception 'NOT_ON_TRUCK'; end if;$x$,
                  $x$  if v_bad > 0 then raise exception 'NOT_ON_TRUCK'; end if;
  -- also counts truck bills and what was already unloaded (vehicle trips)
  if exists (select 1 from public._trip_left(p_plan_id) where left_qty < 0) then raise exception 'NOT_ON_TRUCK'; end if;$x$);
  if position('also counts truck bills' in d) = 0 then raise exception 'patch did not apply'; end if;
  execute d;
end $$;

-- ---------- patch: trip_of_skips_inactive_routes + trip_of_keeps_direct_sales ----------
-- A vehicle's trip for the day: never an unstarted plan on a switched-off route; a started trip wins over a planning one.
create or replace function public._trip_of(p_vehicle uuid, p_date date) returns uuid
language sql stable security definer set search_path to '' as $$
  select p.id from public.route_day_plan p join public.route r on r.id = p.route_id
   where p.date = p_date and coalesce(p.vehicle_id, r.default_vehicle_id) = p_vehicle
     and (r.active or r.name = 'Direct sales' or p.status <> 'planning')   -- Direct sales is a hidden (inactive) route but holds every truck's own trip
   order by (p.status = 'closed'), (p.status = 'planning'), p.created_at desc limit 1
$$;
revoke all on function public._trip_of(uuid, date) from public, anon, authenticated;
