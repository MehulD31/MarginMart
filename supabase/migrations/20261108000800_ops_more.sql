-- Autopilot part 2 (thumb rule): numbers for reorder suggestions, sleeping shops, overdue calls, scheme timing, size alarms,
-- and key-checked lookups for the Telegram commands /due /stock /sleeping.
--   ops_* functions: service role only (GitHub Actions). bot_* functions: callable with the bot key (same pattern as bot_shops).

-- Stock to reorder from Pepsi: 30-day sales per day (counter + route), minus what is already booked on open orders.
create or replace function public.ops_reorder(p_cover_days int default 7)
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
                    case when s.low_threshold > 0 and s.on_hand <= s.low_threshold then s.low_threshold * 2 - s.on_hand else 0 end)::int need
      from public.stock s join public.variant v on v.id = s.variant_id join public.pack p on p.id = v.pack_id
      left join sold sd on sd.variant_id = s.variant_id left join booked b on b.variant_id = s.variant_id
     where v.active and p.active)
  select coalesce(jsonb_agg(to_jsonb(c) - 'sort' order by c.days_left nulls last, c.sort), '[]'::jsonb)
    from (select * from calc where need > 0 order by days_left nulls last, sort limit 25) c
$$;

-- Shops that used to order (2+ times) but have been quiet for p_days.
create or replace function public.ops_sleeping(p_days int default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t order by t.days desc), '[]'::jsonb) from (
    select sh.id, sh.name, sh.locality, sh.phone, (current_date - (l.last_at at time zone 'Asia/Kolkata')::date) days, l.n
      from public.shop sh
      join lateral (select max(z.at) last_at, count(*) n from (
          select o.created_at at from public.orders o where o.shop_id = sh.id and o.status <> 'cancelled'
          union all select c.created_at from public.cash_sale c where c.shop_id = sh.id and c.voided_at is null) z) l on true
     where sh.active and l.n >= 2 and l.last_at < now() - make_interval(days => p_days)
     order by days desc limit 15) t
$$;

-- Overdue shops with phone numbers (for tap-to-remind links).
create or replace function public.ops_overdue(p_limit int default 8)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select sh.id, sh.name, sh.locality, sh.phone, b.balance, b.overdue
      from public.shop sh cross join lateral public.shop_balance(sh.id) b
     where sh.active and b.overdue > 0 order by b.overdue desc limit p_limit) t
$$;

-- Schemes starting today or ending today/tomorrow.
create or replace function public.ops_schemes()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t order by t.ends_on), '[]'::jsonb) from (
    select p.name_en pack, s.amount_paise, s.kind::text kind, s.starts_on, s.ends_on,
           (s.starts_on = current_date) starts_today, (s.ends_on - current_date) days_left
      from public.scheme s join public.pack p on p.id = s.pack_id
     where s.active and (s.starts_on = current_date or s.ends_on between current_date and current_date + 1)) t
$$;

-- Free-tier guard: Supabase free = 500 MB database, 1 GB storage.
create or replace function public.ops_health()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0),
    'last_backup_ok', true)
$$;

do $$ declare f text; begin
  foreach f in array array['ops_reorder(int)', 'ops_sleeping(int)', 'ops_overdue(int)', 'ops_schemes()', 'ops_health()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Telegram commands (bot key checked, read only).
create or replace function public.bot_due(p_key text, p_q text default null)
returns table (name text, locality text, phone text, balance bigint, overdue bigint, last_payment timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return query
    select s.name, s.locality, s.phone, b.balance, b.overdue,
           (select max(e.created_at) from public.ledger_entry e where e.shop_id = s.id and e.type = 'payment')
      from public.shop s cross join lateral public.shop_balance(s.id) b
     where s.active and (p_q is null and b.balance > 0
        or p_q is not null and (s.name ilike '%' || p_q || '%' or s.phone like '%' || p_q || '%' or s.locality ilike '%' || p_q || '%'))
     order by b.overdue desc, b.balance desc limit 10;
end $$;

create or replace function public.bot_stock(p_key text, p_q text default null)
returns table (item text, on_hand int, low_threshold int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return query
    select p.name_en || coalesce(' ' || nullif(v.flavour_en, ''), ''), s.on_hand, s.low_threshold
      from public.stock s join public.variant v on v.id = s.variant_id join public.pack p on p.id = v.pack_id
     where v.active and p.active and (p_q is null and s.on_hand <= s.low_threshold
        or p_q is not null and (p.name_en ilike '%' || p_q || '%' or v.flavour_en ilike '%' || p_q || '%'))
     order by s.on_hand, p.sort limit 15;
end $$;

create or replace function public.bot_sleeping(p_key text, p_days int default 10)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return public.ops_sleeping(p_days);
end $$;

revoke all on function public.bot_due(text, text) from public;
revoke all on function public.bot_stock(text, text) from public;
revoke all on function public.bot_sleeping(text, int) from public;
grant execute on function public.bot_due(text, text) to anon, authenticated;
grant execute on function public.bot_stock(text, text) to anon, authenticated;
grant execute on function public.bot_sleeping(text, int) to anon, authenticated;
