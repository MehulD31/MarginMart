-- Counter sales: create and edit bills from the app (same rules and stock handling as Telegram and the sheet).
--   counter_sale_save(p_id null = new bill | existing bill id, p_action, p_shop, p_mode, p_lines [{variant_id, qty, price_paise}])
--   Edit replaces the bill's lines with p_lines; stock moves by the difference only. Staff (admin / manager) only.
--   counter_catalog(): items with trade price and stock; buy price + floor only for admins.
--   counter_sales now also returns shop_id and each line's variant_id (for the editor).

create or replace function public.counter_catalog()
returns table (variant_id uuid, label text, trade_paise bigint, buy_paise bigint, floor_paise bigint, on_hand int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return query select c.variant_id, c.label, c.trade_paise,
    case when public.is_admin() then c.buy_paise end, case when public.is_admin() then c.floor_paise end, c.on_hand
  from public.bot_secret b cross join lateral public.bot_catalog(b.bot_key) c;
end $$;
revoke all on function public.counter_catalog() from public, anon;
grant execute on function public.counter_catalog() to authenticated;

create or replace function public.counter_sale_save(p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.cash_sale; v_id uuid; v_no text; v_by text; r record; o record; v_buy bigint;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_mode not in ('cash', 'upi') then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.shop where id = p_shop and active) then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 40 or exists (
    select 1 from jsonb_array_elements(p_lines) e left join public.variant v on v.id = (e ->> 'variant_id')::uuid
    where v.id is null or (e ->> 'qty') !~ '^\d{1,4}$' or (e ->> 'qty')::int < 1 or (e ->> 'price_paise') !~ '^\d{1,8}$'
       or (e ->> 'price_paise')::bigint < 2000 or (e ->> 'price_paise')::bigint > 10000000)
  then raise exception 'INVALID_INPUT'; end if;
  if (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_lines) e) then
    raise exception 'INVALID_INPUT';
  end if;
  select left(name, 60) into v_by from public.profiles where user_id = auth.uid();

  if p_id is null then
    select id, number into v_id, v_no from public.cash_sale where action_id = p_action;
    if v_id is not null then return jsonb_build_object('id', v_id, 'number', v_no, 'repeat', true); end if;
    v_no := 'KD-' || lpad(nextval('public.cash_sale_no_seq')::text, 5, '0');
    insert into public.cash_sale (action_id, number, shop_id, payment_mode, total_paise, entered_by)
    values (p_action, v_no, p_shop, p_mode, 0, coalesce(v_by, 'App')) returning id into v_id;
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
    update public.cash_sale set shop_id = p_shop, payment_mode = p_mode where id = c.id and (shop_id <> p_shop or payment_mode <> p_mode);
    -- lines no longer on the bill: stock back
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
end $$;
revoke all on function public.counter_sale_save(uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.counter_sale_save(uuid, uuid, uuid, text, jsonb) to authenticated;

create or replace function public.counter_sales(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'INVALID_INPUT'; end if;
  return coalesce((
    select jsonb_agg(b order by b ->> 'at' desc) from (
      select jsonb_build_object(
        'id', c.id, 'number', c.number, 'at', c.created_at, 'shop', s.name, 'shop_id', s.id, 'locality', s.locality, 'phone', s.phone,
        'mode', c.payment_mode, 'total_paise', c.total_paise, 'by', c.entered_by,
        'voided', c.voided_at is not null, 'void_reason', c.void_reason,
        'margin_paise', case when public.is_admin() then (select sum(l.qty * (l.price_paise - l.buy_paise)) from public.cash_sale_line l where l.cash_sale_id = c.id) end,
        'lines', (select jsonb_agg(jsonb_build_object(
            'variant_id', l.variant_id,
            'item', case when v.flavour_en = p.name_en then p.name_en else v.flavour_en || ' ' || p.name_en end,
            'qty', l.qty, 'price_paise', l.price_paise) order by l.id)
          from public.cash_sale_line l join public.variant v on v.id = l.variant_id join public.pack p on p.id = v.pack_id
          where l.cash_sale_id = c.id)) b
      from public.cash_sale c join public.shop s on s.id = c.shop_id
      where (c.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
      order by c.created_at desc limit 500) x), '[]'::jsonb);
end $$;
