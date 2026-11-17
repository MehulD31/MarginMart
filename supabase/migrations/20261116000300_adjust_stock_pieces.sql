-- Stock counts can have pieces now (e.g. 144.75 cases): a recount must compare with the exact number, not a rounded one.
do $$
declare d text; sig text;
begin
  d := pg_get_functiondef('public.adjust_stock(uuid, text, integer, text)'::regprocedure); sig := 'public.adjust_stock(uuid, text, integer, text)';
  if position('declare v_now int; v_delta int;' in d) = 0 or position('RETURNS integer' in d) = 0 then raise exception 'adjust_stock pattern missing'; end if;
  d := replace(d, 'declare v_now int; v_delta int;', 'declare v_now numeric; v_delta numeric;');
  d := replace(d, 'RETURNS integer', 'RETURNS numeric');
  execute 'drop function ' || sig;
  execute d;
  execute 'revoke all on function ' || sig || ' from public, anon';
  execute 'grant execute on function ' || sig || ' to authenticated, service_role';
end $$;
