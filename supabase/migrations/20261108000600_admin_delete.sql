-- One admin-only Delete for the website. Every kind checks what depends on it first and refuses with a clear code,
-- so a delete can never break money records or stock. Stock moves are reversed where the record moved stock.
-- Delivered bills and khata payments are NOT deletable here (they keep Void), on purpose.
--   counter_sale  bill and its lines; stock put back (a cancelled bill already put it back)
--   order         only while not delivered and the truck is not loaded
--   purchase      cases taken back out of stock; refused if some of them are already sold / loaded
--   user          a login (not yourself, not the last admin, not one with history -> turn it off instead)
--   route / vehicle / scheme / pack / variant / supplier / join_request   when nothing uses them
create or replace function public.admin_delete(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; v_n int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_id is null then raise exception 'INVALID_INPUT'; end if;

  if p_kind = 'counter_sale' then
    if not exists (select 1 from public.cash_sale where id = p_id) then raise exception 'NOT_FOUND'; end if;
    -- the bill's own stock moves add up to what is still out of stock (0 if it was cancelled)
    update public.stock s set on_hand = s.on_hand - m.q, updated_at = now()
      from (select variant_id, sum(qty) q from public.stock_move where cash_sale_id = p_id group by variant_id) m where s.variant_id = m.variant_id;
    delete from public.stock_move where cash_sale_id = p_id;
    delete from public.cash_sale where id = p_id;

  elsif p_kind = 'order' then
    select o.id, o.status, p.status plan_status into r from public.orders o join public.route_day_plan p on p.id = o.route_day_plan_id where o.id = p_id;
    if r.id is null then raise exception 'NOT_FOUND'; end if;
    if exists (select 1 from public.invoice where order_id = p_id) or exists (select 1 from public.delivery_line where order_id = p_id) then raise exception 'ORDER_DELIVERED'; end if;
    if r.plan_status <> 'planning' and r.status <> 'cancelled' then raise exception 'ORDER_LOCKED'; end if;
    delete from public.orders where id = p_id;

  elsif p_kind = 'purchase' then
    if not exists (select 1 from public.purchase where id = p_id) then raise exception 'NOT_FOUND'; end if;
    if exists (select 1 from (select variant_id, sum(qty) q from public.stock_move where purchase_id = p_id group by variant_id) m
               join public.stock s on s.variant_id = m.variant_id where s.on_hand - m.q < 0) then raise exception 'PURCHASE_STOCK_USED'; end if;
    update public.stock s set on_hand = s.on_hand - m.q, updated_at = now()
      from (select variant_id, sum(qty) q from public.stock_move where purchase_id = p_id group by variant_id) m where s.variant_id = m.variant_id;
    delete from public.stock_move where purchase_id = p_id;
    delete from public.purchase where id = p_id;

  elsif p_kind = 'user' then
    if p_id = auth.uid() then raise exception 'CANNOT_DELETE_SELF'; end if;
    select * into r from public.profiles where user_id = p_id;
    if r.user_id is null then raise exception 'NOT_FOUND'; end if;
    if r.role = 'admin' and (select count(*) from public.profiles where role = 'admin' and active) <= 1 then raise exception 'LAST_ADMIN'; end if;
    if exists (select 1 from public.orders where placed_by = p_id) or exists (select 1 from public.invoice where created_by = p_id)
       or exists (select 1 from public.ledger_entry where created_by = p_id) or exists (select 1 from public.route_day_plan where driver_id = p_id)
       or exists (select 1 from public.purchase where created_by = p_id) or exists (select 1 from public.cash_handover where closed_by = p_id or received_by = p_id)
       or exists (select 1 from public.client_action where created_by = p_id)
    then raise exception 'USER_HAS_HISTORY'; end if;
    update public.profiles set created_by = null where created_by = p_id;
    update public.join_requests set reviewed_by = null where reviewed_by = p_id;
    update public.price_list set created_by = null where created_by = p_id;
    update public.pin_record set set_by = null where set_by = p_id;
    update public.scheme set created_by = null where created_by = p_id;
    update public.cash_sale set voided_by = null where voided_by = p_id;
    delete from public.login_attempts where phone = r.phone;
    delete from auth.users where id = p_id;           -- profile + pin record go with it (cascade)

  elsif p_kind = 'route' then
    select * into r from public.route where id = p_id;
    if r.id is null then raise exception 'NOT_FOUND'; end if;
    if r.name = 'Direct sales' then raise exception 'ROUTE_PROTECTED'; end if;
    if exists (select 1 from public.shop where route_id = p_id) then raise exception 'ROUTE_HAS_SHOPS'; end if;
    if exists (select 1 from public.route_day_plan p where p.route_id = p_id and (p.status <> 'planning' or exists (select 1 from public.orders o where o.route_day_plan_id = p.id)))
    then raise exception 'ROUTE_HAS_ORDERS'; end if;
    delete from public.route_day_plan where route_id = p_id;
    delete from public.route where id = p_id;

  elsif p_kind = 'vehicle' then
    if not exists (select 1 from public.vehicle where id = p_id) then raise exception 'NOT_FOUND'; end if;
    if exists (select 1 from public.profiles where vehicle_id = p_id) then raise exception 'VEHICLE_HAS_LOGIN'; end if;
    if exists (select 1 from public.route_day_plan where vehicle_id = p_id and status <> 'planning') then raise exception 'VEHICLE_IN_USE'; end if;
    update public.route set default_vehicle_id = null where default_vehicle_id = p_id;
    update public.route_day_plan set vehicle_id = null where vehicle_id = p_id;
    delete from public.vehicle where id = p_id;

  elsif p_kind = 'scheme' then
    update public.scheme_draft set scheme_id = null where scheme_id = p_id;
    delete from public.scheme where id = p_id;
    if not found then raise exception 'NOT_FOUND'; end if;

  elsif p_kind in ('pack', 'variant') then
    for r in select v.id from public.variant v where (p_kind = 'variant' and v.id = p_id) or (p_kind = 'pack' and v.pack_id = p_id) loop
      if exists (select 1 from public.order_line where variant_id = r.id) or exists (select 1 from public.delivery_line where variant_id = r.id)
         or exists (select 1 from public.load_line where variant_id = r.id) or exists (select 1 from public.purchase_line where variant_id = r.id)
         or exists (select 1 from public.cash_sale_line where variant_id = r.id) or exists (select 1 from public.stock_move where variant_id = r.id)
         or exists (select 1 from public.stock where variant_id = r.id and on_hand <> 0)
      then raise exception 'ITEM_IN_USE'; end if;
    end loop;
    if p_kind = 'pack' then
      if exists (select 1 from public.order_line where pack_id = p_id) then raise exception 'ITEM_IN_USE'; end if;
      delete from public.price_list_item where pack_id = p_id;
      delete from public.pack where id = p_id;          -- its flavours, stock rows and schemes go with it
    else
      delete from public.variant where id = p_id;
    end if;
    if not found then raise exception 'NOT_FOUND'; end if;

  elsif p_kind = 'supplier' then
    if exists (select 1 from public.purchase where supplier_id = p_id) then raise exception 'SUPPLIER_HAS_PURCHASES'; end if;
    delete from public.supplier where id = p_id;
    if not found then raise exception 'NOT_FOUND'; end if;

  elsif p_kind = 'join_request' then
    delete from public.join_requests where id = p_id;
    if not found then raise exception 'NOT_FOUND'; end if;

  else
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.audit_log (actor, table_name, row_id, action, before) values (auth.uid(), p_kind, p_id::text, 'delete', jsonb_build_object('kind', p_kind));
end $$;
revoke all on function public.admin_delete(text, uuid) from public, anon;
grant execute on function public.admin_delete(text, uuid) to authenticated;
