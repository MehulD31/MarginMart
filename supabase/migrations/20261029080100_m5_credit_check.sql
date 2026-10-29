-- M5: credit block in save_order (shop role only).
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

  -- Credit rules apply to shops ordering themselves; staff decide for phoned-in orders.
  if v_role = 'shop' and jsonb_array_length(p_lines) > 0 and exists (select 1 from public.credit_status(v_shop) c where c.blocked) then raise exception 'CREDIT_BLOCKED'; end if;

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
  if v_role = 'shop' and exists (select 1 from public.credit_status(v_shop) c where c.credit_limit_paise > 0 and (c.override_until is null or c.override_until < now())
                                 and c.balance_paise + v_total > c.credit_limit_paise) then raise exception 'CREDIT_LIMIT'; end if;
  return jsonb_build_object('order_id', v_order, 'total_paise', v_total, 'delivery_date', v_plan.date,
                            'cutoff', public.cutoff_at(v_plan.date));
end $$;

