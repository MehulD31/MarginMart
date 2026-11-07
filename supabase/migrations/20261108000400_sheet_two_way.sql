-- Two-way Google Sheet: edits and new rows typed in the "Sales" tab are applied here, checked like any other entry.
-- The sheet script calls sheet_apply(sheet_key, ops, by). Each op runs on its own: one bad row never blocks the others.
--   edit an existing line: { ref, line_id, shop, phone, item, cases, rate, pay, status }
--     cases 0 removes the line (last line -> bill cancelled), status VOID cancels the whole bill,
--     a different phone (or a unique shop name) moves the bill to that shop, item / cases / rate / pay change the line or bill.
--   add a new line: { ref, action, bill?, shop, phone, item, cases, rate, pay }
--     no bill -> a new bill KD-xxxxx; bill = an existing number -> the line is added to that bill.
-- Stock always follows: every change in cases or item writes a stock_move, so warehouse stock stays exact.

alter table public.cash_sale_line add column if not exists sheet_action uuid unique;

drop trigger if exists cash_sale_line_audit on public.cash_sale_line;
create trigger cash_sale_line_audit after insert or update or delete on public.cash_sale_line
  for each row execute function public.audit_row();

-- Moves stock for a cash-sale change: positive p_out takes cases out, negative puts them back.
create or replace function public._cash_sale_stock(p_sale uuid, p_variant uuid, p_out int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_out = 0 then return; end if;
  insert into public.stock_move (variant_id, qty, kind, reason, cash_sale_id)
  values (p_variant, -p_out, case when p_out > 0 then 'sale' else 'adjust' end::public.stock_move_kind, left(p_reason, 200), p_sale);
end $$;
revoke all on function public._cash_sale_stock(uuid, uuid, int, text) from public, anon, authenticated;

create or replace function public._cash_sale_void(p_id uuid, p_reason text, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.cash_sale; l record;
begin
  select * into c from public.cash_sale where id = p_id for update;
  if c.id is null then raise exception 'NOT_FOUND'; end if;
  if c.voided_at is not null then raise exception 'ALREADY_VOIDED'; end if;
  for l in select variant_id, qty from public.cash_sale_line where cash_sale_id = c.id loop
    perform public._cash_sale_stock(c.id, l.variant_id, -l.qty, 'Void ' || c.number || ': ' || left(trim(p_reason), 150));
  end loop;
  update public.cash_sale set voided_at = now(), voided_by = p_user, void_reason = left(trim(p_reason), 200) where id = c.id;
end $$;
revoke all on function public._cash_sale_void(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.void_cash_sale(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'INVALID_INPUT'; end if;
  perform public._cash_sale_void(p_id, p_reason, auth.uid());
end $$;

create or replace function public._cash_sale_total(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.cash_sale set total_paise = coalesce((select sum(qty * price_paise) from public.cash_sale_line where cash_sale_id = p_id), 0) where id = p_id;
$$;
revoke all on function public._cash_sale_total(uuid) from public, anon, authenticated;

-- Shop from what was typed. Phone wins; a name must match exactly one shop. Raises a readable message otherwise.
create or replace function public._sheet_shop(p_name text, p_phone text, p_create boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10); v_name text := trim(coalesce(p_name, ''));
        v_id uuid; v_n int; v_other text;
begin
  if v_phone <> '' then
    if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Phone must be 10 digits starting 6-9'; end if;
    select id into v_id from public.shop where phone = v_phone and active;
    if v_id is not null then return v_id; end if;
    if not p_create then raise exception 'No shop has phone %. Add the shop in the app first.', v_phone; end if;
    if length(v_name) < 2 then raise exception 'No shop has phone %. Type the shop name to add it as a new shop.', v_phone; end if;
    select string_agg(coalesce(phone, 'no phone'), ', ') into v_other from public.shop where lower(name) = lower(v_name) and active;
    if v_other is not null then raise exception 'Shop "%" already exists (phone %). Use that phone, or a different name for a new shop.', v_name, v_other; end if;
    insert into public.shop (name, phone, route_id, stop_seq) values (left(v_name, 100), v_phone, (select id from public.route where name = 'Direct sales'), 0) returning id into v_id;
    return v_id;
  end if;
  if length(v_name) < 2 then raise exception 'Type the shop name or its phone'; end if;
  select count(*), min(id::text)::uuid into v_n, v_id from public.shop where lower(name) = lower(v_name) and active;
  if v_n = 1 then return v_id; end if;
  if v_n > 1 then raise exception '% shops are named "%". Type the phone instead (see the Shops tab).', v_n, v_name; end if;
  raise exception 'No shop named "%". Check the Shops tab, or type a 10-digit phone to add it as a new shop.', v_name;
end $$;
revoke all on function public._sheet_shop(text, text, boolean) from public, anon, authenticated;

create or replace function public._sheet_item(p_item text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select v2.id into v from public.variant v2 join public.pack p on p.id = v2.pack_id
   where v2.active and p.active and lower(case when v2.flavour_en = p.name_en then p.name_en else v2.flavour_en || ' ' || p.name_en end) = lower(trim(coalesce(p_item, '')))
   limit 1;
  if v is null then raise exception 'Unknown item "%". Pick it from the dropdown.', coalesce(p_item, ''); end if;
  return v;
end $$;
revoke all on function public._sheet_item(text) from public, anon, authenticated;

create or replace function public._sheet_num(p text, p_what text)
returns numeric language plpgsql immutable set search_path = '' as $$
declare s text := regexp_replace(coalesce(p, ''), '(₹|,|\s|rs\.?)', '', 'gi');
begin
  if s ~ '^-' then raise exception '% cannot be negative', p_what; end if;
  if s = '' or s !~ '^\d+(\.\d+)?$' then raise exception '% must be a number', p_what; end if;
  return s::numeric;
end $$;

create or replace function public.sheet_catalog(p_key text)
returns table (item text, on_hand int, trade numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.bot_secret where sheet_key = p_key and length(p_key) >= 40) then raise exception 'FORBIDDEN'; end if;
  return query select c.label, c.on_hand, c.trade_paise / 100.0 from public.bot_secret b cross join lateral public.bot_catalog(b.bot_key) c order by c.label;
end $$;
revoke all on function public.sheet_catalog(text) from public;
grant execute on function public.sheet_catalog(text) to anon, authenticated;

create or replace function public.sheet_shops(p_key text)
returns table (shop text, area text, phone text, route text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.bot_secret where sheet_key = p_key and length(p_key) >= 40) then raise exception 'FORBIDDEN'; end if;
  return query select s.name, s.locality, s.phone, r.name from public.shop s join public.route r on r.id = s.route_id where s.active order by s.name, s.locality;
end $$;
revoke all on function public.sheet_shops(text) from public;
grant execute on function public.sheet_shops(text) to anon, authenticated;

create or replace function public.sheet_apply(p_key text, p_ops jsonb, p_by text default 'Sheet')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  op jsonb; res jsonb := '[]'::jsonb; v_by text := left(coalesce(nullif(trim(p_by), ''), 'Sheet'), 60);
  l public.cash_sale_line; c public.cash_sale; v_shop uuid; v_var uuid; v_qty int; v_price bigint; v_mode text; v_status text;
  v_changed boolean; v_buy bigint; v_line bigint; v_no text; v_sale uuid; v_err text;
begin
  if not exists (select 1 from public.bot_secret where sheet_key = p_key and length(p_key) >= 40) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then raise exception 'INVALID_INPUT'; end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    begin
      v_changed := false;
      v_mode := nullif(lower(trim(coalesce(op ->> 'pay', ''))), '');
      if v_mode is not null and v_mode not in ('cash', 'upi') then raise exception 'Pay must be CASH or UPI'; end if;

      if op ? 'line_id' and nullif(op ->> 'line_id', '') is not null then
        -- ---------- edit an existing line ----------
        select * into l from public.cash_sale_line where id = (op ->> 'line_id')::bigint for update;
        if l.id is null then raise exception 'This line no longer exists'; end if;
        select * into c from public.cash_sale where id = l.cash_sale_id for update;
        v_status := upper(trim(coalesce(op ->> 'status', 'OK')));
        if v_status not in ('OK', 'VOID', '') then raise exception 'Status must be OK or VOID'; end if;
        if c.voided_at is not null then
          if v_status <> 'VOID' or public._sheet_num(op ->> 'cases', 'Cases') <> l.qty or round(public._sheet_num(op ->> 'rate', 'Rate') * 100) <> l.price_paise
          then raise exception 'Bill % is cancelled and cannot be changed', c.number; end if;
          res := res || jsonb_build_object('ref', op ->> 'ref', 'ok', true, 'bill', c.number);
          continue;
        end if;
        if v_status = 'VOID' then
          perform public._cash_sale_void(c.id, 'Cancelled in sheet by ' || v_by, null);
          res := res || jsonb_build_object('ref', op ->> 'ref', 'ok', true, 'bill', c.number, 'changed', true);
          continue;
        end if;

        -- shop: a typed phone that is not this shop's, or a different unique name, moves the whole bill
        declare s public.shop; begin
          select * into s from public.shop where id = c.shop_id;
          if nullif(regexp_replace(coalesce(op ->> 'phone', ''), '\D', '', 'g'), '') is not null
             and right(regexp_replace(op ->> 'phone', '\D', '', 'g'), 10) is distinct from s.phone then
            v_shop := public._sheet_shop(null, op ->> 'phone', false);
          elsif nullif(trim(coalesce(op ->> 'shop', '')), '') is not null and lower(trim(op ->> 'shop')) <> lower(s.name) then
            v_shop := public._sheet_shop(op ->> 'shop', null, false);
          else v_shop := c.shop_id; end if;
        end;

        -- the item text unchanged keeps the line's item (even if that product was later switched off)
        if lower(trim(coalesce(op ->> 'item', ''))) = (select lower(case when v2.flavour_en = p.name_en then p.name_en else v2.flavour_en || ' ' || p.name_en end)
                                                        from public.variant v2 join public.pack p on p.id = v2.pack_id where v2.id = l.variant_id)
        then v_var := l.variant_id; else v_var := public._sheet_item(op ->> 'item'); end if;
        if public._sheet_num(op ->> 'cases', 'Cases') <> trunc(public._sheet_num(op ->> 'cases', 'Cases')) then raise exception 'Cases must be a whole number'; end if;
        v_qty := public._sheet_num(op ->> 'cases', 'Cases')::int;
        if v_qty < 0 or v_qty > 9999 then raise exception 'Cases must be 0-9999 (0 removes the line)'; end if;
        v_price := round(public._sheet_num(op ->> 'rate', 'Rate') * 100);
        if v_price < 2000 or v_price > 10000000 then raise exception 'Rate must be between 20 and 1,00,000'; end if;

        if v_shop <> c.shop_id then update public.cash_sale set shop_id = v_shop where id = c.id; v_changed := true; end if;
        if v_mode is not null and v_mode <> c.payment_mode then update public.cash_sale set payment_mode = v_mode where id = c.id; v_changed := true; end if;

        if v_qty = 0 then
          perform public._cash_sale_stock(c.id, l.variant_id, -l.qty, 'Sheet: removed from ' || c.number);
          delete from public.cash_sale_line where id = l.id;
          if not exists (select 1 from public.cash_sale_line where cash_sale_id = c.id) then
            perform public._cash_sale_void(c.id, 'All lines removed in sheet by ' || v_by, null);
          end if;
          v_changed := true;
        elsif v_var <> l.variant_id then
          if exists (select 1 from public.cash_sale_line where cash_sale_id = c.id and variant_id = v_var and id <> l.id) then
            raise exception '% already has this item on another row', c.number;
          end if;
          select c2.buy_paise into v_buy from public.bot_secret b cross join lateral public.bot_catalog(b.bot_key) c2 where c2.variant_id = v_var;
          perform public._cash_sale_stock(c.id, l.variant_id, -l.qty, 'Sheet: item changed on ' || c.number);
          perform public._cash_sale_stock(c.id, v_var, v_qty, 'Sheet: item changed on ' || c.number);
          update public.cash_sale_line set variant_id = v_var, qty = v_qty, price_paise = v_price, buy_paise = coalesce(v_buy, 0) where id = l.id;
          v_changed := true;
        elsif v_qty <> l.qty or v_price <> l.price_paise then
          perform public._cash_sale_stock(c.id, l.variant_id, v_qty - l.qty, 'Sheet: cases changed on ' || c.number);
          update public.cash_sale_line set qty = v_qty, price_paise = v_price where id = l.id;
          v_changed := true;
        end if;
        perform public._cash_sale_total(c.id);
        res := res || jsonb_build_object('ref', op ->> 'ref', 'ok', true, 'bill', c.number, 'changed', v_changed);

      else
        -- ---------- a new line typed in the sheet ----------
        if nullif(op ->> 'action', '') is null then raise exception 'INVALID_INPUT'; end if;
        select l2.id, c2.number into v_line, v_no from public.cash_sale_line l2 join public.cash_sale c2 on c2.id = l2.cash_sale_id
         where l2.sheet_action = (op ->> 'action')::uuid;
        if v_line is not null then
          res := res || jsonb_build_object('ref', op ->> 'ref', 'ok', true, 'bill', v_no, 'line_id', v_line, 'repeat', true);
          continue;
        end if;
        v_var := public._sheet_item(op ->> 'item');
        if public._sheet_num(op ->> 'cases', 'Cases') <> trunc(public._sheet_num(op ->> 'cases', 'Cases')) then raise exception 'Cases must be a whole number'; end if;
        v_qty := public._sheet_num(op ->> 'cases', 'Cases')::int;
        if v_qty < 1 or v_qty > 9999 then raise exception 'Cases must be 1-9999'; end if;
        v_price := round(public._sheet_num(op ->> 'rate', 'Rate') * 100);
        if v_price < 2000 or v_price > 10000000 then raise exception 'Rate must be between 20 and 1,00,000'; end if;
        select c2.buy_paise into v_buy from public.bot_secret b cross join lateral public.bot_catalog(b.bot_key) c2 where c2.variant_id = v_var;

        if nullif(trim(coalesce(op ->> 'bill', '')), '') is not null then
          select * into c from public.cash_sale where number = upper(trim(op ->> 'bill')) for update;
          if c.id is null then raise exception 'No bill %. Leave Bill empty to start a new bill.', op ->> 'bill'; end if;
          if c.voided_at is not null then raise exception 'Bill % is cancelled', c.number; end if;
          if exists (select 1 from public.cash_sale_line where cash_sale_id = c.id and variant_id = v_var) then
            raise exception '% already has this item. Change the cases on that row instead.', c.number;
          end if;
          v_sale := c.id; v_no := c.number;
        else
          if v_mode is null then raise exception 'Pick Pay: CASH or UPI'; end if;
          v_shop := public._sheet_shop(op ->> 'shop', op ->> 'phone', true);
          v_no := 'KD-' || lpad(nextval('public.cash_sale_no_seq')::text, 5, '0');
          insert into public.cash_sale (action_id, number, shop_id, payment_mode, total_paise, entered_by)
          values ((op ->> 'action')::uuid, v_no, v_shop, v_mode, 0, v_by) returning id into v_sale;
        end if;
        insert into public.cash_sale_line (cash_sale_id, variant_id, qty, price_paise, buy_paise, sheet_action)
        values (v_sale, v_var, v_qty, v_price, coalesce(v_buy, 0), (op ->> 'action')::uuid) returning id into v_line;
        perform public._cash_sale_stock(v_sale, v_var, v_qty, v_no);
        perform public._cash_sale_total(v_sale);
        res := res || jsonb_build_object('ref', op ->> 'ref', 'ok', true, 'bill', v_no, 'line_id', v_line);
      end if;
    exception when others then
      get stacked diagnostics v_err = message_text;
      res := res || jsonb_build_object('ref', op ->> 'ref', 'ok', false, 'error', left(v_err, 200));
    end;
  end loop;
  return res;
end $$;
revoke all on function public.sheet_apply(text, jsonb, text) from public;
grant execute on function public.sheet_apply(text, jsonb, text) to anon, authenticated;
