-- Autopilot (thumb rule, 8 Nov): numbers for the automatic Telegram reports, a log so every job is idempotent and
-- watchable, and a queue for social posts. Called only by GitHub Actions with the service role (never by clients).
--   ops_daily(day)   one day's business: counter sales, route bills, cash/UPI collected, dues, stock, trucks, margin
--   ops_weekly(end)  last 7 days by day + best items + biggest dues
--   ops_log          one row per (job, key): a re-run of the same day's report sees it and does not send twice
--   social_post      approved poster -> queued post; the social job posts it to Facebook + Instagram
create table if not exists public.ops_log (
  job text not null, key text not null, status text not null default 'ok', detail jsonb,
  created_at timestamptz not null default now(), primary key (job, key));
alter table public.ops_log enable row level security;
revoke all on public.ops_log from anon, authenticated;

create table if not exists public.social_post (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'scheme', source_id uuid, image_url text not null, caption text not null,
  status text not null default 'queued' check (status in ('queued','posted','failed','skipped')),
  fb_post_id text, ig_media_id text, error text, attempts int not null default 0,
  created_at timestamptz not null default now(), posted_at timestamptz,
  unique (kind, source_id));
alter table public.social_post enable row level security;
revoke all on public.social_post from anon, authenticated;

create or replace function public.ops_daily(p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Asia/Kolkata');
  v_to   timestamptz := ((p_day + 1)::timestamp at time zone 'Asia/Kolkata');
  r jsonb;
begin
  with cs as (
    select s.id, s.payment_mode, s.total_paise from public.cash_sale s
    where s.created_at >= v_from and s.created_at < v_to and s.voided_at is null),
  csl as (
    select l.* from public.cash_sale_line l join cs on cs.id = l.cash_sale_id),
  inv as (
    select i.* from public.invoice i where i.created_at >= v_from and i.created_at < v_to and coalesce(i.status,'') <> 'void'),
  dl as (
    select d.qty_delivered, d.unit_price_paise, d.variant_id from public.delivery_line d join inv on inv.id = d.invoice_id),
  pay as (
    select e.payment_mode::text mode, -sum(e.amount_paise) amt from public.ledger_entry e
    where e.type = 'payment' and e.created_at >= v_from and e.created_at < v_to group by 1),
  bal as (
    select sh.id, sh.name, sh.locality, b.balance, b.overdue
    from public.shop sh cross join lateral public.shop_balance(sh.id) b where sh.active and b.balance > 0),
  sold as (
    select variant_id, sum(qty) q from (select variant_id, qty from csl union all select variant_id, qty_delivered from dl) x group by 1)
  select jsonb_build_object(
    'day', p_day,
    'counter', jsonb_build_object(
      'bills', (select count(*) from cs),
      'cases', coalesce((select sum(qty) from csl), 0),
      'total_paise', coalesce((select sum(total_paise) from cs), 0),
      'cash_paise', coalesce((select sum(total_paise) from cs where payment_mode = 'cash'), 0),
      'upi_paise', coalesce((select sum(total_paise) from cs where payment_mode <> 'cash'), 0),
      'margin_paise', coalesce((select sum((price_paise - coalesce(buy_paise, price_paise)) * qty) from csl), 0),
      'below_cost_lines', (select count(*) from csl where buy_paise is not null and price_paise < buy_paise)),
    'route', jsonb_build_object(
      'bills', (select count(*) from inv),
      'cases', coalesce((select sum(qty_delivered) from dl), 0),
      'total_paise', coalesce((select sum(total_paise) from inv), 0)),
    'collected', jsonb_build_object(
      'cash_paise', coalesce((select amt from pay where mode = 'cash'), 0),
      'upi_paise', coalesce((select amt from pay where mode = 'upi'), 0)),
    'dues', jsonb_build_object(
      'total_paise', coalesce((select sum(balance) from bal), 0),
      'overdue_paise', coalesce((select sum(overdue) from bal), 0),
      'shops', (select count(*) from bal),
      'top', coalesce((select jsonb_agg(t) from (select name, locality, balance, overdue from bal order by overdue desc, balance desc limit 8) t), '[]')),
    'stock', jsonb_build_object(
      'low', coalesce((select jsonb_agg(t) from (
        select p.name_en || coalesce(' ' || nullif(v.flavour_en, ''), '') item, s.on_hand, s.low_threshold
        from public.stock s join public.variant v on v.id = s.variant_id join public.pack p on p.id = v.pack_id
        where v.active and p.active and s.on_hand <= s.low_threshold order by s.on_hand, p.sort limit 15) t), '[]'),
      'value_paise', coalesce((select sum(greatest(on_hand, 0)::bigint * avg_cost_paise) from public.stock), 0)),
    'top_items', coalesce((select jsonb_agg(t) from (
        select p.name_en || coalesce(' ' || nullif(v.flavour_en, ''), '') item, sold.q cases
        from sold join public.variant v on v.id = sold.variant_id join public.pack p on p.id = v.pack_id
        order by sold.q desc limit 5) t), '[]'),
    'trucks', coalesce((select jsonb_agg(t) from (
        select r.name route, rp.status::text status, (h.route_day_plan_id is not null) closed, h.received_at is not null cash_received,
               h.expected_cash_paise, h.handed_cash_paise
        from public.route_day_plan rp join public.route r on r.id = rp.route_id
        left join public.cash_handover h on h.route_day_plan_id = rp.id
        where rp.date = p_day order by r.name) t), '[]'),
    'open_orders_tomorrow', (select count(*) from public.orders o join public.route_day_plan rp on rp.id = o.route_day_plan_id
        where rp.date = p_day + 1 and o.status in ('placed','locked'))
  ) into r;
  return r;
end $$;

create or replace function public.ops_weekly(p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'end', p_end,
    'days', (select jsonb_agg(public.ops_daily(d::date) - 'dues' - 'stock' - 'trucks' order by d)
             from generate_series(p_end - 6, p_end, interval '1 day') d),
    'prev_week_counter_cases', coalesce((select sum(l.qty) from public.cash_sale s join public.cash_sale_line l on l.cash_sale_id = s.id
        where s.voided_at is null and s.created_at >= ((p_end - 13)::timestamp at time zone 'Asia/Kolkata')
          and s.created_at < ((p_end - 6)::timestamp at time zone 'Asia/Kolkata')), 0),
    'prev_week_route_cases', coalesce((select sum(d.qty_delivered) from public.invoice i join public.delivery_line d on d.invoice_id = i.id
        where coalesce(i.status,'') <> 'void' and i.created_at >= ((p_end - 13)::timestamp at time zone 'Asia/Kolkata')
          and i.created_at < ((p_end - 6)::timestamp at time zone 'Asia/Kolkata')), 0),
    'new_shops', (select count(*) from public.shop where created_at >= ((p_end - 6)::timestamp at time zone 'Asia/Kolkata')),
    'today', public.ops_daily(p_end)
  ) into r;
  return r;
end $$;

revoke execute on function public.ops_daily(date) from public, anon, authenticated;
revoke execute on function public.ops_weekly(date) from public, anon, authenticated;
grant execute on function public.ops_daily(date) to service_role;
grant execute on function public.ops_weekly(date) to service_role;
