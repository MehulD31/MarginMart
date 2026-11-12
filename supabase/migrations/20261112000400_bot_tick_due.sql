-- api/tick.js asks this every 2 minutes (pg_cron) whether there are new website changes to report.
create or replace function public.bot_tick_due(p_key text)
returns boolean language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return exists (select 1 from public.audit_log a where a.actor is not null
    and a.id > coalesce((select (detail->>'id')::bigint from public.ops_log where job = 'activity' and key = 'cursor'), 0));
end $$;
revoke all on function public.bot_tick_due(text) from public;
grant execute on function public.bot_tick_due(text) to anon, authenticated;
