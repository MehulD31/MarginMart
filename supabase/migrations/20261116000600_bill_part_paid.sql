-- Bills (parchis) can be fully paid, part paid or not paid. The unpaid part goes to the shop's Khata automatically.
-- received_paise: null = fully paid (all old bills). cash_in_paise = what was really received, never above the bill total.
alter table public.cash_sale add column if not exists received_paise bigint check (received_paise is null or received_paise >= 0);
alter table public.cash_sale add column if not exists cash_in_paise bigint generated always as (least(coalesce(received_paise, total_paise), total_paise)) stored;
alter table public.ledger_entry add column if not exists cash_sale_id uuid;
create index if not exists ledger_entry_cash_sale_idx on public.ledger_entry (cash_sale_id) where cash_sale_id is not null;

-- Keeps the Khata in step with the bill: unpaid part = total - received. Voided or deleted bill = nothing unpaid. The ledger is append-only,
-- so a change is written as a new entry (charge or adjustment) for the difference.
create or replace function public._sale_due_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_shop uuid; v_no text; v_want bigint; v_have bigint; r record;
begin
  if tg_op = 'DELETE' then v_id := old.id; v_shop := old.shop_id; v_no := old.number; v_want := 0;
  else v_id := new.id; v_shop := new.shop_id; v_no := new.number;
       v_want := case when new.voided_at is not null then 0 else new.total_paise - new.cash_in_paise end;
  end if;
  for r in select shop_id, sum(amount_paise) net from public.ledger_entry where cash_sale_id = v_id and shop_id <> v_shop group by 1 having sum(amount_paise) <> 0 loop
    insert into public.ledger_entry (shop_id, type, amount_paise, cash_sale_id, note, created_by)
    values (r.shop_id, case when r.net < 0 then 'invoice' else 'adjustment' end::public.ledger_type, -r.net, v_id, left('Bill ' || v_no || ' moved to another shop', 200), auth.uid());
  end loop;
  select coalesce(sum(amount_paise), 0) into v_have from public.ledger_entry where cash_sale_id = v_id and shop_id = v_shop;
  if v_want <> v_have then
    insert into public.ledger_entry (shop_id, type, amount_paise, cash_sale_id, note, created_by)
    values (v_shop, (case when v_want > v_have then 'invoice' else 'adjustment' end)::public.ledger_type, v_want - v_have, v_id,
            left(case when tg_op = 'DELETE' then 'Bill ' || v_no || ' deleted' when v_want = 0 then 'Bill ' || v_no || ' fully paid or cancelled' else 'Bill ' || v_no || ' unpaid part' end, 200), auth.uid());
  end if;
  return null;
end $$;
revoke all on function public._sale_due_sync() from public, anon, authenticated;
drop trigger if exists cash_sale_due_sync on public.cash_sale;
create trigger cash_sale_due_sync after insert or delete or update of total_paise, received_paise, voided_at, shop_id on public.cash_sale
  for each row execute function public._sale_due_sync();

-- save: new last argument p_received (null = fully paid)
drop function if exists public.counter_sale_save_dated(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid, date);
drop function if exists public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid);
create or replace function public.counter_sale_save_into(p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb, p_account uuid,
  p_discount bigint default 0, p_plan uuid default null, p_received bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_total bigint;
begin
  if p_received is not null and (p_received < 0 or p_received > 100000000) then raise exception 'INVALID_INPUT'; end if;
  perform public._money_check(p_account);
  r := public.counter_sale_save(p_id, p_action, p_shop, p_mode, p_lines, p_discount, p_plan);
  v_total := (r ->> 'total_paise')::bigint;
  if p_received is not null and p_received > v_total then raise exception 'PAID_MORE_THAN_BILL'; end if;
  if not coalesce((r ->> 'repeat')::boolean, false) then
    update public.cash_sale set received_paise = p_received where id = (r ->> 'id')::uuid and received_paise is distinct from p_received;
  end if;
  if coalesce(p_received, v_total) > 0 then perform public._set_payment_account('counter_sale', (r ->> 'id')::uuid, p_account, auth.uid()); end if;
  return r || jsonb_build_object('received_paise', coalesce(p_received, v_total));
end $$;
create or replace function public.counter_sale_save_dated(p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb, p_account uuid,
  p_discount bigint default 0, p_plan uuid default null, p_day date default null, p_received bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_id uuid; v_at timestamptz; v_plan uuid; v_plan_day date; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_day is not null and p_day > v_today then raise exception 'DATE_IN_FUTURE'; end if;
  if p_day is not null and p_day < v_today - 366 then raise exception 'DATE_TOO_OLD'; end if;
  v_plan := coalesce(p_plan, (select route_day_plan_id from public.cash_sale where id = p_id));
  if v_plan is not null and p_day is not null then
    select date into v_plan_day from public.route_day_plan where id = v_plan;
    if p_day <> v_plan_day then raise exception 'TRUCK_BILL_DATE'; end if;
  end if;
  r := public.counter_sale_save_into(p_id, p_action, p_shop, p_mode, p_lines, p_account, p_discount, p_plan, p_received);
  v_id := (r ->> 'id')::uuid;
  select created_at into v_at from public.cash_sale where id = v_id;
  if p_day is not null and (v_at at time zone 'Asia/Kolkata')::date <> p_day then
    update public.cash_sale set created_at = ((p_day + (v_at at time zone 'Asia/Kolkata')::time) at time zone 'Asia/Kolkata') where id = v_id;
  end if;
  return r || jsonb_build_object('day', ((select created_at from public.cash_sale where id = v_id) at time zone 'Asia/Kolkata')::date);
end $$;
revoke all on function public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid, bigint) from public, anon;
revoke all on function public.counter_sale_save_dated(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid, date, bigint) from public, anon;
grant execute on function public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid, bigint) to authenticated, service_role;
grant execute on function public.counter_sale_save_dated(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid, date, bigint) to authenticated, service_role;

-- Reports: money received counts only what was really received.
do $$ declare s text; begin
  select pg_get_functiondef('public._money_payments(date,date)'::regprocedure) into s;
  if position('c.payment_mode mode, c.total_paise amount_paise' in s) = 0 or position('where c.voided_at is null' in s) = 0 then raise exception 'money_payments pattern missing'; end if;
  s := replace(s, 'c.payment_mode mode, c.total_paise amount_paise', 'c.payment_mode mode, c.cash_in_paise amount_paise');
  s := replace(s, 'where c.voided_at is null', 'where c.voided_at is null and c.cash_in_paise > 0');
  execute s;
  select pg_get_functiondef('public.ops_daily(date)'::regprocedure) into s;
  if position('select s.id, s.payment_mode, s.total_paise from public.cash_sale s' in s) = 0
     or position('sum(total_paise) from cs where payment_mode = ''cash''' in s) = 0
     or position('sum(total_paise) from cs where payment_mode <> ''cash''' in s) = 0 then raise exception 'ops_daily pattern missing'; end if;
  s := replace(s, 'select s.id, s.payment_mode, s.total_paise from public.cash_sale s', 'select s.id, s.payment_mode, s.total_paise, s.cash_in_paise from public.cash_sale s');
  s := replace(s, 'sum(total_paise) from cs where payment_mode = ''cash''', 'sum(cash_in_paise) from cs where payment_mode = ''cash''');
  s := replace(s, 'sum(total_paise) from cs where payment_mode <> ''cash''', 'sum(cash_in_paise) from cs where payment_mode <> ''cash''');
  execute s;
  select pg_get_functiondef('public.counter_sales(date,date)'::regprocedure) into s;
  if position('''mode'', c.payment_mode, ''total_paise'', c.total_paise,' in s) = 0 then raise exception 'counter_sales pattern missing'; end if;
  s := replace(s, '''mode'', c.payment_mode, ''total_paise'', c.total_paise,', '''mode'', c.payment_mode, ''total_paise'', c.total_paise, ''paid_paise'', c.cash_in_paise,');
  execute s;
  select pg_get_functiondef('public.trip_detail(uuid)'::regprocedure) into s;
  if position('''total_paise'', c.total_paise, ''mode'', c.payment_mode,' in s) = 0 then raise exception 'trip_detail pattern missing'; end if;
  s := replace(s, '''total_paise'', c.total_paise, ''mode'', c.payment_mode,', '''total_paise'', c.total_paise, ''paid_paise'', c.cash_in_paise, ''mode'', c.payment_mode,');
  execute s;
end $$;

-- Every bill that is not fully paid, oldest first. Payments received later are matched to the oldest dues first.
create or replace function public.khata_open_items(p_shop uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('shop_id', x.shop_id, 'shop', s.name, 'at', x.at, 'kind', x.kind, 'cash_sale_id', x.cash_sale_id,
      'label', coalesce(cs.number, x.label), 'charge_paise', x.amt, 'remaining_paise', x.amt - x.alloc, 'paid_paise', x.alloc, 'days', (current_date - (x.at at time zone 'Asia/Kolkata')::date)) order by x.at)
    from (
      select c.*, least(c.amt, greatest(0, coalesce(cr.credit, 0) - coalesce(c.cum_before, 0))) alloc
      from (
        select g.*, coalesce(sum(g.amt) over (partition by g.shop_id order by g.at, g.k rows between unbounded preceding and 1 preceding), 0) cum_before
        from (
          select e.shop_id, coalesce(e.cash_sale_id::text, e.id::text) k, min(e.created_at) at, sum(e.amount_paise) amt, (array_agg(e.cash_sale_id))[1] cash_sale_id,
                 case when bool_or(e.cash_sale_id is not null) then 'bill' when bool_or(e.type = 'opening') then 'opening' when bool_or(e.invoice_id is not null) then 'delivery' else 'other' end kind,
                 case when bool_or(e.type = 'opening') then 'Opening balance' when bool_or(e.invoice_id is not null) then 'Delivery bill' else 'Other' end label
            from public.ledger_entry e
           where (p_shop is null or e.shop_id = p_shop) and e.reverses_id is null
             and not exists (select 1 from public.ledger_entry r where r.reverses_id = e.id)
             and (e.cash_sale_id is not null or e.amount_paise > 0)
           group by e.shop_id, coalesce(e.cash_sale_id::text, e.id::text)
          having sum(e.amount_paise) > 0) g) c
      left join (select e.shop_id, -sum(e.amount_paise) credit from public.ledger_entry e
                  where e.cash_sale_id is null and e.amount_paise < 0 and e.reverses_id is null and not exists (select 1 from public.ledger_entry r where r.reverses_id = e.id)
                  group by 1) cr on cr.shop_id = c.shop_id) x
    join public.shop s on s.id = x.shop_id
    left join public.cash_sale cs on cs.id = x.cash_sale_id
    where x.amt - x.alloc > 0), '[]'::jsonb);
end $$;
revoke all on function public.khata_open_items(uuid) from public, anon;
grant execute on function public.khata_open_items(uuid) to authenticated, service_role;
