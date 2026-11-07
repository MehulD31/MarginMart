-- Counter sales in the admin app, undo for wrong entries, safer Telegram sessions.
--  * cash_sale can be voided (admin): stock goes back, month totals and margin ignore it, the sheet shows VOID.
--  * counter_sales(from, to): staff read of bills + lines for the admin "Counter sales" page.
--  * sheet_rows: adds area + status columns.
--  * bot_session_get: a half-finished /sale expires after 30 minutes (was 6 hours), so a Pepsi scheme message
--    pasted later is not swallowed by an old sale.

alter table public.cash_sale
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users (id),
  add column if not exists void_reason text check (length(void_reason) <= 200);

create or replace function public.counter_sales(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'INVALID_INPUT'; end if;
  return coalesce((
    select jsonb_agg(b order by b ->> 'at' desc) from (
      select jsonb_build_object(
        'id', c.id, 'number', c.number, 'at', c.created_at, 'shop', s.name, 'locality', s.locality, 'phone', s.phone,
        'mode', c.payment_mode, 'total_paise', c.total_paise, 'by', c.entered_by,
        'voided', c.voided_at is not null, 'void_reason', c.void_reason,
        'margin_paise', (select sum(l.qty * (l.price_paise - l.buy_paise)) from public.cash_sale_line l where l.cash_sale_id = c.id),
        'lines', (select jsonb_agg(jsonb_build_object(
            'item', case when v.flavour_en = p.name_en then p.name_en else v.flavour_en || ' ' || p.name_en end,
            'qty', l.qty, 'price_paise', l.price_paise) order by l.id)
          from public.cash_sale_line l join public.variant v on v.id = l.variant_id join public.pack p on p.id = v.pack_id
          where l.cash_sale_id = c.id)) b
      from public.cash_sale c join public.shop s on s.id = c.shop_id
      where (c.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
      order by c.created_at desc limit 500) x), '[]'::jsonb);
end $$;
revoke all on function public.counter_sales(date, date) from public;
grant execute on function public.counter_sales(date, date) to authenticated;

create or replace function public.void_cash_sale(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.cash_sale;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'INVALID_INPUT'; end if;
  select * into c from public.cash_sale where id = p_id for update;
  if c.id is null then raise exception 'NOT_FOUND'; end if;
  if c.voided_at is not null then raise exception 'ALREADY_VOIDED'; end if;
  insert into public.stock_move (variant_id, qty, kind, reason, cash_sale_id)
  select l.variant_id, l.qty, 'adjust', 'Void ' || c.number || ': ' || left(trim(p_reason), 150), c.id
  from public.cash_sale_line l where l.cash_sale_id = c.id;
  update public.cash_sale set voided_at = now(), voided_by = auth.uid(), void_reason = left(trim(p_reason), 200) where id = c.id;
end $$;
revoke all on function public.void_cash_sale(uuid, text) from public;
grant execute on function public.void_cash_sale(uuid, text) to authenticated;

-- Month totals skip voided bills.
create or replace function public.month_stats()
returns table (cases bigint, sales_paise bigint, cost_paise bigint)
language sql stable security definer set search_path = '' as $$
  with since as (select date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' t),
  d as (
    select dl.qty_delivered q, dl.qty_delivered * dl.unit_price_paise s,
           dl.qty_delivered * coalesce(nullif(st.avg_cost_paise, 0), greatest(i.trade_price_paise - (select default_margin_paise from public.business_settings), 0), dl.unit_price_paise) c
    from public.delivery_line dl join public.invoice inv on inv.id = dl.invoice_id join public.variant v on v.id = dl.variant_id
    left join public.stock st on st.variant_id = dl.variant_id
    left join public.price_list_item i on i.pack_id = v.pack_id and i.price_list_id = (select id from public.price_list where status = 'active')
    where inv.created_at >= (select t from since)
    union all
    select l.qty, l.qty * l.price_paise, l.qty * l.buy_paise from public.cash_sale_line l join public.cash_sale cs on cs.id = l.cash_sale_id
    where cs.created_at >= (select t from since) and cs.voided_at is null)
  select coalesce(sum(q), 0)::bigint, coalesce(sum(s), 0)::bigint, coalesce(sum(c), 0)::bigint from d where public.is_staff()
$$;

-- Sheet feed: every line, newest bills last, with area and OK / VOID status.
drop function if exists public.sheet_rows(text, bigint);
create function public.sheet_rows(p_key text, p_after bigint default 0)
returns table (line_id bigint, sold_at text, bill_no text, shop text, area text, phone text, item text, cases integer, price numeric,
               amount numeric, mode text, entered_by text, buy numeric, margin numeric, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.bot_secret where sheet_key = p_key and length(p_key) >= 40) then raise exception 'FORBIDDEN'; end if;
  return query
  select l.id, to_char(c.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'), c.number, s.name, s.locality, s.phone,
         case when v.flavour_en = p.name_en then p.name_en else v.flavour_en || ' ' || p.name_en end,
         l.qty, l.price_paise / 100.0, l.qty * l.price_paise / 100.0, upper(c.payment_mode), c.entered_by,
         l.buy_paise / 100.0, l.qty * (l.price_paise - l.buy_paise) / 100.0,
         case when c.voided_at is null then 'OK' else 'VOID' end
  from public.cash_sale_line l join public.cash_sale c on c.id = l.cash_sale_id join public.shop s on s.id = c.shop_id
  join public.variant v on v.id = l.variant_id join public.pack p on p.id = v.pack_id
  where l.id > coalesce(p_after, 0) order by l.id limit 2000;
end $$;
revoke all on function public.sheet_rows(text, bigint) from public;
grant execute on function public.sheet_rows(text, bigint) to anon, authenticated;

create or replace function public.bot_session_get(p_key text, p_user bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select state from public.bot_session where user_id = p_user and updated_at > now() - interval '30 minutes'), '{}'::jsonb);
end $$;
