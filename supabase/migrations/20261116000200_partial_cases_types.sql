-- Functions that return a stock or case count now return it as numeric (it can have pieces), and the counter catalog also tells the
-- sale form how many pieces make a case.
do $$
declare w regprocedure; d text; fn text; sig text;
begin
  foreach fn in array array['bot_catalog', 'bot_stock', 'sheet_catalog'] loop
    select p.oid::regprocedure into w from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    d := pg_get_functiondef(w); sig := w::text;
    if position('on_hand integer' in d) = 0 then raise exception '% pattern missing', fn; end if;
    d := replace(d, 'on_hand integer', 'on_hand numeric');
    execute 'drop function ' || sig;
    execute d;
    -- keep the key-checked bot functions callable the way they were (a dropped function loses its grants)
    execute 'revoke all on function ' || sig || ' from public';
    execute 'grant execute on function ' || sig || ' to anon, authenticated, service_role';
  end loop;

  select p.oid::regprocedure into w from pg_proc p where p.proname = '_sales_lines' and p.pronamespace = 'public'::regnamespace;
  d := pg_get_functiondef(w); sig := w::text;
  if position('qty integer' in d) = 0 then raise exception '_sales_lines pattern missing'; end if;
  d := replace(d, 'qty integer', 'qty numeric');
  execute 'drop function ' || sig;
  execute d;
  execute 'revoke all on function ' || sig || ' from public, anon, authenticated';
  execute 'grant execute on function ' || sig || ' to service_role';

  select p.oid::regprocedure into w from pg_proc p where p.proname = 'sheet_rows' and p.pronamespace = 'public'::regnamespace;
  d := pg_get_functiondef(w); sig := w::text;
  if position('cases integer' in d) = 0 then raise exception 'sheet_rows pattern missing'; end if;
  d := replace(d, 'cases integer', 'cases numeric');
  execute 'drop function ' || sig;
  execute d;
  execute 'revoke all on function ' || sig || ' from public';
  execute 'grant execute on function ' || sig || ' to anon, authenticated, service_role';

  -- migration 1 recreated _stock_watch with default grants: it is an internal function again
  execute 'revoke all on function public._stock_watch() from public, anon, authenticated';
  execute 'grant execute on function public._stock_watch() to service_role';
end $$;

drop function if exists public.counter_catalog();
create function public.counter_catalog()
returns table (variant_id uuid, label text, trade_paise bigint, buy_paise bigint, floor_paise bigint, on_hand numeric, units int)
language plpgsql stable security definer set search_path to '' as $function$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return query select c.variant_id, c.label, c.trade_paise,
    case when public.is_admin() then c.buy_paise end, case when public.is_admin() then c.floor_paise end, c.on_hand, k.units_per_case::int
  from public.bot_secret b cross join lateral public.bot_catalog(b.bot_key) c
  join public.variant v on v.id = c.variant_id join public.pack k on k.id = v.pack_id;
end $function$;
revoke all on function public.counter_catalog() from public, anon;
grant execute on function public.counter_catalog() to authenticated;
