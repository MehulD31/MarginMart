-- Smart Pepsi order (owner, 12 Nov 2026). Replaces "30-day average x 7 days".
-- Problems with the old rule, found on live data (history is only 6-12 Nov, one purchase on 4 Nov):
--   * it divided total sales by 30 days even when only 7 days of history exist, so demand was understated about 4x
--     (Nimbooz: 54 cases in a week, 24 in stock, ~3 days left, but it was NOT on the order list);
--   * it treated "stock <= 10" as a reason to order 20 cases whatever the item sold;
--   * it ignored delivery time, the order cycle, season, trend, stock-outs and how lumpy the sales are.
-- New rule per item (standard reorder-point logic, sized for the real history):
--   history   h = days since first sale, between 7 and 30 (never divide by days that have no data)
--   rate      = 0.6 x last-7-day rate + 0.4 x history rate   (recent days count more = trend)
--             x 1.25 when stock is 0 (sales were cut off by the stock-out)
--             x season factor when the horizon crosses into an on/off-season month (planned cases on / off)
--   horizon   = lead days (order -> delivery) + order cycle days (how often we order)        [business_settings]
--   safety    = 1.28 (90% service) x daily std-dev x sqrt(horizon), capped at one horizon of demand, so one 50-case bill
--               doesn't inflate it; none for items that sold on only one day (not enough evidence)
--   order     = max(rate x horizon, booked orders) + safety - godown stock
--   urgent    = will run out within the lead time
-- Items with no sales and nothing booked are never ordered; ops_idle_low lists them for the owner to decide.
alter table public.business_settings
  add column if not exists reorder_lead_days int not null default 2 check (reorder_lead_days between 0 and 30),
  add column if not exists reorder_cycle_days int not null default 7 check (reorder_cycle_days between 1 and 60);

create or replace function public.ops_reorder(p_cover_days integer default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with cfg as (
    select b.reorder_lead_days lead, b.reorder_cycle_days cyc, b.on_season_months seasons,
           b.planned_cases_on pon, b.planned_cases_off poff, (now() at time zone 'Asia/Kolkata')::date today
      from public.business_settings b limit 1),
  lines as (
    select l.variant_id, (c.created_at at time zone 'Asia/Kolkata')::date dy, l.qty q
      from public.cash_sale_line l join public.cash_sale c on c.id = l.cash_sale_id where c.voided_at is null
    union all
    select d.variant_id, (i.created_at at time zone 'Asia/Kolkata')::date, d.qty_delivered
      from public.delivery_line d join public.invoice i on i.id = d.invoice_id where coalesce(i.status, '') <> 'void'),
  hist as (select least(30, greatest(7, (select today from cfg) - coalesce(min(dy), (select today from cfg)) + 1))::int h from lines),
  dd as (select l.variant_id, l.dy, sum(l.q) q from lines l, hist, cfg where l.dy > cfg.today - hist.h group by 1, 2),
  st as (
    select variant_id, sum(q) tot, count(*) sell_days, sum(q * q) sq,
           sum(q) filter (where dy > (select today from cfg) - 7) last7
      from dd group by 1),
  booked as (
    select ol.variant_id, sum(ol.qty_ordered) q from public.order_line ol
      join public.orders o on o.id = ol.order_id join public.route_day_plan p on p.id = o.route_day_plan_id
     where o.status in ('placed', 'locked') and p.date >= (select today from cfg) group by 1),
  season as (
    select case when extract(month from cfg.today + (cfg.lead + cfg.cyc))::int = extract(month from cfg.today)::int then 1.0
                else (case when extract(month from cfg.today + (cfg.lead + cfg.cyc))::int = any (cfg.seasons) then cfg.pon else cfg.poff end)::numeric
                     / nullif(case when extract(month from cfg.today)::int = any (cfg.seasons) then cfg.pon else cfg.poff end, 0) end f
      from cfg),
  base as (
    select p.name_en || coalesce(' ' || nullif(v.flavour_en, ''), '') item, p.sort, s.on_hand, s.avg_cost_paise,
           coalesce(bk.q, 0) booked, coalesce(st.sell_days, 0) sell_days, cfg.lead, cfg.cyc,
           (0.6 * coalesce(st.last7, 0)::numeric / least(hist.h, 7) + 0.4 * coalesce(st.tot, 0)::numeric / hist.h)
             * case when s.on_hand <= 0 then 1.25 else 1 end * coalesce(season.f, 1) rate,
           case when hist.h > 1 then sqrt(greatest((coalesce(st.sq, 0) - coalesce(st.tot, 0)::numeric * coalesce(st.tot, 0) / hist.h) / (hist.h - 1), 0)) else 0 end sd
      from public.stock s join public.variant v on v.id = s.variant_id join public.pack p on p.id = v.pack_id
      join public._bought_items() bi on bi.variant_id = s.variant_id
      cross join cfg cross join hist cross join season
      left join st on st.variant_id = s.variant_id left join booked bk on bk.variant_id = s.variant_id
     where v.active and p.active),
  calc as (
    select b.*, b.rate * (b.lead + b.cyc) dem,
           case when b.sell_days >= 2 then least(1.28 * b.sd * sqrt(b.lead + b.cyc), b.rate * (b.lead + b.cyc)) else 0 end safety
      from base b),
  fin as (
    select c.item, c.sort, c.on_hand, c.booked, round(c.rate, 1) per_day,
           case when c.rate > 0 then round((c.on_hand - c.booked) / c.rate, 1) end days_left,
           greatest(0, ceil(greatest(c.dem, c.booked) + c.safety - c.on_hand))::int need,
           (c.rate > 0 and (c.on_hand - c.booked) / c.rate <= c.lead) or (c.booked > 0 and c.on_hand <= c.booked) urgent,
           (c.sell_days < 2 and c.rate > 0) thin, c.avg_cost_paise
      from calc c)
  select coalesce(jsonb_agg(to_jsonb(f) - 'sort' - 'avg_cost_paise' || jsonb_build_object('cost_paise', f.need * f.avg_cost_paise)
                            order by f.urgent desc, f.days_left nulls last, f.sort), '[]'::jsonb)
    from (select * from fin where need > 0 order by urgent desc, days_left nulls last, sort limit 30) f
$$;
