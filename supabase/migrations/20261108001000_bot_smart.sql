-- Smarter Telegram bot: instant answers from Vercel (no GitHub run). All bot-key checked, read only,
-- thin wrappers over the ops_* numbers the automatic reports already use.
create or replace function public.bot_day(p_key text, p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return public.ops_daily(p_day);
end $$;

create or replace function public.bot_week(p_key text, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return public.ops_weekly(p_end);
end $$;

create or replace function public.bot_reorder(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return public.ops_reorder(7);
end $$;

-- One shop at a glance: balance, overdue, last entries, last order / sale.
create or replace function public.bot_shop_card(p_key text, p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'locality', s.locality, 'phone', s.phone, 'owner', s.owner_name,
    'route', (select rt.name from public.route rt where rt.id = s.route_id),
    'balance', b.balance, 'overdue', b.overdue, 'credit_days', s.credit_days,
    'entries', coalesce((select jsonb_agg(e order by e.created_at desc) from (
        select l.type::text type, l.amount_paise, l.payment_mode::text mode, l.created_at
          from public.ledger_entry l where l.shop_id = s.id order by l.created_at desc limit 5) e), '[]'),
    'last_order', (select max(o.created_at) from public.orders o where o.shop_id = s.id and o.status <> 'cancelled'),
    'last_sale', (select max(c.created_at) from public.cash_sale c where c.shop_id = s.id and c.voided_at is null),
    'orders_30d', (select count(*) from public.orders o where o.shop_id = s.id and o.status <> 'cancelled' and o.created_at > now() - interval '30 days')
      + (select count(*) from public.cash_sale c where c.shop_id = s.id and c.voided_at is null and c.created_at > now() - interval '30 days'))
  into r
  from public.shop s cross join lateral public.shop_balance(s.id) b where s.id = p_shop;
  return r;
end $$;

-- /due returns ids too, so each shop can be a button.
drop function if exists public.bot_due(text, text);
create function public.bot_due(p_key text, p_q text default null)
returns table (id uuid, name text, locality text, phone text, balance bigint, overdue bigint, last_payment timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return query
    select s.id, s.name, s.locality, s.phone, b.balance, b.overdue,
           (select max(e.created_at) from public.ledger_entry e where e.shop_id = s.id and e.type = 'payment')
      from public.shop s cross join lateral public.shop_balance(s.id) b
     where s.active and (p_q is null and b.balance > 0
        or p_q is not null and (s.name ilike '%' || p_q || '%' or s.phone like '%' || p_q || '%' or s.locality ilike '%' || p_q || '%'))
     order by b.overdue desc, b.balance desc limit 10;
end $$;

do $$ declare f text; begin
  foreach f in array array['bot_day(text, date)', 'bot_week(text, date)', 'bot_reorder(text)', 'bot_shop_card(text, uuid)', 'bot_due(text, text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
