-- Add avg_buy_paise (weighted average buy price per case) to by_item in public.sales_report
create or replace function public.sales_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v jsonb;
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then raise exception 'FORBIDDEN'; end if;
  with b as (select (p_from::timestamp at time zone 'Asia/Kolkata') f, ((p_to + 1)::timestamp at time zone 'Asia/Kolkata') t),
  bills as (
    select c.id, 'bill:' || c.id ref, c.number, c.shop_id, (c.created_at at time zone 'Asia/Kolkata')::date dy,
           case when c.route_day_plan_id is null then 'counter' else 'truck' end channel, c.payment_mode mode, coalesce(c.discount_paise, 0) disc
      from public.cash_sale c, b where c.voided_at is null and c.created_at >= b.f and c.created_at < b.t
    union all
    select i.id, 'inv:' || i.id, i.number, i.shop_id, (i.created_at at time zone 'Asia/Kolkata')::date, 'route', 'credit', 0
      from public.invoice i, b where coalesce(i.status, '') <> 'void' and i.created_at >= b.f and i.created_at < b.t),
  lines as (
    select 'bill:' || l.cash_sale_id ref, l.variant_id, l.qty, l.qty * l.price_paise amt, l.qty * l.buy_paise cost from public.cash_sale_line l where l.cash_sale_id in (select id from bills)
    union all
    select 'inv:' || d.invoice_id, d.variant_id, d.qty_delivered, d.qty_delivered * d.unit_price_paise, d.qty_delivered * coalesce(s.avg_cost_paise, 0)
      from public.delivery_line d left join public.stock s on s.variant_id = d.variant_id where d.invoice_id in (select id from bills) and d.qty_delivered > 0),
  x as (
    select l.*, bl.dy, bl.channel, bl.mode, bl.shop_id, bl.number,
           case when v.flavour_en = p.name_en then p.name_en else v.flavour_en || ' ' || p.name_en end item, p.units_per_case upc, coalesce(br.name, '') brand
      from lines l join bills bl on bl.ref = l.ref join public.variant v on v.id = l.variant_id join public.pack p on p.id = v.pack_id left join public.brand br on br.id = p.brand_id),
  disc as (select coalesce(sum(disc), 0) d from bills)
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'first_sale', (select min(dy) from bills), 'last_sale', (select max(dy) from bills),
    'totals', (select jsonb_build_object('bills', (select count(*) from bills), 'shops', (select count(distinct shop_id) from bills), 'days', (select count(distinct dy) from bills),
        'items', count(distinct variant_id), 'cases', coalesce(sum(qty), 0), 'units', coalesce(sum(qty * upc), 0),
        'gross_paise', coalesce(sum(amt), 0), 'discount_paise', (select d from disc), 'net_paise', coalesce(sum(amt), 0) - (select d from disc),
        'cost_paise', coalesce(sum(cost), 0), 'margin_paise', coalesce(sum(amt - cost), 0) - (select d from disc)) from x),
    'by_mode', (select coalesce(jsonb_agg(m order by m.net desc), '[]') from (select bl.mode, count(*) bills, sum(coalesce(t.amt, 0)) - sum(bl.disc) net
        from bills bl left join (select ref, sum(amt) amt from lines group by 1) t on t.ref = bl.ref group by 1) m),
    'by_channel', (select coalesce(jsonb_agg(c order by c.net desc), '[]') from (select channel, count(distinct ref) bills, sum(qty) cases, sum(amt) net from x group by 1) c),
    'by_item', (select coalesce(jsonb_agg(i order by i.cases desc, i.item), '[]') from (
        select item, brand, sum(qty) cases, sum(qty * upc) units, sum(amt) amount_paise,
               round(sum(amt)::numeric / nullif(sum(qty), 0)) avg_rate_paise,
               round(sum(cost)::numeric / nullif(sum(qty), 0)) avg_buy_paise,
               sum(amt - cost) margin_paise, count(distinct ref) bills, count(distinct shop_id) shops, min(dy) first_sold, max(dy) last_sold from x group by 1, 2) i),
    'by_brand', (select coalesce(jsonb_agg(r order by r.amount_paise desc), '[]') from (select coalesce(nullif(brand, ''), 'Other') brand, sum(qty) cases, sum(amt) amount_paise from x group by 1) r),
    'by_day', (select coalesce(jsonb_agg(d order by d.dy), '[]') from (select dy, count(distinct ref) bills, sum(qty) cases, sum(amt) amount_paise from x group by 1) d),
    'top_shops', (select coalesce(jsonb_agg(s order by s.amount_paise desc), '[]') from (
        select sh.name, sh.locality, count(distinct x.ref) bills, sum(x.qty) cases, sum(x.amt) amount_paise from x join public.shop sh on sh.id = x.shop_id group by 1, 2 order by 5 desc limit 25) s)
  ) into v;
  return v;
end $function$;
