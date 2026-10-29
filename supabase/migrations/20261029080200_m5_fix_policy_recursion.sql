-- Policies on shop and route_day_plan referenced each other (infinite recursion). Break the loop with
-- security-definer helpers that read without RLS.
create function public.auth_route_id() returns uuid language sql stable security definer set search_path = '' as $$
  select s.route_id from public.shop s where s.id = public.auth_shop_id()
$$;
create function public.driver_route_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select route_id from public.route_day_plan where id in (select public.driver_plan_ids())
$$;
revoke execute on function public.auth_route_id(), public.driver_route_ids() from public, anon;
grant execute on function public.auth_route_id(), public.driver_route_ids() to authenticated;

drop policy plan_read on public.route_day_plan;
create policy plan_read on public.route_day_plan for select to authenticated
  using ((select public.is_staff()) or route_id = (select public.auth_route_id()));
drop policy shop_driver_read on public.shop;
create policy shop_driver_read on public.shop for select to authenticated using (route_id in (select public.driver_route_ids()));
