-- Money accounts: where a shop's payment actually went (company bank, a partner's personal account, cash box).
-- Payments that land in a personal account are still company money: the app shows how much each person holds
-- and the owner records "moved to company" when it is transferred. Nothing here changes sales, stock or khata.
--
--   money_account     the places money can land (admin manages; seeded: Company bank, Shobhit (personal), Cash)
--   payment_account   override per payment (counter sale or khata payment). No row = default by mode:
--                     cash -> the Cash account, upi -> the Company bank account.
--   money_transfer    "moved to company" entries that reduce what a person holds (voidable, never deleted)

create table if not exists public.money_account (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 60),
  kind text not null check (kind in ('company', 'personal', 'cash')),
  active boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
insert into public.money_account (name, kind, sort) values
  ('Company bank', 'company', 1), ('Shobhit (personal)', 'personal', 2), ('Cash', 'cash', 3)
on conflict (name) do nothing;

create table if not exists public.payment_account (
  kind text not null check (kind in ('counter_sale', 'payment')),
  ref_id uuid not null,
  account_id uuid not null references public.money_account(id),
  set_by uuid,
  set_at timestamptz not null default now(),
  primary key (kind, ref_id)
);

create table if not exists public.money_transfer (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique,
  account_id uuid not null references public.money_account(id),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 100000000),
  moved_on date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);
create index if not exists money_transfer_account on public.money_transfer (account_id) where voided_at is null;

alter table public.money_account enable row level security;
alter table public.payment_account enable row level security;
alter table public.money_transfer enable row level security;
drop policy if exists money_account_staff_read on public.money_account;
create policy money_account_staff_read on public.money_account for select using (public.is_staff());
-- payment_account and money_transfer: no direct access, only through the functions below.

-- ---------- helpers ----------
create or replace function public._money_default(p_mode text) returns uuid
language sql stable security definer set search_path to '' as $$
  select id from public.money_account
   where active and kind = case when p_mode = 'cash' then 'cash' else 'company' end
   order by sort, created_at limit 1
$$;

create or replace function public._set_payment_account(p_kind text, p_ref uuid, p_account uuid, p_actor uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_before uuid;
begin
  if p_kind not in ('counter_sale', 'payment') or p_ref is null then raise exception 'INVALID_INPUT'; end if;
  if p_account is null then return; end if;
  if not exists (select 1 from public.money_account where id = p_account and active) then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if p_kind = 'counter_sale' and not exists (select 1 from public.cash_sale where id = p_ref) then raise exception 'NOT_FOUND'; end if;
  if p_kind = 'payment' and not exists (select 1 from public.ledger_entry where id = p_ref and type = 'payment') then raise exception 'NOT_FOUND'; end if;
  select account_id into v_before from public.payment_account where kind = p_kind and ref_id = p_ref;
  if v_before is not distinct from p_account then return; end if;
  insert into public.payment_account (kind, ref_id, account_id, set_by) values (p_kind, p_ref, p_account, p_actor)
  on conflict (kind, ref_id) do update set account_id = excluded.account_id, set_by = excluded.set_by, set_at = now();
  insert into public.audit_log (actor, table_name, row_id, action, before, after)
  values (p_actor, 'payment_account', p_kind || ':' || p_ref, 'paid_into',
          case when v_before is null then null else jsonb_build_object('account_id', v_before) end, jsonb_build_object('account_id', p_account));
end $$;

/** Every money-in (counter sales that are not cancelled + khata payments that are not voided) with where it went. */
create or replace function public._money_payments(p_from date, p_to date)
returns table (kind text, ref_id uuid, at timestamptz, number text, shop text, mode text, amount_paise bigint,
               account_id uuid, account text, account_kind text, explicit boolean)
language sql stable security definer set search_path to '' as $$
  with src as (
    select 'counter_sale'::text kind, c.id ref_id, c.created_at at, c.number, s.name shop, c.payment_mode mode, c.total_paise amount_paise
      from public.cash_sale c join public.shop s on s.id = c.shop_id
     where c.voided_at is null
    union all
    select 'payment', l.id, l.created_at, coalesce('UPI ' || l.upi_ref, 'Khata payment'), s.name, l.payment_mode::text, -l.amount_paise
      from public.ledger_entry l join public.shop s on s.id = l.shop_id
     where l.type = 'payment' and not exists (select 1 from public.ledger_entry r where r.reverses_id = l.id))
  select src.kind, src.ref_id, src.at, src.number, src.shop, src.mode, src.amount_paise,
         a.id, a.name, a.kind, pa.account_id is not null
    from src
    left join public.payment_account pa on pa.kind = src.kind and pa.ref_id = src.ref_id
    left join public.money_account a on a.id = coalesce(pa.account_id, public._money_default(src.mode))
   where (p_from is null or src.at >= (p_from::timestamp at time zone 'Asia/Kolkata'))
     and (p_to is null or src.at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
   order by src.at desc
$$;

/** What each personal account / cash box holds: received - moved to company. oldest_at = oldest payment not yet covered by a move. */
create or replace function public._money_holdings() returns jsonb
language sql stable security definer set search_path to '' as $$
  with p as (select * from public._money_payments(null, null) where account_kind in ('personal', 'cash')),
  moved as (select account_id, sum(amount_paise) moved from public.money_transfer where voided_at is null group by account_id),
  run as (select p.*, sum(p.amount_paise) over (partition by p.account_id order by p.at, p.ref_id) cum from p),
  agg as (
    select a.id, a.name, a.kind,
           coalesce((select sum(amount_paise) from p where p.account_id = a.id), 0) received,
           coalesce((select count(*) from p where p.account_id = a.id), 0) payments,
           coalesce(m.moved, 0) moved,
           (select min(r.at) from run r where r.account_id = a.id and r.cum > coalesce(m.moved, 0)) oldest_at
      from public.money_account a left join moved m on m.account_id = a.id
     where a.kind in ('personal', 'cash') and (a.active or exists (select 1 from p where p.account_id = a.id)))
  select coalesce(jsonb_agg(jsonb_build_object(
           'account_id', id, 'name', name, 'kind', kind, 'received_paise', received, 'moved_paise', moved,
           'holding_paise', received - moved, 'payments', payments, 'oldest_at', oldest_at,
           'oldest_days', case when oldest_at is null then null
                               else ((now() at time zone 'Asia/Kolkata')::date - (oldest_at at time zone 'Asia/Kolkata')::date) end)
         order by kind desc, name), '[]'::jsonb)
    from agg
$$;

-- ---------- app (admin / manager) ----------
create or replace function public.money_accounts() returns setof public.money_account
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return query select * from public.money_account order by active desc, sort, name;
end $$;

create or replace function public.money_account_save(p_id uuid, p_name text, p_kind text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(trim(p_name)), 0) < 2 or p_kind not in ('company', 'personal', 'cash') then raise exception 'INVALID_INPUT'; end if;
  if p_id is null then
    insert into public.money_account (name, kind) values (trim(p_name), p_kind) returning id into v_id;
  else
    update public.money_account set name = trim(p_name), kind = p_kind, active = coalesce(p_active, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  insert into public.audit_log (actor, table_name, row_id, action, after)
  values (auth.uid(), 'money_account', v_id::text, case when p_id is null then 'insert' else 'update' end,
          jsonb_build_object('name', trim(p_name), 'kind', p_kind, 'active', coalesce(p_active, true)));
  return v_id;
exception when unique_violation then raise exception 'ACCOUNT_EXISTS';
end $$;

create or replace function public.money_payments(p_from date, p_to date)
returns table (kind text, ref_id uuid, at timestamptz, number text, shop text, mode text, amount_paise bigint,
               account_id uuid, account text, account_kind text, explicit boolean)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return query select * from public._money_payments(p_from, p_to);
end $$;

create or replace function public.money_holdings() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return public._money_holdings();
end $$;

create or replace function public.set_payment_account(p_kind text, p_ref uuid, p_account uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  perform public._set_payment_account(p_kind, p_ref, p_account, auth.uid());
end $$;

/** Counter sale + where the money went, in one transaction. */
create or replace function public.counter_sale_save_into(p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb, p_account uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb;
begin
  r := public.counter_sale_save(p_id, p_action, p_shop, p_mode, p_lines);
  perform public._set_payment_account('counter_sale', (r->>'id')::uuid, p_account, auth.uid());
  return r;
end $$;

/** Khata payment + where the money went, in one transaction (a repeat of the same action changes nothing). */
create or replace function public.record_payment_into(p_action_id uuid, p_shop_id uuid, p_mode text, p_amount_paise bigint,
                                                      p_upi_ref text default null, p_note text default null, p_account uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; v_repeat boolean; v_entry uuid;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  v_repeat := exists (select 1 from public.client_action where id = p_action_id);
  r := public.record_payment(p_action_id, p_shop_id, p_mode, p_amount_paise, p_upi_ref, p_note);
  if not v_repeat and p_account is not null then
    select id into v_entry from public.ledger_entry
     where shop_id = p_shop_id and type = 'payment' and amount_paise = -p_amount_paise and created_at = now()
     order by id desc limit 1;
    if v_entry is not null then perform public._set_payment_account('payment', v_entry, p_account, auth.uid()); end if;
  end if;
  return r;
end $$;

create or replace function public.record_money_transfer(p_action uuid, p_account uuid, p_amount_paise bigint, p_on date, p_note text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_hold bigint; a record;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select id into v_id from public.money_transfer where action_id = p_action;
  if v_id is not null then return jsonb_build_object('id', v_id, 'repeat', true); end if;
  select * into a from public.money_account where id = p_account;
  if a.id is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if a.kind = 'company' then raise exception 'INVALID_INPUT'; end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_on is null or p_on > (now() at time zone 'Asia/Kolkata')::date then raise exception 'INVALID_INPUT'; end if;
  select (h->>'holding_paise')::bigint into v_hold from jsonb_array_elements(public._money_holdings()) h where (h->>'account_id')::uuid = p_account;
  if p_amount_paise > coalesce(v_hold, 0) then raise exception 'MORE_THAN_HELD'; end if;
  insert into public.money_transfer (action_id, account_id, amount_paise, moved_on, note, created_by)
  values (p_action, p_account, p_amount_paise, p_on, nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid()) returning id into v_id;
  insert into public.audit_log (actor, table_name, row_id, action, after)
  values (auth.uid(), 'money_transfer', v_id::text, 'insert', jsonb_build_object('account', a.name, 'amount_paise', p_amount_paise, 'moved_on', p_on));
  return jsonb_build_object('id', v_id, 'holding_paise', coalesce(v_hold, 0) - p_amount_paise);
end $$;

create or replace function public.money_transfers() returns table (id uuid, account_id uuid, account text, amount_paise bigint, moved_on date,
  note text, created_at timestamptz, voided_at timestamptz, void_reason text)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return query select t.id, t.account_id, a.name, t.amount_paise, t.moved_on, t.note, t.created_at, t.voided_at, t.void_reason
    from public.money_transfer t join public.money_account a on a.id = t.account_id order by t.moved_on desc, t.created_at desc limit 200;
end $$;

create or replace function public.void_money_transfer(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then raise exception 'INVALID_INPUT'; end if;
  update public.money_transfer set voided_at = now(), voided_by = auth.uid(), void_reason = left(trim(p_reason), 200)
   where id = p_id and voided_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log (actor, table_name, row_id, action, after)
  values (auth.uid(), 'money_transfer', p_id::text, 'void', jsonb_build_object('reason', left(trim(p_reason), 200)));
end $$;

-- ---------- Telegram bot (key-checked) ----------
create or replace function public.bot_money_accounts(p_key text)
returns table (id uuid, name text, kind text) language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return query select a.id, a.name, a.kind from public.money_account a where a.active order by a.sort, a.name;
end $$;

/** Telegram sale + where the money went, in one transaction. A repeat (double tap) never changes the account. */
create or replace function public.bot_record_sale_into(p_key text, p_action uuid, p_shop uuid, p_lines jsonb, p_mode text, p_by text, p_account uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; v_id uuid;
begin
  r := public.bot_record_sale(p_key, p_action, p_shop, p_lines, p_mode, p_by);
  if coalesce((r->>'repeat')::boolean, false) or p_account is null then return r; end if;
  select id into v_id from public.cash_sale where action_id = p_action;
  perform public._set_payment_account('counter_sale', v_id, p_account, null);
  return r || jsonb_build_object('account', (select name from public.money_account where id = p_account));
end $$;

create or replace function public.bot_money_holdings(p_key text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return public._money_holdings();
end $$;

-- ---------- grants ----------
revoke all on function public._money_default(text), public._set_payment_account(text, uuid, uuid, uuid),
  public._money_payments(date, date), public._money_holdings() from public, anon, authenticated;
grant execute on function public._money_holdings() to service_role;   -- autopilot reports (scripts/ops)
grant execute on function public._money_payments(date, date) to service_role;
revoke all on function public.money_accounts(), public.money_account_save(uuid, text, text, boolean), public.money_payments(date, date),
  public.money_holdings(), public.set_payment_account(text, uuid, uuid), public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid),
  public.record_payment_into(uuid, uuid, text, bigint, text, text, uuid), public.record_money_transfer(uuid, uuid, bigint, date, text),
  public.money_transfers(), public.void_money_transfer(uuid, text) from public, anon;
grant execute on function public.money_accounts(), public.money_account_save(uuid, text, text, boolean), public.money_payments(date, date),
  public.money_holdings(), public.set_payment_account(text, uuid, uuid), public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid),
  public.record_payment_into(uuid, uuid, text, bigint, text, text, uuid), public.record_money_transfer(uuid, uuid, bigint, date, text),
  public.money_transfers(), public.void_money_transfer(uuid, text) to authenticated;
revoke all on function public.bot_money_accounts(text), public.bot_record_sale_into(text, uuid, uuid, jsonb, text, text, uuid),
  public.bot_money_holdings(text) from public;
grant execute on function public.bot_money_accounts(text), public.bot_record_sale_into(text, uuid, uuid, jsonb, text, text, uuid),
  public.bot_money_holdings(text) to anon, authenticated;

-- ---------- check the account BEFORE making the bill, so a refusal never uses up a bill number ----------
create or replace function public._money_check(p_account uuid) returns void
language plpgsql stable security definer set search_path to '' as $$
begin
  if p_account is not null and not exists (select 1 from public.money_account where id = p_account and active) then raise exception 'ACCOUNT_NOT_FOUND'; end if;
end $$;
revoke all on function public._money_check(uuid) from public, anon, authenticated;

create or replace function public.counter_sale_save_into(p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb, p_account uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb;
begin
  perform public._money_check(p_account);
  r := public.counter_sale_save(p_id, p_action, p_shop, p_mode, p_lines);
  perform public._set_payment_account('counter_sale', (r->>'id')::uuid, p_account, auth.uid());
  return r;
end $$;

create or replace function public.bot_record_sale_into(p_key text, p_action uuid, p_shop uuid, p_lines jsonb, p_mode text, p_by text, p_account uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; v_id uuid;
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  perform public._money_check(p_account);
  r := public.bot_record_sale(p_key, p_action, p_shop, p_lines, p_mode, p_by);
  if coalesce((r->>'repeat')::boolean, false) or p_account is null then return r; end if;
  select id into v_id from public.cash_sale where action_id = p_action;
  perform public._set_payment_account('counter_sale', v_id, p_account, null);
  return r || jsonb_build_object('account', (select name from public.money_account where id = p_account));
end $$;

create or replace function public.record_payment_into(p_action_id uuid, p_shop_id uuid, p_mode text, p_amount_paise bigint,
                                                      p_upi_ref text default null, p_note text default null, p_account uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; v_repeat boolean; v_entry uuid;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  perform public._money_check(p_account);
  v_repeat := exists (select 1 from public.client_action where id = p_action_id);
  r := public.record_payment(p_action_id, p_shop_id, p_mode, p_amount_paise, p_upi_ref, p_note);
  if not v_repeat and p_account is not null then
    select id into v_entry from public.ledger_entry
     where shop_id = p_shop_id and type = 'payment' and amount_paise = -p_amount_paise and created_at = now()
     order by id desc limit 1;
    if v_entry is not null then perform public._set_payment_account('payment', v_entry, p_account, auth.uid()); end if;
  end if;
  return r;
end $$;
