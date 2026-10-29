-- Drivers can sell from the truck to any active shop (van sale), not only shops on the trip's route.
-- They see every active shop's name/phone/address; dues stay limited to shops on their trip.
create policy shop_driver_all_read on public.shop for select to authenticated using (active and (select public.auth_role()) = 'driver');
do $outer$
declare d text; n text;
begin
  select pg_get_functiondef('public.record_delivery(uuid, uuid, uuid, jsonb, jsonb)'::regprocedure) into d;
  n := replace(d,
    'if not (exists (select 1 from public.shop where id = p_shop_id and route_id = v_plan.route_id)',
    'if not (exists (select 1 from public.shop where id = p_shop_id and active)');
  if n = d then raise exception 'record_delivery patch did not apply'; end if;
  execute n;
end $outer$;
