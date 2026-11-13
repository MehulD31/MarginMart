-- Pepsi order list: only items that actually sell (owner, 12 Nov 2026).
-- Before: the "minimum stock" top-up (low_threshold*2 - on_hand) applied to every bought item, so items that sold nothing in
-- 30 days (cans, 750ml, 1.25L, 2.25L, Creambell) were ordered 10-20 cases each just because stock was at or below 10.
-- Now: the top-up applies only to items that sold in the last 30 days or are booked on an order. Low-stock items with no sales
-- go to a separate list (ops_idle_low) for the owner to decide; they are never ordered automatically.
create or replace function public.ops_reorder(p_cover_days integer default 7)
returns jsonb language sql stable security definer set search_path = '' as $$
  with sold as (
    select variant_id, sum(q)::numeric / 30 per_day from (
      select l.variant_id, l.qty q from public.cash_sale_line l join public.cash_sale s on s.id = l.cash_sale_id
       where s.voided_at is null and s.created_at >= now() - interval '30 days'
      union all
      select d.variant_id, d.qty_delivered from public.delivery_line d join public.invoice i on i.id = d.invoice_id
       where coalesce(i.status, '') <> 'void' and i.created_at >= now() - interval '30 days') x
    group by 1),
  booked as (
    select ol.variant_id, sum(ol.qty_ordered) q from public.order_line ol
      join public.orders o on o.id = ol.order_id join public.route_day_plan p on p.id = o.route_day_plan_id
     where o.status in ('placed', 'locked') and p.date >= current_date group by 1),
  calc as (
    select p.name_en || coalesce(' ' || nullif(v.flavour_en, ''), '') item, s.on_hand, coalesce(b.q, 0) booked,
           round(coalesce(sd.per_day, 0), 1) per_day, p.sort,
           case when coalesce(sd.per_day, 0) > 0 then round((s.on_hand - coalesce(b.q, 0)) / sd.per_day, 1) end days_left,
           greatest(ceil(coalesce(sd.per_day, 0) * p_cover_days + coalesce(b.q, 0) - s.on_hand),
                    case when (coalesce(sd.per_day, 0) > 0 or coalesce(b.q, 0) > 0) and s.low_threshold > 0 and s.on_hand <= s.low_threshold
                         then s.low_threshold * 2 - s.on_hand else 0 end)::int need
      from public.stock s join public.variant v on v.id = s.variant_id join public.pack p on p.id = v.pack_id
      join public._bought_items() bi on bi.variant_id = s.variant_id
      left join sold sd on sd.variant_id = s.variant_id left join booked b on b.variant_id = s.variant_id
     where v.active and p.active)
  select coalesce(jsonb_agg(to_jsonb(c) - 'sort' order by c.days_left nulls last, c.sort), '[]'::jsonb)
    from (select * from calc where need > 0 order by days_left nulls last, sort limit 25) c
$$;

-- Items bought before, stock at or below their low-stock level, nothing sold in 30 days and nothing booked: owner decides.
create or replace function public.ops_idle_low()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('item', x.item, 'on_hand', x.on_hand) order by x.on_hand, x.sort), '[]'::jsonb) from (
    select p.name_en || coalesce(' ' || nullif(v.flavour_en, ''), '') item, s.on_hand, p.sort
      from public.stock s join public.variant v on v.id = s.variant_id join public.pack p on p.id = v.pack_id
      join public._bought_items() bi on bi.variant_id = s.variant_id
     where v.active and p.active and s.low_threshold > 0 and s.on_hand <= s.low_threshold
       and not exists (select 1 from public.cash_sale_line l join public.cash_sale c on c.id = l.cash_sale_id
                        where l.variant_id = s.variant_id and c.voided_at is null and c.created_at >= now() - interval '30 days')
       and not exists (select 1 from public.delivery_line d join public.invoice i on i.id = d.invoice_id
                        where d.variant_id = s.variant_id and coalesce(i.status, '') <> 'void' and i.created_at >= now() - interval '30 days')
       and not exists (select 1 from public.order_line ol join public.orders o on o.id = ol.order_id join public.route_day_plan rp on rp.id = o.route_day_plan_id
                        where ol.variant_id = s.variant_id and o.status in ('placed', 'locked') and rp.date >= current_date)
    ) x
$$;
revoke all on function public.ops_idle_low() from public, anon, authenticated;

create or replace function public.bot_idle_low(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return public.ops_idle_low();
end $$;
