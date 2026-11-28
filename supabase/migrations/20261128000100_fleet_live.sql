-- Live vehicle tracking from Euler Shepherd (owner, 28 Nov 2026). The Euler Turbo vehicles report position, speed, battery and km to
-- Euler's cloud; scripts/fleet/poll.mjs (GitHub Actions, started every hour by pg_cron via /api/tick?mode=fleet) reads it every minute
-- and writes here. The website shows it on the Loading page. Writes are service-role only; staff can read.
create table if not exists public.fleet_vehicle (
  imei text primary key,
  euler_id uuid,
  reg_no text not null,
  model text,
  vehicle_id uuid references public.vehicle(id) on delete set null,   -- which of our trucks this is (set on the website)
  lat double precision, lng double precision, heading double precision,
  speed numeric, soc numeric, range_km numeric, km_today numeric, odo numeric,
  state text, online boolean,
  seen_at timestamptz,          -- when the vehicle last sent its position (Euler "lua")
  updated_at timestamptz not null default now()
);
create table if not exists public.fleet_point (
  id bigserial primary key,
  imei text not null references public.fleet_vehicle(imei) on delete cascade,
  at timestamptz not null,
  lat double precision not null, lng double precision not null,
  speed numeric, soc numeric,
  unique (imei, at)
);
create index if not exists fleet_point_imei_at on public.fleet_point (imei, at desc);
alter table public.fleet_vehicle enable row level security;
alter table public.fleet_point enable row level security;
drop policy if exists fleet_vehicle_staff_read on public.fleet_vehicle;
create policy fleet_vehicle_staff_read on public.fleet_vehicle for select to authenticated using (public.is_staff());
drop policy if exists fleet_point_staff_read on public.fleet_point;
create policy fleet_point_staff_read on public.fleet_point for select to authenticated using (public.is_staff());
grant select on public.fleet_vehicle, public.fleet_point to authenticated;

-- Everything the website needs in one call: each vehicle now + its route for one day (IST).
create or replace function public.fleet_live(p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date := coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object('day', v_day, 'vehicles', coalesce((select jsonb_agg(jsonb_build_object(
      'imei', f.imei, 'reg_no', f.reg_no, 'model', f.model, 'vehicle_id', f.vehicle_id, 'vehicle', v.name,
      'lat', f.lat, 'lng', f.lng, 'speed', f.speed, 'soc', f.soc, 'range_km', f.range_km, 'km_today', f.km_today,
      'state', f.state, 'online', f.online, 'seen_at', f.seen_at, 'updated_at', f.updated_at,
      'route', coalesce((select jsonb_agg(jsonb_build_array(p.lat, p.lng) order by p.at) from public.fleet_point p
                          where p.imei = f.imei and (p.at at time zone 'Asia/Kolkata')::date = v_day), '[]'::jsonb))
      order by coalesce(v.name, f.reg_no)) from public.fleet_vehicle f left join public.vehicle v on v.id = f.vehicle_id), '[]'::jsonb));
end $$;
revoke all on function public.fleet_live(date) from public, anon;
grant execute on function public.fleet_live(date) to authenticated, service_role;

-- Link an Euler vehicle to one of our trucks (shown as "Vehicle 1 · CG07DJ1091").
create or replace function public.fleet_link(p_imei text, p_vehicle uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_vehicle is not null and not exists (select 1 from public.vehicle where id = p_vehicle) then raise exception 'NOT_FOUND'; end if;
  update public.fleet_vehicle set vehicle_id = null where vehicle_id = p_vehicle and imei <> p_imei;
  update public.fleet_vehicle set vehicle_id = p_vehicle where imei = p_imei;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.fleet_link(text, uuid) from public, anon;
grant execute on function public.fleet_link(text, uuid) to authenticated, service_role;

-- Start the poller every hour (it runs ~58 minutes, reading every minute), and keep 60 days of route points.
do $$ begin
  perform cron.unschedule('job-fleet') where exists (select 1 from cron.job where jobname = 'job-fleet');
  perform cron.schedule('job-fleet', '0 * * * *',
    $c$select net.http_post(url := 'https://kdfoods.vercel.app/api/tick?mode=fleet', headers := jsonb_build_object('Content-Type','application/json','x-bot-key',(select bot_key from public.bot_secret limit 1)), body := '{}'::jsonb)$c$);
  perform cron.unschedule('fleet-points-trim') where exists (select 1 from cron.job where jobname = 'fleet-points-trim');
  perform cron.schedule('fleet-points-trim', '15 21 * * *', $c$delete from public.fleet_point where at < now() - interval '60 days'$c$);
end $$;
