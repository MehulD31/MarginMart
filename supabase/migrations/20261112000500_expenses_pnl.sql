-- Kharcha (owner, 12 Nov 2026): actual spends (petrol, rented vehicle, repairs, chai...) and a day/month P&L.
-- Rule against double counting: every fixed line is charged per working day EXCEPT the line that spends are booked
-- against (default "Miscellaneous"); for that line the real spends are charged instead.
create table if not exists public.expense (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  amount_paise bigint not null check (amount_paise > 0),
  category text not null,                  -- Petrol/Diesel, Vehicle rent, Repair, Tea/Food, Labour, Other
  budget_line text not null default 'Miscellaneous',
  note text,
  paid_from text not null default 'cash' check (paid_from in ('cash', 'upi', 'bank', 'partner')),
  source text not null default 'web' check (source in ('web', 'telegram')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  voided_at timestamptz
);
create index if not exists expense_day on public.expense (spent_on) where voided_at is null;
alter table public.expense enable row level security;
create policy expense_admin_all on public.expense for all using ((select public.is_admin())) with check ((select public.is_admin()));
create trigger expense_audit after insert or delete or update on public.expense for each row execute function audit_row();

-- Sales, cost of goods and cases for a date range (IST), same rules as month_stats.
create or replace function public.pnl_range(p_from date, p_to date)
returns table(cases bigint, sales_paise bigint, cost_paise bigint)
language sql stable security definer set search_path to '' as $$
  with b as (select (p_from::timestamp at time zone 'Asia/Kolkata') f, ((p_to + 1)::timestamp at time zone 'Asia/Kolkata') t),
  d as (
    select dl.qty_delivered q, dl.qty_delivered * dl.unit_price_paise s,
           dl.qty_delivered * coalesce(nullif(st.avg_cost_paise, 0), greatest(i.trade_price_paise - (select default_margin_paise from public.business_settings), 0), dl.unit_price_paise) c
    from public.delivery_line dl join public.invoice inv on inv.id = dl.invoice_id join public.variant v on v.id = dl.variant_id
    left join public.stock st on st.variant_id = dl.variant_id
    left join public.price_list_item i on i.pack_id = v.pack_id and i.price_list_id = (select id from public.price_list where status = 'active')
    where inv.created_at >= (select f from b) and inv.created_at < (select t from b)
    union all
    select l.qty, l.qty * l.price_paise, l.qty * l.buy_paise from public.cash_sale_line l join public.cash_sale cs on cs.id = l.cash_sale_id
    where cs.created_at >= (select f from b) and cs.created_at < (select t from b) and cs.voided_at is null
    union all
    select 0, -cs.discount_paise, 0 from public.cash_sale cs where cs.created_at >= (select f from b) and cs.created_at < (select t from b) and cs.voided_at is null and cs.discount_paise > 0)
  select coalesce(sum(q), 0)::bigint, coalesce(sum(s), 0)::bigint, coalesce(sum(c), 0)::bigint from d where public.is_admin() or current_user in ('postgres', 'service_role')
$$;

-- "petrol 800" from the KD Telegram bot (api/_ops.js). Only the owners' group can reach it (bot key).
create or replace function public.bot_add_expense(p_key text, p_amount_paise bigint, p_category text, p_note text, p_who text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v uuid;
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 50000000 then raise exception 'BAD_AMOUNT'; end if;
  insert into public.expense (amount_paise, category, note, source, created_by)
  values (p_amount_paise, p_category, nullif(trim(concat_ws(' · ', p_note, nullif(p_who, ''))), ''), 'telegram', null)
  returning id into v;
  return v;
end $$;
create or replace function public.bot_void_expense(p_key text, p_id uuid)
returns text language plpgsql security definer set search_path to '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  update public.expense set voided_at = now() where id = p_id and voided_at is null;
  return case when found then 'voided' else 'missing' end;
end $$;
revoke all on function public.bot_add_expense(text, bigint, text, text, text) from public;
revoke all on function public.bot_void_expense(text, uuid) from public;
grant execute on function public.bot_add_expense(text, bigint, text, text, text), public.bot_void_expense(text, uuid) to anon, authenticated;
grant execute on function public.pnl_range(date, date) to authenticated;
alter table public.business_settings add column if not exists spend_line text not null default 'Miscellaneous';

-- (applied as a second step pnl_range_days) pnl_range also returns active_days = days in the range with any sale;
-- the month's fixed share is charged for those days only (fixed / working_days x active days).
