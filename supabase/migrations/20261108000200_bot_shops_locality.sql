-- 715 EDS shops include many same names (7 "Dewangan Kirana"), so the Telegram shop buttons also show the area,
-- and typing an area name ("Kumhari") finds its shops.
drop function if exists public.bot_shops(text, text);
create function public.bot_shops(p_key text, p_q text default null)
returns table (id uuid, name text, phone text, locality text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return query select s.id, s.name, s.phone, s.locality from public.shop s
   where s.active and (p_q is null or s.name ilike '%' || p_q || '%' or s.phone like '%' || p_q || '%' or s.locality ilike '%' || p_q || '%')
   order by (select max(c.created_at) from public.cash_sale c where c.shop_id = s.id) desc nulls last,
            (s.name ilike p_q || '%') desc, s.name limit 12;
end $$;
revoke all on function public.bot_shops(text, text) from public;
grant execute on function public.bot_shops(text, text) to anon, authenticated;
