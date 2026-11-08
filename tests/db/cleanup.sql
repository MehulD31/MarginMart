-- Clean-up after live tests (run ALONE, never while tests run).
-- SAFE BY DESIGN: touches ONLY records that belong to test shops named 'QA %' / 'TEST %' and test vehicles named 'QA %'.
-- It never deletes real bills, orders, khata, stock moves, trips or shops. (8 Nov 2026: an older version deleted every
-- counter bill and wiped the owner's real parchis; they were restored from the audit log. Never widen this to real data.)
begin;
create temp table qa_shop on commit drop as select id from shop where name like 'QA %' or name like 'TEST %';
create temp table qa_plan on commit drop as select p.id from route_day_plan p join vehicle v on v.id = p.vehicle_id where v.name like 'QA %';
create temp table qa_bill on commit drop as select id from cash_sale where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan);
do $$ begin
  if exists (select 1 from cash_sale c where c.id in (select id from qa_bill) and c.shop_id not in (select id from qa_shop)) then
    raise exception 'A QA trip has a bill for a REAL shop. Stopping: check by hand, nothing deleted.';
  end if;
end $$;
delete from payment_account where (kind = 'counter_sale' and ref_id in (select id from qa_bill))
  or (kind = 'payment' and ref_id in (select id from ledger_entry where shop_id in (select id from qa_shop)));
delete from money_transfer where note like 'QA%';
delete from stock_move where cash_sale_id in (select id from qa_bill) or route_day_plan_id in (select id from qa_plan);
delete from cash_sale where id in (select id from qa_bill);
alter table ledger_entry disable trigger ledger_append_only;
delete from ledger_entry where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan);
alter table ledger_entry enable trigger ledger_append_only;
alter table delivery_line disable trigger delivery_append_only;
delete from delivery_line where order_id in (select id from orders where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan));
alter table delivery_line enable trigger delivery_append_only;
delete from invoice where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan);
delete from orders where shop_id in (select id from qa_shop) or route_day_plan_id in (select id from qa_plan);
delete from cash_handover where route_day_plan_id in (select id from qa_plan);
delete from load_line where route_day_plan_id in (select id from qa_plan);
delete from route_day_plan where id in (select id from qa_plan);
delete from vehicle where name like 'QA %';
delete from auth.users where id in (select user_id from profiles where shop_id in (select id from qa_shop)
  or (name like 'QA %' and role in ('manager', 'driver')));
delete from shop where id in (select id from qa_shop);
update stock s set on_hand = coalesce((select sum(qty) from stock_move m where m.variant_id = s.variant_id), 0);
-- Bill numbers continue after the highest real bill (never reset while real bills exist).
select setval('cash_sale_no_seq', greatest(1, coalesce((select max(substr(number, 4)::int) from cash_sale), 0)), (select count(*) > 0 from cash_sale));
commit;
select (select count(*) from cash_sale) bills, (select sum(on_hand) from stock) stock, (select sum(qty) from stock_move) stock_moves,
  (select count(*) from shop where active) shops, (select count(*) from vehicle) vehicles, (select tgenabled from pg_trigger where tgname = 'ledger_append_only') guard_on;
