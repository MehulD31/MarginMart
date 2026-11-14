-- Test data must never stay on the live site. Tests create records named "QA ..." / "TEST ..."; this removes them.
-- SAFE BY DESIGN: only touches records of QA/TEST shops, QA vehicles/routes, the QA test item, QA users. It stops with an
-- error (deleting nothing) if a QA trip/route has a bill or order of a REAL shop.
-- Callers: tests (admin login) at the end of a run, and pg_cron every night as a backstop.

/** Creates the shared test item (price rows are draft-only for normal logins, so the tests cannot insert one). */
create or replace function public.qa_fixture() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_pack uuid; v_var uuid; v_list uuid; v_brand uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select id into v_pack from public.pack where name_en = 'QA Test Drink' limit 1;
  if v_pack is null then
    select id into v_brand from public.brand order by name limit 1;
    insert into public.pack (brand_id, name_en, units_per_case, mrp_paise, active) values (v_brand, 'QA Test Drink', 24, 2000, false) returning id into v_pack;
  end if;
  select id into v_var from public.variant where pack_id = v_pack limit 1;
  if v_var is null then insert into public.variant (pack_id, flavour_en) values (v_pack, 'QA Test Drink') returning id into v_var; end if;
  select id into v_list from public.price_list where status = 'active' limit 1;
  if v_list is not null and not exists (select 1 from public.price_list_item where pack_id = v_pack and price_list_id = v_list) then
    insert into public.price_list_item (price_list_id, pack_id, trade_price_paise) values (v_list, v_pack, 50000);
  end if;
  return jsonb_build_object('pack_id', v_pack, 'variant_id', v_var);
end $$;
revoke all on function public.qa_fixture() from public, anon;
grant execute on function public.qa_fixture() to authenticated;

create or replace function public.qa_cleanup() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare n_shop int; n_van int; n_route int; n_pack int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  create temp table qa_shop on commit drop as select id from public.shop where name ilike 'QA %' or name ilike 'TEST %';
  create temp table qa_route on commit drop as select id from public.route where name ilike 'QA %';
  create temp table qa_plan on commit drop as
    select p.id from public.route_day_plan p
     where p.vehicle_id in (select id from public.vehicle where name ilike 'QA %') or p.route_id in (select id from qa_route);
  create temp table qa_var on commit drop as
    select v.id from public.variant v join public.pack k on k.id = v.pack_id where k.name_en = 'QA Test Drink' or v.flavour_en = 'QA Test Drink';
  create temp table qa_bill on commit drop as
    select id from public.cash_sale where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan);
  if exists (select 1 from public.cash_sale c where c.id in (select id from qa_bill) and c.shop_id not in (select id from qa_shop))
     or exists (select 1 from public.orders o where o.route_day_plan_id in (select id from qa_plan) and o.shop_id not in (select id from qa_shop))
     or exists (select 1 from public.shop s where s.route_id in (select id from qa_route) and s.id not in (select id from qa_shop))
  then raise exception 'A QA trip or route holds a REAL shop''s bill, order or shop. Nothing deleted: check by hand.'; end if;

  delete from public.payment_account where (kind = 'counter_sale' and ref_id in (select id from qa_bill))
    or (kind = 'payment' and ref_id in (select id from public.ledger_entry where shop_id in (select id from qa_shop)));
  delete from public.money_transfer where note like 'QA%';
  delete from public.stock_move where cash_sale_id in (select id from qa_bill) or route_day_plan_id in (select id from qa_plan)
    or variant_id in (select id from qa_var) or purchase_id in (select id from public.purchase where invoice_no like 'QA-%');
  delete from public.cash_sale where id in (select id from qa_bill);
  alter table public.ledger_entry disable trigger ledger_append_only;
  delete from public.ledger_entry where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan);
  alter table public.ledger_entry enable trigger ledger_append_only;
  alter table public.delivery_line disable trigger delivery_append_only;
  delete from public.delivery_line where order_id in (select id from public.orders where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan));
  alter table public.delivery_line enable trigger delivery_append_only;
  delete from public.invoice where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan);
  delete from public.order_line where order_id in (select id from public.orders where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan));
  delete from public.orders where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan);
  delete from public.cash_handover where route_day_plan_id in (select id from qa_plan);
  delete from public.load_line where route_day_plan_id in (select id from qa_plan);
  delete from public.route_day_plan where id in (select id from qa_plan);
  delete from public.vehicle where name ilike 'QA %';
  get diagnostics n_van = row_count;
  delete from public.purchase_line where purchase_id in (select id from public.purchase where invoice_no like 'QA-%');
  delete from public.purchase where invoice_no like 'QA-%';
  delete from public.supplier where name ilike 'QA %' and not exists (select 1 from public.purchase p where p.supplier_id = supplier.id);
  delete from public.scheme where note ilike 'QA%';
  delete from public.join_requests where shop_name ilike 'QA %';
  delete from auth.users where id in (select user_id from public.profiles where shop_id in (select id from qa_shop)
    or (name ilike 'QA %' and role in ('manager', 'driver')));
  delete from public.shop where id in (select id from qa_shop);
  get diagnostics n_shop = row_count;
  delete from public.route where id in (select id from qa_route);
  get diagnostics n_route = row_count;
  delete from public.price_list_item where pack_id in (select pack_id from public.variant where id in (select id from qa_var));
  delete from public.stock where variant_id in (select id from qa_var);
  delete from public.variant where id in (select id from qa_var);
  delete from public.pack where name_en = 'QA Test Drink' and not exists (select 1 from public.variant v where v.pack_id = pack.id);
  get diagnostics n_pack = row_count;
  -- stock is always the sum of its moves
  update public.stock s set on_hand = coalesce((select sum(qty) from public.stock_move m where m.variant_id = s.variant_id), 0)
   where s.on_hand <> coalesce((select sum(qty) from public.stock_move m where m.variant_id = s.variant_id), 0);
  perform setval('public.cash_sale_no_seq', greatest(1, coalesce((select max(substr(number, 4)::int) from public.cash_sale), 0)),
                 (select count(*) > 0 from public.cash_sale));
  return jsonb_build_object('shops', n_shop, 'vehicles', n_van, 'routes', n_route, 'packs', n_pack);
end $$;
revoke all on function public.qa_cleanup() from public, anon;
grant execute on function public.qa_cleanup() to authenticated;
