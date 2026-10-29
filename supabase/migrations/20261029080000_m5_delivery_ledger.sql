-- M5: deliveries, bills, append-only shop ledger, payments, credit block, driver access.
-- Money in paise. Ledger sign: + the shop owes us (bill), − the shop paid (payment). Never updated or deleted.

create type public.ledger_type as enum ('invoice', 'payment', 'adjustment', 'reversal', 'opening');
create type public.pay_mode as enum ('cash', 'upi');
create type public.short_reason as enum ('out_of_stock', 'shop_refused', 'damaged', 'shop_closed', 'other');

create table public.invoice_counter (fy text primary key, last_no int not null default 0);

create table public.invoice (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  fy text not null,
  shop_id uuid not null references public.shop (id),
  order_id uuid not null unique references public.orders (id),
  route_day_plan_id uuid not null references public.route_day_plan (id),
  total_paise bigint not null check (total_paise >= 0),
  status text not null default 'issued' check (status in ('issued', 'void')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index invoice_shop on public.invoice (shop_id, created_at desc);

create table public.delivery_line (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  invoice_id uuid not null references public.invoice (id),
  variant_id uuid not null references public.variant (id),
  qty_ordered int not null default 0,
  qty_delivered int not null check (qty_delivered between 0 and 999),
  unit_price_paise bigint not null,
  short_reason public.short_reason,
  unique (order_id, variant_id)
);

create table public.ledger_entry (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shop (id),
  type public.ledger_type not null,
  amount_paise bigint not null check (amount_paise <> 0),
  invoice_id uuid references public.invoice (id),
  payment_mode public.pay_mode,
  upi_ref text check (length(upi_ref) <= 40),
  reverses_id uuid unique references public.ledger_entry (id),
  route_day_plan_id uuid references public.route_day_plan (id),
  note text check (length(note) <= 200),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (type <> 'payment' or (amount_paise < 0 and payment_mode is not null))
);
create index ledger_shop on public.ledger_entry (shop_id, created_at);
create index ledger_plan on public.ledger_entry (route_day_plan_id);

-- Idempotency for offline retries: one row per client action, holding the result we returned.
create table public.client_action (
  id uuid primary key,
  kind text not null,
  result jsonb not null,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Append-only: block edits and deletes for everyone except the owner role in migrations.
create function public.forbid_change() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'APPEND_ONLY'; end $$;
create trigger ledger_append_only before update or delete on public.ledger_entry for each row execute function public.forbid_change();
create trigger delivery_append_only before update or delete on public.delivery_line for each row execute function public.forbid_change();

-- ---------- balances ----------
-- Payments settle the oldest bills first, so overdue = bills older than credit_days minus everything paid.
create view public.v_shop_balance with (security_invoker = true) as
select s.id as shop_id,
  coalesce(sum(l.amount_paise), 0)::bigint as balance_paise,
  greatest(0, coalesce(sum(l.amount_paise) filter (where l.amount_paise > 0 and l.created_at < now() - make_interval(days => s.credit_days)), 0)
            + coalesce(sum(l.amount_paise) filter (where l.amount_paise < 0), 0))::bigint as overdue_paise,
  max(l.created_at) filter (where l.type = 'payment') as last_payment_at
from public.shop s left join public.ledger_entry l on l.shop_id = s.id
group by s.id, s.credit_days;
grant select on public.v_shop_balance to authenticated;

create function public.shop_balance(p_shop uuid, out balance bigint, out overdue bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.amount_paise), 0),
         greatest(0, coalesce(sum(l.amount_paise) filter (where l.amount_paise > 0 and l.created_at < now() - make_interval(days => s.credit_days)), 0)
                   + coalesce(sum(l.amount_paise) filter (where l.amount_paise < 0), 0))
  from public.shop s left join public.ledger_entry l on l.shop_id = s.id where s.id = p_shop group by s.credit_days
$$;
revoke execute on function public.shop_balance(uuid) from public, anon, authenticated;

-- ---------- driver scope ----------
create function public.driver_plan_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.route_day_plan
  where driver_id = auth.uid() and status in ('loaded', 'out') and date between (now() at time zone 'Asia/Kolkata')::date - 1 and (now() at time zone 'Asia/Kolkata')::date
$$;
revoke execute on function public.driver_plan_ids() from public, anon;
grant execute on function public.driver_plan_ids() to authenticated;

create policy plan_driver_read on public.route_day_plan for select to authenticated using (id in (select public.driver_plan_ids()));
create policy orders_driver_read on public.orders for select to authenticated using (route_day_plan_id in (select public.driver_plan_ids()));
create policy order_line_driver_read on public.order_line for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.route_day_plan_id in (select public.driver_plan_ids())));
create policy load_line_driver_read on public.load_line for select to authenticated using (route_day_plan_id in (select public.driver_plan_ids()));
create policy shop_driver_read on public.shop for select to authenticated
  using (route_id in (select p.route_id from public.route_day_plan p where p.id in (select public.driver_plan_ids())));

-- ---------- RLS for money tables (reads only; writes via RPCs) ----------
alter table public.invoice enable row level security;
alter table public.delivery_line enable row level security;
alter table public.ledger_entry enable row level security;
alter table public.invoice_counter enable row level security;
alter table public.client_action enable row level security;

create policy invoice_read on public.invoice for select to authenticated using (
  (select public.is_staff()) or shop_id = (select public.auth_shop_id()) or route_day_plan_id in (select public.driver_plan_ids()));
create policy delivery_line_read on public.delivery_line for select to authenticated using (
  exists (select 1 from public.invoice i where i.id = invoice_id));
create policy ledger_read on public.ledger_entry for select to authenticated using (
  (select public.is_staff()) or shop_id = (select public.auth_shop_id())
  or shop_id in (select o.shop_id from public.orders o where o.route_day_plan_id in (select public.driver_plan_ids())));
grant select on public.invoice, public.delivery_line, public.ledger_entry to authenticated;
revoke all on public.invoice, public.delivery_line, public.ledger_entry, public.invoice_counter, public.client_action from anon;
revoke insert, update, delete on public.invoice, public.delivery_line, public.ledger_entry from authenticated;
revoke all on public.invoice_counter, public.client_action from authenticated;

-- ---------- helpers ----------
create function public.fy_of(t timestamptz) returns text language sql immutable set search_path = '' as $$
  select case when extract(month from t at time zone 'Asia/Kolkata') >= 4
    then to_char(t at time zone 'Asia/Kolkata', 'YY') || '-' || to_char((t at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
    else to_char((t at time zone 'Asia/Kolkata') - interval '1 year', 'YY') || '-' || to_char(t at time zone 'Asia/Kolkata', 'YY') end
$$;

create function public.next_invoice_no() returns text language plpgsql security definer set search_path = '' as $$
declare v_fy text := public.fy_of(now()); v_no int; v_prefix text;
begin
  insert into public.invoice_counter (fy, last_no) values (v_fy, 1)
  on conflict (fy) do update set last_no = public.invoice_counter.last_no + 1
  returning last_no into v_no;
  select invoice_prefix into v_prefix from public.settings;
  return format('%s/%s/%s', v_prefix, v_fy, lpad(v_no::text, 6, '0'));
end $$;
revoke execute on function public.next_invoice_no() from public, anon, authenticated;

-- ---------- record_delivery ----------
-- p_lines: [{"variant_id", "qty", "reason"?}] covering what the shop actually took (order lines + van-sale extras).
-- p_payment: {"mode": "cash"|"upi", "amount_paise": int, "upi_ref"?} or null.
create function public.record_delivery(p_action_id uuid, p_plan_id uuid, p_shop_id uuid, p_lines jsonb, p_payment jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_done jsonb; v_plan public.route_day_plan; v_order public.orders; v_inv uuid; v_no text; v_total bigint; v_paid bigint := 0;
  v_bad int; v_partial boolean; v_bal record; v_pl uuid;
begin
  select result into v_done from public.client_action where id = p_action_id;
  if found then return v_done; end if;

  select * into v_plan from public.route_day_plan where id = p_plan_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or (v_plan.driver_id = auth.uid() and p_plan_id in (select public.driver_plan_ids()))) then raise exception 'FORBIDDEN'; end if;
  if v_plan.status not in ('loaded', 'out') then raise exception 'PLAN_NOT_OUT'; end if;
  if not exists (select 1 from public.shop where id = p_shop_id and route_id = v_plan.route_id) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_lines) <> 'array' or exists (
       select 1 from jsonb_array_elements(p_lines) e left join public.variant v on v.id = (e ->> 'variant_id')::uuid
       where v.id is null or (e ->> 'qty') !~ '^\d{1,3}$'
          or (e ? 'reason' and (e ->> 'reason') is not null and (e ->> 'reason') not in ('out_of_stock','shop_refused','damaged','shop_closed','other')))
     or (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_lines) e)
  then raise exception 'INVALID_INPUT'; end if;

  -- The shop's order on this truck, or a new van-sale order.
  select * into v_order from public.orders where shop_id = p_shop_id and route_day_plan_id = p_plan_id and status = 'locked' for update;
  if not found then
    if exists (select 1 from public.orders where shop_id = p_shop_id and route_day_plan_id = p_plan_id and status in ('delivered','partially_delivered')) then
      raise exception 'ALREADY_DELIVERED'; end if;
    select id into v_pl from public.price_list where status = 'active';
    if v_pl is null then raise exception 'NO_PRICE_LIST'; end if;
    insert into public.orders (shop_id, route_day_plan_id, source, status, price_list_id, placed_by)
    values (p_shop_id, p_plan_id, 'driver_van', 'locked', v_pl, auth.uid()) returning * into v_order;
  end if;

  v_no := public.next_invoice_no();
  insert into public.invoice (number, fy, shop_id, order_id, route_day_plan_id, total_paise, created_by)
  values (v_no, public.fy_of(now()), p_shop_id, v_order.id, p_plan_id, 0, auth.uid()) returning id into v_inv;

  -- Ordered lines keep their snapshot price; extras are priced from the order's price list.
  insert into public.delivery_line (order_id, invoice_id, variant_id, qty_ordered, qty_delivered, unit_price_paise, short_reason)
  select v_order.id, v_inv, v.id, coalesce(ol.qty_ordered, 0), coalesce((e ->> 'qty')::int, 0),
         coalesce(ol.unit_price_paise, pli.net_rate_paise),
         case when coalesce((e ->> 'qty')::int, 0) < coalesce(ol.qty_ordered, 0) then coalesce((e ->> 'reason')::public.short_reason, 'other') end
  from (select (x ->> 'variant_id')::uuid vid, x e from jsonb_array_elements(p_lines) x
        union all
        select ol2.variant_id, null from public.order_line ol2 where ol2.order_id = v_order.id
          and not exists (select 1 from jsonb_array_elements(p_lines) y where (y ->> 'variant_id')::uuid = ol2.variant_id)) src(vid, e)
  join public.variant v on v.id = src.vid
  left join public.order_line ol on ol.order_id = v_order.id and ol.variant_id = v.id
  left join public.price_list_item pli on pli.price_list_id = v_order.price_list_id and pli.pack_id = v.pack_id;

  if exists (select 1 from public.delivery_line where invoice_id = v_inv and unit_price_paise is null) then raise exception 'ITEM_UNAVAILABLE'; end if;

  -- Never deliver more than the truck carried.
  select count(*) into v_bad from (
    select dl.variant_id, sum(dl.qty_delivered) d from public.delivery_line dl join public.orders o on o.id = dl.order_id
    where o.route_day_plan_id = p_plan_id group by 1) t
  left join public.load_line ll on ll.route_day_plan_id = p_plan_id and ll.variant_id = t.variant_id
  where t.d > coalesce(ll.qty_ordered_total + ll.qty_spare, 0);
  if v_bad > 0 then raise exception 'NOT_ON_TRUCK'; end if;

  select coalesce(sum(qty_delivered * unit_price_paise), 0) into v_total from public.delivery_line where invoice_id = v_inv;
  update public.invoice set total_paise = v_total where id = v_inv;
  select bool_or(qty_delivered < qty_ordered) into v_partial from public.delivery_line where invoice_id = v_inv;
  update public.orders set status = case when v_total = 0 then 'cancelled'::public.order_status when v_partial then 'partially_delivered'::public.order_status else 'delivered'::public.order_status end,
         cancel_reason = case when v_total = 0 then 'nothing delivered' end, updated_at = now() where id = v_order.id;
  if v_total > 0 then
    insert into public.ledger_entry (shop_id, type, amount_paise, invoice_id, route_day_plan_id, note)
    values (p_shop_id, 'invoice', v_total, v_inv, p_plan_id, v_no);
  end if;

  if p_payment is not null and coalesce((p_payment ->> 'amount_paise')::bigint, 0) > 0 then
    if (p_payment ->> 'mode') not in ('cash', 'upi') or (p_payment ->> 'amount_paise') !~ '^\d{1,9}$' then raise exception 'INVALID_INPUT'; end if;
    v_paid := (p_payment ->> 'amount_paise')::bigint;
    insert into public.ledger_entry (shop_id, type, amount_paise, payment_mode, upi_ref, route_day_plan_id, note)
    values (p_shop_id, 'payment', -v_paid, (p_payment ->> 'mode')::public.pay_mode, nullif(left(p_payment ->> 'upi_ref', 40), ''), p_plan_id, v_no);
  end if;

  update public.route_day_plan set status = 'out' where id = p_plan_id and status = 'loaded';
  select * into v_bal from public.shop_balance(p_shop_id);
  v_done := jsonb_build_object('invoice_id', v_inv, 'invoice_no', v_no, 'total_paise', v_total, 'paid_paise', v_paid,
                               'balance_paise', v_bal.balance, 'overdue_paise', v_bal.overdue);
  insert into public.client_action (id, kind, result) values (p_action_id, 'delivery', v_done);
  return v_done;
end $$;
revoke execute on function public.record_delivery(uuid, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.record_delivery(uuid, uuid, uuid, jsonb, jsonb) to authenticated;

-- ---------- record_payment (office, or driver collecting old dues on the route) ----------
create function public.record_payment(p_action_id uuid, p_shop_id uuid, p_mode text, p_amount_paise bigint, p_upi_ref text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_done jsonb; v_plan uuid; v_bal record;
begin
  select result into v_done from public.client_action where id = p_action_id;
  if found then return v_done; end if;
  if not public.is_staff() then
    select p.id into v_plan from public.route_day_plan p join public.shop s on s.route_id = p.route_id
     where s.id = p_shop_id and p.id in (select public.driver_plan_ids()) limit 1;
    if v_plan is null then raise exception 'FORBIDDEN'; end if;
  end if;
  if p_mode not in ('cash', 'upi') or p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 100000000 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.shop where id = p_shop_id) then raise exception 'NOT_FOUND'; end if;
  insert into public.ledger_entry (shop_id, type, amount_paise, payment_mode, upi_ref, route_day_plan_id, note)
  values (p_shop_id, 'payment', -p_amount_paise, p_mode::public.pay_mode, nullif(left(p_upi_ref, 40), ''), v_plan, left(p_note, 200));
  select * into v_bal from public.shop_balance(p_shop_id);
  v_done := jsonb_build_object('balance_paise', v_bal.balance, 'overdue_paise', v_bal.overdue);
  insert into public.client_action (id, kind, result) values (p_action_id, 'payment', v_done);
  return v_done;
end $$;
revoke execute on function public.record_payment(uuid, uuid, text, bigint, text, text) from public, anon;
grant execute on function public.record_payment(uuid, uuid, text, bigint, text, text) to authenticated;

-- ---------- corrections (admin only): a reversal entry, never an edit ----------
create function public.void_ledger_entry(p_entry_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.ledger_entry;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'INVALID_INPUT'; end if;
  select * into e from public.ledger_entry where id = p_entry_id;
  if not found or e.type = 'reversal' then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.ledger_entry where reverses_id = p_entry_id) then raise exception 'ALREADY_VOIDED'; end if;
  insert into public.ledger_entry (shop_id, type, amount_paise, reverses_id, invoice_id, note)
  values (e.shop_id, 'reversal', -e.amount_paise, e.id, e.invoice_id, left(p_reason, 200));
  if e.type = 'invoice' then update public.invoice set status = 'void' where id = e.invoice_id; end if;
end $$;
revoke execute on function public.void_ledger_entry(uuid, text) from public, anon;
grant execute on function public.void_ledger_entry(uuid, text) to authenticated;

-- Opening balances when moving shops from paper khata (admin only).
create function public.set_opening_balance(p_shop_id uuid, p_amount_paise bigint, p_note text default 'opening balance') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_amount_paise = 0 then raise exception 'INVALID_INPUT'; end if;
  insert into public.ledger_entry (shop_id, type, amount_paise, note) values (p_shop_id, 'opening', p_amount_paise, left(p_note, 200));
end $$;
revoke execute on function public.set_opening_balance(uuid, bigint, text) from public, anon;
grant execute on function public.set_opening_balance(uuid, bigint, text) to authenticated;

-- Staff can lift the credit block for a shop until a time.
create function public.override_credit_block(p_shop_id uuid, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  update public.shop set order_block_override_until = p_until where id = p_shop_id;
end $$;
revoke execute on function public.override_credit_block(uuid, timestamptz) from public, anon;
grant execute on function public.override_credit_block(uuid, timestamptz) to authenticated;

-- Shop-side credit check, used by save_order and shown in the app before placing.
create function public.credit_status(p_shop_id uuid default null)
returns table (balance_paise bigint, overdue_paise bigint, credit_limit_paise bigint, blocked boolean, override_until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_shop uuid := coalesce(p_shop_id, public.auth_shop_id()); b record; s public.shop;
begin
  if v_shop is null or not (public.is_staff() or v_shop = public.auth_shop_id()) then raise exception 'FORBIDDEN'; end if;
  select * into s from public.shop where id = v_shop;
  select * into b from public.shop_balance(v_shop);
  return query select b.balance, b.overdue, s.credit_limit_paise,
    (b.overdue > 0 or (s.credit_limit_paise > 0 and b.balance > s.credit_limit_paise)) and coalesce(s.order_block_override_until < now(), true),
    s.order_block_override_until;
end $$;
revoke execute on function public.credit_status(uuid) from public, anon;
grant execute on function public.credit_status(uuid) to authenticated;

create trigger invoice_audit after insert or update on public.invoice for each row execute function public.audit_row();
