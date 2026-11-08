-- Discount (in rupees) on a counter sale. Stored per bill: total = sum(lines) - discount. Margin everywhere = sum(line margin) - discount.
alter table public.cash_sale add column if not exists discount_paise bigint not null default 0 check (discount_paise >= 0);

create or replace function public._cash_sale_total(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_sum bigint; v_disc bigint;
begin
  select coalesce(sum(qty * price_paise), 0) into v_sum from public.cash_sale_line where cash_sale_id = p_id;
  select discount_paise into v_disc from public.cash_sale where id = p_id;
  if coalesce(v_disc, 0) > v_sum then raise exception 'DISCOUNT_TOO_BIG'; end if;
  update public.cash_sale set total_paise = v_sum - coalesce(v_disc, 0) where id = p_id;
end $$;

drop function if exists public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid);
drop function if exists public.counter_sale_save(uuid, uuid, uuid, text, jsonb);
create function public.counter_sale_save(p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb, p_discount bigint default 0)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  c public.cash_sale; v_id uuid; v_no text; v_by text; r record; o record; v_buy bigint;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_mode not in ('cash', 'upi') then raise exception 'INVALID_INPUT'; end if;
  if p_discount is null or p_discount < 0 or p_discount > 100000000 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.shop where id = p_shop and active) then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 40 or exists (
    select 1 from jsonb_array_elements(p_lines) e left join public.variant v on v.id = (e ->> 'variant_id')::uuid
    where v.id is null or (e ->> 'qty') !~ '^\d{1,4}$' or (e ->> 'qty')::int < 1 or (e ->> 'price_paise') !~ '^\d{1,8}$'
       or (e ->> 'price_paise')::bigint < 2000 or (e ->> 'price_paise')::bigint > 10000000)
  then raise exception 'INVALID_INPUT'; end if;
  if (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_lines) e) then
    raise exception 'INVALID_INPUT';
  end if;
  if p_discount > (select sum((e ->> 'qty')::bigint * (e ->> 'price_paise')::bigint) from jsonb_array_elements(p_lines) e) then
    raise exception 'DISCOUNT_TOO_BIG';
  end if;
  select left(name, 60) into v_by from public.profiles where user_id = auth.uid();

  if p_id is null then
    select id, number into v_id, v_no from public.cash_sale where action_id = p_action;
    if v_id is not null then return jsonb_build_object('id', v_id, 'number', v_no, 'repeat', true); end if;
    v_no := 'KD-' || lpad(nextval('public.cash_sale_no_seq')::text, 5, '0');
    insert into public.cash_sale (action_id, number, shop_id, payment_mode, total_paise, entered_by, discount_paise)
    values (p_action, v_no, p_shop, p_mode, 0, coalesce(v_by, 'App'), p_discount) returning id into v_id;
    for r in select (e ->> 'variant_id')::uuid vid, (e ->> 'qty')::int qty, (e ->> 'price_paise')::bigint price from jsonb_array_elements(p_lines) e loop
      select c2.buy_paise into v_buy from public.bot_secret b cross join lateral public.bot_catalog(b.bot_key) c2 where c2.variant_id = r.vid;
      insert into public.cash_sale_line (cash_sale_id, variant_id, qty, price_paise, buy_paise) values (v_id, r.vid, r.qty, r.price, coalesce(v_buy, 0));
      perform public._cash_sale_stock(v_id, r.vid, r.qty, v_no);
    end loop;
  else
    select * into c from public.cash_sale where id = p_id for update;
    if c.id is null then raise exception 'NOT_FOUND'; end if;
    if c.voided_at is not null then raise exception 'ALREADY_VOIDED'; end if;
    v_id := c.id; v_no := c.number;
    update public.cash_sale set shop_id = p_shop, payment_mode = p_mode, discount_paise = p_discount
     where id = c.id and (shop_id <> p_shop or payment_mode <> p_mode or discount_paise <> p_discount);
    for o in select * from public.cash_sale_line l where l.cash_sale_id = c.id
             and not exists (select 1 from jsonb_array_elements(p_lines) e where (e ->> 'variant_id')::uuid = l.variant_id) loop
      perform public._cash_sale_stock(c.id, o.variant_id, -o.qty, 'App: removed from ' || c.number);
      delete from public.cash_sale_line where id = o.id;
    end loop;
    for r in select (e ->> 'variant_id')::uuid vid, (e ->> 'qty')::int qty, (e ->> 'price_paise')::bigint price from jsonb_array_elements(p_lines) e loop
      select * into o from public.cash_sale_line where cash_sale_id = c.id and variant_id = r.vid;
      if o.id is null then
        select c2.buy_paise into v_buy from public.bot_secret b cross join lateral public.bot_catalog(b.bot_key) c2 where c2.variant_id = r.vid;
        insert into public.cash_sale_line (cash_sale_id, variant_id, qty, price_paise, buy_paise) values (c.id, r.vid, r.qty, r.price, coalesce(v_buy, 0));
        perform public._cash_sale_stock(c.id, r.vid, r.qty, 'App: added to ' || c.number);
      elsif o.qty <> r.qty or o.price_paise <> r.price then
        perform public._cash_sale_stock(c.id, r.vid, r.qty - o.qty, 'App: changed on ' || c.number);
        update public.cash_sale_line set qty = r.qty, price_paise = r.price where id = o.id;
      end if;
    end loop;
  end if;
  perform public._cash_sale_total(v_id);
  return jsonb_build_object('id', v_id, 'number', v_no, 'total_paise', (select total_paise from public.cash_sale where id = v_id), 'repeat', false);
end $function$;
revoke all on function public.counter_sale_save(uuid, uuid, uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.counter_sale_save(uuid, uuid, uuid, text, jsonb, bigint) to authenticated;

create function public.counter_sale_save_into(p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb, p_account uuid, p_discount bigint default 0)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb;
begin
  perform public._money_check(p_account);
  r := public.counter_sale_save(p_id, p_action, p_shop, p_mode, p_lines, p_discount);
  perform public._set_payment_account('counter_sale', (r->>'id')::uuid, p_account, auth.uid());
  return r;
end $$;
revoke all on function public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid, bigint) from public, anon;
grant execute on function public.counter_sale_save_into(uuid, uuid, uuid, text, jsonb, uuid, bigint) to authenticated;

-- Telegram
drop function if exists public.bot_record_sale_into(text, uuid, uuid, jsonb, text, text, uuid);
drop function if exists public.bot_record_sale(text, uuid, uuid, jsonb, text, text);
create function public.bot_record_sale(p_key text, p_action uuid, p_shop uuid, p_lines jsonb, p_mode text, p_by text, p_discount bigint default 0)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_id uuid; v_no text; v_total bigint; v_margin bigint; v_done jsonb; r record;
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object('number', number, 'total_paise', total_paise, 'repeat', true) into v_done from public.cash_sale where action_id = p_action;
  if v_done is not null then return v_done; end if;
  if p_mode not in ('cash', 'upi') then raise exception 'INVALID_INPUT'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.shop where id = p_shop and active) then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 40 or exists (
    select 1 from jsonb_array_elements(p_lines) e left join public.variant v on v.id = (e ->> 'variant_id')::uuid
    where v.id is null or (e ->> 'qty') !~ '^\d{1,4}$' or (e ->> 'qty')::int < 1 or (e ->> 'price_paise') !~ '^\d{1,8}$' or (e ->> 'price_paise')::bigint < 1)
  then raise exception 'INVALID_INPUT'; end if;
  if p_discount > (select sum((e ->> 'qty')::bigint * (e ->> 'price_paise')::bigint) from jsonb_array_elements(p_lines) e) then raise exception 'DISCOUNT_TOO_BIG'; end if;
  v_no := 'KD-' || lpad(nextval('public.cash_sale_no_seq')::text, 5, '0');
  insert into public.cash_sale (action_id, number, shop_id, payment_mode, total_paise, entered_by, discount_paise)
  values (p_action, v_no, p_shop, p_mode, 0, left(p_by, 60), p_discount) returning id into v_id;
  for r in select (e ->> 'variant_id')::uuid vid, (e ->> 'qty')::int qty, (e ->> 'price_paise')::bigint price from jsonb_array_elements(p_lines) e loop
    insert into public.cash_sale_line (cash_sale_id, variant_id, qty, price_paise, buy_paise)
    select v_id, r.vid, r.qty, r.price, c.buy_paise from public.bot_catalog(p_key) c where c.variant_id = r.vid
    union all select v_id, r.vid, r.qty, r.price, 0 where not exists (select 1 from public.bot_catalog(p_key) c where c.variant_id = r.vid)
    limit 1;
    insert into public.stock_move (variant_id, qty, kind, reason, cash_sale_id) values (r.vid, -r.qty, 'sale', v_no, v_id);
  end loop;
  select sum(qty * price_paise), sum(qty * (price_paise - buy_paise)) into v_total, v_margin from public.cash_sale_line where cash_sale_id = v_id;
  update public.cash_sale set total_paise = v_total - p_discount where id = v_id;
  return jsonb_build_object('number', v_no, 'total_paise', v_total - p_discount, 'margin_paise', v_margin - p_discount, 'discount_paise', p_discount, 'repeat', false);
end $function$;
revoke all on function public.bot_record_sale(text, uuid, uuid, jsonb, text, text, bigint) from public;
grant execute on function public.bot_record_sale(text, uuid, uuid, jsonb, text, text, bigint) to anon, authenticated;

create function public.bot_record_sale_into(p_key text, p_action uuid, p_shop uuid, p_lines jsonb, p_mode text, p_by text, p_account uuid, p_discount bigint default 0)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; v_id uuid;
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  perform public._money_check(p_account);
  r := public.bot_record_sale(p_key, p_action, p_shop, p_lines, p_mode, p_by, p_discount);
  select id into v_id from public.cash_sale where action_id = p_action;
  r := r || jsonb_build_object('id', v_id);
  if coalesce((r->>'repeat')::boolean, false) or p_account is null then return r; end if;
  perform public._set_payment_account('counter_sale', v_id, p_account, null);
  return r || jsonb_build_object('account', (select name from public.money_account where id = p_account));
end $$;
revoke all on function public.bot_record_sale_into(text, uuid, uuid, jsonb, text, text, uuid, bigint) from public;
grant execute on function public.bot_record_sale_into(text, uuid, uuid, jsonb, text, text, uuid, bigint) to anon, authenticated;

-- Lists and reports: show the discount, take it off margin.
create or replace function public.counter_sales(p_from date, p_to date)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'INVALID_INPUT'; end if;
  return coalesce((
    select jsonb_agg(b order by b ->> 'at' desc) from (
      select jsonb_build_object(
        'id', c.id, 'number', c.number, 'at', c.created_at, 'shop', s.name, 'shop_id', s.id, 'locality', s.locality, 'phone', s.phone,
        'owner', nullif(trim(s.owner_name), ''),
        'mode', c.payment_mode, 'total_paise', c.total_paise, 'discount_paise', c.discount_paise, 'by', c.entered_by,
        'voided', c.voided_at is not null, 'void_reason', c.void_reason,
        'margin_paise', case when public.is_admin() then (select sum(l.qty * (l.price_paise - l.buy_paise)) from public.cash_sale_line l where l.cash_sale_id = c.id) - c.discount_paise end,
        'lines', (select jsonb_agg(jsonb_build_object(
            'variant_id', l.variant_id,
            'item', case when v.flavour_en = p.name_en then p.name_en else v.flavour_en || ' ' || p.name_en end,
            'qty', l.qty, 'price_paise', l.price_paise) order by l.id)
          from public.cash_sale_line l join public.variant v on v.id = l.variant_id join public.pack p on p.id = v.pack_id
          where l.cash_sale_id = c.id)) b
      from public.cash_sale c join public.shop s on s.id = c.shop_id
      where (c.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
      order by c.created_at desc limit 500) x), '[]'::jsonb);
end $function$;

-- Nightly/instant report margin and the month card take discounts off (patched in place so the rest of the function is untouched).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.ops_daily(date)'::regprocedure);
  d := replace(d, $x$'margin_paise', coalesce((select sum((price_paise - coalesce(buy_paise, price_paise)) * qty) from csl), 0),$x$,
                  $x$'margin_paise', coalesce((select sum((price_paise - coalesce(buy_paise, price_paise)) * qty) from csl), 0) - coalesce((select sum(s2.discount_paise) from public.cash_sale s2 join cs on cs.id = s2.id), 0),$x$);
  execute d;
  d := pg_get_functiondef('public.month_stats()'::regprocedure);
  d := replace(d, $x$select l.qty, l.qty * l.price_paise, l.qty * l.buy_paise from public.cash_sale_line l join public.cash_sale cs on cs.id = l.cash_sale_id
    where cs.created_at >= (select t from since) and cs.voided_at is null)$x$,
                  $x$select l.qty, l.qty * l.price_paise, l.qty * l.buy_paise from public.cash_sale_line l join public.cash_sale cs on cs.id = l.cash_sale_id
    where cs.created_at >= (select t from since) and cs.voided_at is null
    union all
    select 0, -cs.discount_paise, 0 from public.cash_sale cs where cs.created_at >= (select t from since) and cs.voided_at is null and cs.discount_paise > 0)$x$);
  execute d;
end $$;
