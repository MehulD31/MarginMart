-- Shops from the Pepsi EDS survey: GPS, locality, shop type, cooler, visit frequency.
-- Owner decision (8 Nov 2026): no credit block. Any shop can order any amount; dues are still recorded in the khata.

alter table public.shop
  add column if not exists locality text check (length(locality) <= 80),
  add column if not exists lat double precision check (lat between -90 and 90),
  add column if not exists lng double precision check (lng between -180 and 180),
  add column if not exists channel text check (length(channel) <= 40),
  add column if not exists sub_channel text check (length(sub_channel) <= 40),
  add column if not exists outlet_type text check (length(outlet_type) <= 40),
  add column if not exists has_cooler boolean,
  add column if not exists cooler text check (length(cooler) <= 120),
  add column if not exists visit_freq text check (length(visit_freq) <= 40);

-- credit_status keeps its shape (the khata screens read balance/overdue from it) but never blocks.
create or replace function public.credit_status(p_shop_id uuid default null)
returns table (balance_paise bigint, overdue_paise bigint, credit_limit_paise bigint, blocked boolean, override_until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_shop uuid := coalesce(p_shop_id, public.auth_shop_id()); b record;
begin
  if v_shop is null or not (public.is_staff() or v_shop = public.auth_shop_id()) then raise exception 'FORBIDDEN'; end if;
  select * into b from public.shop_balance(v_shop);
  return query select b.balance, b.overdue, 0::bigint, false, null::timestamptz;
end $$;

create or replace function public.save_order(p_lines jsonb, p_shop_id uuid default null, p_plan_id uuid default null)
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
  perform 1 from public.shop where id = v_shop and active for update;
  if not found then raise exception 'SHOP_INACTIVE'; end if;
  perform public.ensure_route_day_plans(14);
  if p_plan_id is null then
    select p.* into v_plan from public.route_day_plan p join public.shop s on s.route_id = p.route_id
     where s.id = v_shop and p.status = 'planning' and now() < public.cutoff_at(p.date)
     order by p.date limit 1;
  else
    select p.* into v_plan from public.route_day_plan p where p.id = p_plan_id;
  end if;
  if v_plan.id is null then raise exception 'NO_DELIVERY'; end if;
  if v_plan.status <> 'planning' then raise exception 'ORDER_LOCKED'; end if;
  if v_role = 'shop' and now() >= public.cutoff_at(v_plan.date) then raise exception 'CUTOFF_PASSED'; end if;
  select id into v_pl from public.price_list where status = 'active';
  if v_pl is null then raise exception 'NO_PRICE_LIST'; end if;
  with l as (
    select (e ->> 'variant_id')::uuid variant_id, (e ->> 'qty') qty, (e ->> 'price_paise') price from jsonb_array_elements(p_lines) e
  )
  select count(*) into v_bad from l
   left join public.variant v on v.id = l.variant_id and v.active
   left join public.pack pk on pk.id = v.pack_id and pk.active
   left join public.price_list_item i on i.pack_id = pk.id and i.price_list_id = v_pl
   where i.id is null or l.qty !~ '^\d{1,3}$' or l.qty::int < 1 or (l.price is not null and (l.price !~ '^\d{1,9}$' or l.price::bigint < 1));
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
  select v_order, v.id, pk.id, (e ->> 'qty')::int,
         case when v_role <> 'shop' and (e ->> 'price_paise') is not null then (e ->> 'price_paise')::bigint else i.net_rate_paise end, i.trade_price_paise, i.scheme_value_paise,
         i.scheme_type, pk.mrp_paise, pk.units_per_case, pk.gst_rate_bp, pk.cess_rate_bp
  from jsonb_array_elements(p_lines) e
  join public.variant v on v.id = (e ->> 'variant_id')::uuid
  join public.pack pk on pk.id = v.pack_id
  join public.price_list_item i on i.pack_id = pk.id and i.price_list_id = v_pl;
  select sum(qty_ordered * unit_price_paise) into v_total from public.order_line where order_id = v_order;
  return jsonb_build_object('order_id', v_order, 'total_paise', v_total, 'delivery_date', v_plan.date,
                            'cutoff', public.cutoff_at(v_plan.date));
end $$;
