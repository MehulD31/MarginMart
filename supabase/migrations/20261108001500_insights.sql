-- Smart dashboard data (applied live as insights_1_sales_lines, insights_2_data, insights_3_split).
-- Analysis itself runs in src/shared/insights.js (website + Telegram autopilot).

-- Every real sale line: counter/truck bills (discount spread over lines) + delivered route orders. QA/TEST shops left out.
create or replace function public._sales_lines(p_from date, p_to date)
returns table(at timestamptz, day date, bill text, shop_id uuid, variant_id uuid, qty int, value bigint, cost bigint, src text)
language sql stable security definer set search_path to '' as $$
  select c.created_at, (c.created_at at time zone 'Asia/Kolkata')::date, 'c:' || c.id, c.shop_id, l.variant_id, l.qty,
         (l.qty * l.price_paise - round(c.discount_paise * (l.qty * l.price_paise)::numeric / nullif(sum(l.qty * l.price_paise) over (partition by c.id), 0)))::bigint,
         (l.qty * coalesce(nullif(l.buy_paise, 0), st.avg_cost_paise, 0))::bigint,
         case when c.route_day_plan_id is null then 'counter' else 'truck' end
    from public.cash_sale c join public.cash_sale_line l on l.cash_sale_id = c.id
    join public.shop s on s.id = c.shop_id left join public.stock st on st.variant_id = l.variant_id
   where c.voided_at is null and s.name not like 'QA %' and s.name not like 'TEST %'
     and (c.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  union all
  select i.created_at, (i.created_at at time zone 'Asia/Kolkata')::date, 'i:' || i.id, i.shop_id, d.variant_id, d.qty_delivered,
         (d.qty_delivered * d.unit_price_paise)::bigint, (d.qty_delivered * coalesce(st.avg_cost_paise, 0))::bigint, 'route'
    from public.invoice i join public.delivery_line d on d.invoice_id = i.id
    join public.shop s on s.id = i.shop_id left join public.stock st on st.variant_id = d.variant_id
   where coalesce(i.status, '') <> 'void' and d.qty_delivered > 0 and s.name not like 'QA %' and s.name not like 'TEST %'
     and (i.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
$$;
revoke all on function public._sales_lines(date, date) from public, anon, authenticated;

create or replace function public._insights(p_days int, p_admin boolean) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_to date := (now() at time zone 'Asia/Kolkata')::date; v_from date;
begin
  v_from := v_to - greatest(7, least(coalesce(p_days, 90), 365)) + 1;
  return jsonb_build_object(
    'today', v_to, 'from', v_from, 'admin', p_admin,
    'bills', coalesce((select jsonb_agg(b order by b->>'at') from (
        select jsonb_build_object('id', bill, 'at', min(at), 'day', min(day), 'shop', shop_id, 'src', min(src),
          'lines', jsonb_agg(jsonb_build_array(variant_id, qty, value, case when p_admin then cost end))) b
        from public._sales_lines(v_from, v_to) group by bill, shop_id) x), '[]'::jsonb),
    'shops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'owner', nullif(trim(s.owner_name), ''), 'phone', s.phone,
        'area', nullif(trim(s.locality), ''), 'route', r.name, 'created', s.created_at::date, 'outlet', s.outlet_type, 'cooler', s.has_cooler))
      from public.shop s left join public.route r on r.id = s.route_id
      where s.active and s.name not like 'QA %' and s.name not like 'TEST %'), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'label', public._item_label(v.id), 'brand', b.name, 'img', v.image_path,
        'on_hand', coalesce(st.on_hand, 0), 'low', coalesce(st.low_threshold, 0), 'cost', case when p_admin then st.avg_cost_paise end))
      from public.variant v join public.pack pk on pk.id = v.pack_id left join public.brand b on b.id = pk.brand_id left join public.stock st on st.variant_id = v.id
      where v.active and pk.active), '[]'::jsonb),
    'dues', coalesce((select jsonb_object_agg(shop_id, jsonb_build_array(balance_paise, overdue_paise)) from public.v_shop_balance where balance_paise > 0), '{}'::jsonb));
end $$;
revoke all on function public._insights(int, boolean) from public, anon, authenticated;

-- Website: admin or manager (cost and margin only for admin).
create or replace function public.insights_data(p_days int default 90) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return public._insights(p_days, exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin' and active));
end $$;
revoke all on function public.insights_data(int) from public, anon;
grant execute on function public.insights_data(int) to authenticated;

-- Telegram autopilot (GitHub Actions, service key only).
create or replace function public.ops_insights(p_days int default 90) returns jsonb
language sql stable security definer set search_path to '' as $$ select public._insights(p_days, true) $$;
revoke all on function public.ops_insights(int) from public, anon, authenticated;
grant execute on function public.ops_insights(int) to service_role;
