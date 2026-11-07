-- Delivery days used to appear only after the nightly cron (00:05 IST) or a staff order, so a new route showed
-- "No delivery scheduled" and its shops could not order. Now any route change keeps its plans in step at once:
--   * new / reactivated route or new visit days -> plans for the next 14 days are created,
--   * removed weekday or deactivated route -> future plans still in 'planning' with no orders are removed,
--   * default vehicle changed -> future 'planning' plans that used the old default get the new one.
create or replace function public.route_sync_plans()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if tg_op = 'UPDATE' then
    delete from public.route_day_plan p
     where p.route_id = new.id and p.status = 'planning' and p.date >= v_today
       and (not new.active or not (extract(isodow from p.date)::smallint = any (new.visit_days)))
       and not exists (select 1 from public.orders o where o.route_day_plan_id = p.id);
    if new.default_vehicle_id is distinct from old.default_vehicle_id then
      update public.route_day_plan p set vehicle_id = new.default_vehicle_id
       where p.route_id = new.id and p.status = 'planning' and p.date >= v_today
         and p.vehicle_id is not distinct from old.default_vehicle_id;
    end if;
  end if;
  if new.active then perform public.ensure_route_day_plans(14); end if;
  return null;
end $$;

drop trigger if exists route_sync_plans on public.route;
create trigger route_sync_plans after insert or update of visit_days, active, default_vehicle_id on public.route
  for each row execute function public.route_sync_plans();

select public.ensure_route_day_plans(14);
