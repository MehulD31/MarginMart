-- Nightly backstop (02:30 IST) + health count so the watchdog can clean and alert if test data is ever left on the live site.
grant execute on function public.qa_cleanup() to service_role;
create or replace function public.ops_health() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0),
    'qa_left', (select count(*) from public.shop where name ilike 'QA %' or name ilike 'TEST %')
             + (select count(*) from public.vehicle where name ilike 'QA %')
             + (select count(*) from public.route where name ilike 'QA %')
             + (select count(*) from public.pack where name_en ilike 'QA %'))
$$;
select cron.unschedule('qa-cleanup') where exists (select 1 from cron.job where jobname = 'qa-cleanup');
select cron.schedule('qa-cleanup', '0 21 * * *', 'select public.qa_cleanup()');
