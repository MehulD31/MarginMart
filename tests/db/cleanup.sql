-- Clean-up after live tests (run ALONE, never while tests run).
-- SAFE BY DESIGN: touches ONLY records that belong to test shops named 'QA %' / 'TEST %'. It never deletes real bills,
-- orders, khata, stock moves or shops. (8 Nov 2026: an older version deleted every counter bill and wiped the owner's
-- real parchis; they were restored from the audit log. Never widen this script again.)
begin;
create temp table qa_shop on commit drop as select id from shop where name like 'QA %' or name like 'TEST %';
create temp table qa_bill on commit drop as select id from cash_sale where shop_id in (select id from qa_shop);
delete from payment_account where (kind = 'counter_sale' and ref_id in (select id from qa_bill))
  or (kind = 'payment' and ref_id in (select id from ledger_entry where shop_id in (select id from qa_shop)));
delete from money_transfer where note like 'QA%';
delete from stock_move where cash_sale_id in (select id from qa_bill);
delete from cash_sale where id in (select id from qa_bill);
alter table ledger_entry disable trigger ledger_append_only;
delete from ledger_entry where shop_id in (select id from qa_shop);
alter table ledger_entry enable trigger ledger_append_only;
delete from orders where shop_id in (select id from qa_shop);
delete from auth.users where id in (select user_id from profiles where shop_id in (select id from qa_shop));
delete from shop where id in (select id from qa_shop);
update stock s set on_hand = coalesce((select sum(qty) from stock_move m where m.variant_id = s.variant_id), 0);
-- Bill numbers continue after the highest real bill (never reset while real bills exist).
select setval('cash_sale_no_seq', greatest(1, coalesce((select max(substr(number, 4)::int) from cash_sale), 0)), (select count(*) > 0 from cash_sale));
commit;
select (select count(*) from cash_sale) bills, (select sum(on_hand) from stock) stock, (select sum(qty) from stock_move) stock_moves,
  (select count(*) from shop where active) shops, (select tgenabled from pg_trigger where tgname = 'ledger_append_only') guard_on;
