-- Timed jobs on the minute. GitHub's own `schedule:` runs hours late or not at all (14 Nov 2026: the 19:30 Reel never went out), so
-- Supabase pg_cron now calls /api/tick?mode=<job>, which starts the ops job. Every ops mode is idempotent (public.ops_log), so a repeat
-- or a retry never sends twice; the 19:30 post is retried at 19:50 and 20:20 and never posts more than one Reel an evening.
-- Times are UTC (IST = UTC + 5:30).
do $$
declare j record;
begin
  for j in select * from (values
    ('job-morning',  '30 2 * * *',          'morning'),   -- 08:00 IST
    ('job-night',    '0 16 * * *',          'night'),     -- 21:30 IST
    ('job-weekly',   '30 3 * * 1',          'weekly'),    -- Mon 09:00 IST
    ('job-watchdog', '30 4,17 * * *',       'watchdog'),  -- 10:00 and 23:00 IST
    ('job-social',   '0,20,50 14 * * *',    'social')     -- 19:30, 19:50, 20:20 IST
  ) as t(name, sched, mode) loop
    perform cron.unschedule(j.name) where exists (select 1 from cron.job where jobname = j.name);
    perform cron.schedule(j.name, j.sched, format(
      $c$select net.http_post(url := 'https://kdfoods.vercel.app/api/tick?mode=%s', headers := jsonb_build_object('Content-Type','application/json','x-bot-key',(select bot_key from public.bot_secret limit 1)), body := '{}'::jsonb)$c$, j.mode));
  end loop;
end $$;
