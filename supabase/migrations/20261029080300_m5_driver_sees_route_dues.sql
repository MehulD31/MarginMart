-- Drivers collect old dues on the route, so they see the ledger of every shop on today's route.
drop policy ledger_read on public.ledger_entry;
create policy ledger_read on public.ledger_entry for select to authenticated using (
  (select public.is_staff()) or shop_id = (select public.auth_shop_id())
  or shop_id in (select s.id from public.shop s where s.route_id in (select public.driver_route_ids())));
