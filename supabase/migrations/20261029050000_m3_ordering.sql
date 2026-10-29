-- M3: route-day plans, orders, order lines, ordering RPCs.
-- Times are IST. An order joins the next visit of the shop's route whose cutoff
-- (settings.cutoff_time on the day before the visit) has not passed.
-- One open order per shop per visit; save_order replaces its lines (the cart is the order).

create type public.plan_status as enum ('planning', 'loaded', 'out', 'closed');
create type public.order_source as enum ('shop', 'manager', 'driver_van');
create type public.order_status as enum ('placed', 'locked', 'delivered', 'partially_delivered', 'cancelled');

create table public.route_day_plan (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.route (id),
  date date not null,
  vehicle_id uuid references public.vehicle (id),
  driver_id uuid references auth.users (id),
  status public.plan_status not null default 'planning',
  created_at timestamptz not null default now(),
  unique (route_id, date)
);
create index route_day_plan_date on public.route_day_plan (date);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shop (id),
  route_day_plan_id uuid not null references public.route_day_plan (id),
  source public.order_source not null default 'shop',
  status public.order_status not null default 'placed',
  price_list_id uuid not null references public.price_list (id),
  cancel_reason text,
  placed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index orders_one_open_per_visit on public.orders (shop_id, route_day_plan_id) where status = 'placed';
create index orders_plan on public.orders (route_day_plan_id);
create index orders_shop_created on public.orders (shop_id, created_at desc);

create table public.order_line (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid not null references public.variant (id),
  pack_id uuid not null references public.pack (id),
  qty_ordered int not null check (qty_ordered between 1 and 999),
  -- Price snapshot at the moment the line was saved. Never recomputed.
  unit_price_paise bigint not null,
  trade_price_paise bigint not null,
  scheme_value_paise bigint not null,
  scheme_type public.scheme_type not null,
  mrp_paise bigint not null,
  units_per_case int not null,
  gst_rate_bp int not null,
  cess_rate_bp int not null,
  unique (order_id, variant_id)
);

-- ---------- time helpers ----------
create function public.cutoff_at(p_date date) returns timestamptz
language sql stable set search_path = '' as $$
  select ((p_date - 1) + (select cutoff_time from public.settings)) at time zone 'Asia/Kolkata'
$$;

-- Creates missing plans for every active route for the next p_days days (IST). Idempotent.
create function public.ensure_route_day_plans(p_days int default 14) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.route_day_plan (route_id, date)
  select r.id, d::date
  from public.route r
  cross join generate_series((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + p_days, interval '1 day') d
  where r.active and extract(isodow from d)::smallint = any (r.visit_days)
  on conflict (route_id, date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.ensure_route_day_plans(int) from public, anon, authenticated;

-- Next visit a shop can still order for.
create function public.next_delivery(p_shop_id uuid default null)
returns table (plan_id uuid, delivery_date date, cutoff timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_shop uuid := coalesce(p_shop_id, public.auth_shop_id());
begin
  if v_shop is null or not (public.is_staff() or v_shop = public.auth_shop_id()) then raise exception 'FORBIDDEN'; end if;
  return query
    select p.id, p.date, public.cutoff_at(p.date)
    from public.route_day_plan p join public.shop s on s.route_id = p.route_id
    where s.id = v_shop and p.status = 'planning' and now() < public.cutoff_at(p.date)
    order by p.date limit 1;
end $$;
revoke execute on function public.next_delivery(uuid) from public, anon;
grant execute on function public.next_delivery(uuid) to authenticated;

-- ---------- save / cancel ----------
-- p_lines: [{"variant_id": uuid, "qty": int}]. Empty array cancels the open order.
-- Shops act on their own shop and the next open visit. Staff may pass a shop and a plan,
-- and may act after the cutoff until the truck is loaded.
create function public.save_order(p_lines jsonb, p_shop_id uuid default null, p_plan_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.auth_role();
  v_shop uuid;
  v_plan public.route_day_plan;
  v_pl uuid;
  v_order uuid;
  v_bad int;
  v_total bigint;
begin
  if v_role is null then raise exception 'FORBIDDEN'; end if;
  if v_role = 'shop' then
    v_shop := public.auth_shop_id();
    if p_shop_id is not null and p_shop_id <> v_shop then raise exception 'FORBIDDEN'; end if;
    if p_plan_id is not null then raise exception 'FORBIDDEN'; end if;
  elsif v_role in ('admin', 'manager') then
    v_shop := p_shop_id;
  else
    raise exception 'FORBIDDEN';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 200 then raise exception 'INVALID_INPUT'; end if;

  -- Serialise per shop so two taps can't create two orders.
  perform 1 from public.shop where id = v_shop and active for update;
  if not found then raise exception 'SHOP_INACTIVE'; end if;

  perform public.ensure_route_day_plans(14);
  if p_plan_id is null then
    select p.* into v_plan from public.route_day_plan p join public.shop s on s.route_id = p.route_id
     where s.id = v_shop and p.status = 'planning' and now() < public.cutoff_at(p.date)
     order by p.date limit 1;
  else
    select p.* into v_plan from public.route_day_plan p join public.shop s on s.route_id = p.route_id
     where p.id = p_plan_id and s.id = v_shop;
  end if;
  if v_plan.id is null then raise exception 'NO_DELIVERY'; end if;
  if v_plan.status <> 'planning' then raise exception 'ORDER_LOCKED'; end if;
  if v_role = 'shop' and now() >= public.cutoff_at(v_plan.date) then raise exception 'CUTOFF_PASSED'; end if;

  select id into v_pl from public.price_list where status = 'active';
  if v_pl is null then raise exception 'NO_PRICE_LIST'; end if;

  -- Validate lines: integer qty 1..999, unique, orderable.
  with l as (
    select (e ->> 'variant_id')::uuid variant_id, (e ->> 'qty') qty from jsonb_array_elements(p_lines) e
  )
  select count(*) into v_bad from l
   left join public.variant v on v.id = l.variant_id and v.active
   left join public.pack pk on pk.id = v.pack_id and pk.active
   left join public.price_list_item i on i.pack_id = pk.id and i.price_list_id = v_pl
   where i.id is null or l.qty !~ '^\d{1,3}$' or l.qty::int < 1;
  if v_bad > 0 then raise exception 'ITEM_UNAVAILABLE'; end if;
  if (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_lines) e) then
    raise exception 'INVALID_INPUT';
  end if;

  select id into v_order from public.orders where shop_id = v_shop and route_day_plan_id = v_plan.id and status = 'placed';

  if jsonb_array_length(p_lines) = 0 then
    if v_order is not null then
      update public.orders set status = 'cancelled', cancel_reason = 'emptied', updated_at = now() where id = v_order;
    end if;
    return jsonb_build_object('order_id', null, 'total_paise', 0, 'delivery_date', v_plan.date);
  end if;

  if v_order is null then
    insert into public.orders (shop_id, route_day_plan_id, source, price_list_id, placed_by)
    values (v_shop, v_plan.id, case when v_role = 'shop' then 'shop'::public.order_source else 'manager'::public.order_source end, v_pl, auth.uid())
    returning id into v_order;
  else
    update public.orders set price_list_id = v_pl, updated_at = now() where id = v_order;
    delete from public.order_line where order_id = v_order;
  end if;

  insert into public.order_line (order_id, variant_id, pack_id, qty_ordered, unit_price_paise, trade_price_paise,
    scheme_value_paise, scheme_type, mrp_paise, units_per_case, gst_rate_bp, cess_rate_bp)
  select v_order, v.id, pk.id, (e ->> 'qty')::int, i.net_rate_paise, i.trade_price_paise, i.scheme_value_paise,
         i.scheme_type, pk.mrp_paise, pk.units_per_case, pk.gst_rate_bp, pk.cess_rate_bp
  from jsonb_array_elements(p_lines) e
  join public.variant v on v.id = (e ->> 'variant_id')::uuid
  join public.pack pk on pk.id = v.pack_id
  join public.price_list_item i on i.pack_id = pk.id and i.price_list_id = v_pl;

  select sum(qty_ordered * unit_price_paise) into v_total from public.order_line where order_id = v_order;
  return jsonb_build_object('order_id', v_order, 'total_paise', v_total, 'delivery_date', v_plan.date,
                            'cutoff', public.cutoff_at(v_plan.date));
end $$;
revoke execute on function public.save_order(jsonb, uuid, uuid) from public, anon;
grant execute on function public.save_order(jsonb, uuid, uuid) to authenticated;

create function public.cancel_order(p_order_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  select ord.*, p.date, p.status plan_status into o
    from public.orders ord join public.route_day_plan p on p.id = ord.route_day_plan_id
   where ord.id = p_order_id for update of ord;
  if not found then raise exception 'NOT_FOUND'; end if;
  if public.is_staff() then
    if o.plan_status <> 'planning' then raise exception 'ORDER_LOCKED'; end if;
  elsif o.shop_id = public.auth_shop_id() then
    if now() >= public.cutoff_at(o.date) then raise exception 'CUTOFF_PASSED'; end if;
  else
    raise exception 'FORBIDDEN';
  end if;
  if o.status <> 'placed' then raise exception 'ORDER_LOCKED'; end if;
  update public.orders set status = 'cancelled', cancel_reason = left(coalesce(nullif(trim(p_reason), ''), 'cancelled'), 200), updated_at = now()
   where id = p_order_id;
end $$;
revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- ---------- RLS: reads only; writes go through the RPCs ----------
alter table public.route_day_plan enable row level security;
alter table public.orders enable row level security;
alter table public.order_line enable row level security;

create policy plan_read on public.route_day_plan for select to authenticated
  using ((select public.is_staff()) or route_id = (select s.route_id from public.shop s where s.id = (select public.auth_shop_id())));
create policy plan_staff_write on public.route_day_plan for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy orders_read on public.orders for select to authenticated
  using ((select public.is_staff()) or shop_id = (select public.auth_shop_id()));
create policy order_line_read on public.order_line for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and ((select public.is_staff()) or o.shop_id = (select public.auth_shop_id()))));

grant select on public.route_day_plan, public.orders, public.order_line to authenticated;
revoke insert, update, delete on public.route_day_plan, public.orders, public.order_line from authenticated;
grant update (vehicle_id, driver_id) on public.route_day_plan to authenticated;
revoke all on public.route_day_plan, public.orders, public.order_line from anon;

create trigger orders_audit after insert or update or delete on public.orders for each row execute function public.audit_row();
create trigger route_day_plan_audit after update on public.route_day_plan for each row execute function public.audit_row();

-- Daily at 00:05 IST (18:35 UTC) keep two weeks of plans ahead.
select cron.schedule('ensure-route-day-plans', '35 18 * * *', 'select public.ensure_route_day_plans(14)');
select public.ensure_route_day_plans(14);
