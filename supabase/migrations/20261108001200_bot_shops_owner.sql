-- Owner name everywhere a shop is picked for a sale ("Usha Kirana · Om Prakash"), and owner name is searchable.
drop function if exists public.bot_shops(text, text);
create function public.bot_shops(p_key text, p_q text default null)
returns table(id uuid, name text, phone text, locality text, owner text)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return query select s.id, s.name, s.phone, s.locality, nullif(trim(s.owner_name), '') from public.shop s
   where s.active and (p_q is null or s.name ilike '%' || p_q || '%' or s.phone like '%' || p_q || '%'
                       or s.locality ilike '%' || p_q || '%' or s.owner_name ilike '%' || p_q || '%')
   order by (select max(c.created_at) from public.cash_sale c where c.shop_id = s.id) desc nulls last,
            (s.name ilike p_q || '%') desc, s.name limit 12;
end $$;
revoke all on function public.bot_shops(text, text) from public;
grant execute on function public.bot_shops(text, text) to anon, authenticated;

drop function if exists public.bot_shop_guess(text, text);
create function public.bot_shop_guess(p_key text, p_text text)
returns table(id uuid, name text, phone text, locality text, owner text, score real)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_text), '') = '' then return; end if;
  return query
    select s.id, s.name, s.phone, s.locality, nullif(trim(s.owner_name), ''),
           greatest(extensions.word_similarity(lower(regexp_replace(s.name, '^(shri|shree|sri|new|m/s\.?)\s+', '', 'i')), lower(p_text)),
                    extensions.word_similarity(lower(s.name), lower(p_text)))::real sc
      from public.shop s
     where s.active
     order by sc desc, s.name
     limit 25;
end $$;
revoke all on function public.bot_shop_guess(text, text) from public;
grant execute on function public.bot_shop_guess(text, text) to anon, authenticated;

-- Counter sales list also returns the owner name (shown next to the shop on the website).
create or replace function public.counter_sales(p_from date, p_to date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'INVALID_INPUT'; end if;
  return coalesce((
    select jsonb_agg(b order by b ->> 'at' desc) from (
      select jsonb_build_object(
        'id', c.id, 'number', c.number, 'at', c.created_at, 'shop', s.name, 'shop_id', s.id, 'locality', s.locality, 'phone', s.phone,
        'owner', nullif(trim(s.owner_name), ''),
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
end $function$;
