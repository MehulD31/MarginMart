-- Each route has a usual vehicle (Bhilai 3 -> Vehicle 1, Hathkhoj -> Vehicle 2, Kumhari -> Vehicle 3).
-- Scheduled trips start on that vehicle; it can still be changed per trip.
alter table public.route add column default_vehicle_id uuid references public.vehicle (id);

create or replace function public.ensure_route_day_plans(p_days int default 14) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.route_day_plan (route_id, date, vehicle_id)
  select r.id, d::date, (select v.id from public.vehicle v where v.id = r.default_vehicle_id and v.active)
  from public.route r
  cross join generate_series((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + p_days, interval '1 day') d
  where r.active and extract(isodow from d)::smallint = any (r.visit_days)
    and not exists (select 1 from public.route_day_plan p where p.route_id = r.id and p.date = d::date)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
