-- Who buys what: per shop and item, from every sale (counter, truck and route). Rate = net value / cases, so discounts are included.
create or replace function public.shop_item_sales(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_INPUT'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select l.shop_id, l.variant_id, min(s.name) shop, min(s.locality) locality,
           min(case when v.flavour_en = p.name_en then p.name_en else v.flavour_en || ' ' || p.name_en end) item,
           sum(l.qty) cases, sum(l.value) value, count(distinct l.bill) bills,
           min(round(l.value / l.qty))::bigint min_rate, max(round(l.value / l.qty))::bigint max_rate,
           (array_agg(round(l.value / l.qty)::bigint order by l.at desc))[1] last_rate, max(l.at) last_at
      from public._sales_lines(p_from, p_to) l
      join public.shop s on s.id = l.shop_id join public.variant v on v.id = l.variant_id join public.pack p on p.id = v.pack_id
     where l.qty > 0
     group by l.shop_id, l.variant_id) x), '[]'::jsonb);
end $$;

-- The last bills of one shop, with each item and its rate.
create or replace function public.shop_item_history(p_shop uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_INPUT'; end if;
  return coalesce((select jsonb_agg(b order by b ->> 'at' desc) from (
    select jsonb_build_object('at', min(l.at), 'src', min(l.src),
      'bill', coalesce(min(c.number), min(i.number)::text),
      'total', sum(l.value),
      'lines', jsonb_agg(jsonb_build_object('item', case when v.flavour_en = p.name_en then p.name_en else v.flavour_en || ' ' || p.name_en end,
                 'qty', l.qty, 'rate', round(l.value / l.qty)) order by l.value desc)) b
      from public._sales_lines(p_from, p_to) l
      join public.variant v on v.id = l.variant_id join public.pack p on p.id = v.pack_id
      left join public.cash_sale c on 'c:' || c.id = l.bill
      left join public.invoice i on 'i:' || i.id = l.bill
     where l.shop_id = p_shop and l.qty > 0
     group by l.bill order by min(l.at) desc limit 60) q), '[]'::jsonb);
end $$;
revoke all on function public.shop_item_sales(date, date), public.shop_item_history(uuid, date, date) from public, anon;
grant execute on function public.shop_item_sales(date, date), public.shop_item_history(uuid, date, date) to authenticated, service_role;
