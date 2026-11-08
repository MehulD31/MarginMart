-- Standard clean-up after live tests (run ALONE, never while tests run). Removes ALL counter bills, QA/TEST shops
-- with their khata rows, test "paid into" marks and test transfers, resets the bill number, and recomputes stock.
-- WARNING: deletes every counter bill. Only for the pre-launch database with no real bills yet.
begin;
delete from payment_account pa where (pa.kind = 'counter_sale' and not exists (select 1 from cash_sale c where c.id = pa.ref_id))
  or (pa.kind = 'payment' and exists (select 1 from ledger_entry l join shop s on s.id = l.shop_id where l.id = pa.ref_id and (s.name like 'QA %' or s.name like 'TEST %')));
delete from money_transfer where note like 'QA%' or voided_at is not null;
delete from stock_move where cash_sale_id is not null;
delete from cash_sale;
alter table ledger_entry disable trigger ledger_append_only;
delete from ledger_entry where shop_id in (select id from shop where name like 'QA %' or name like 'TEST %');
alter table ledger_entry enable trigger ledger_append_only;
delete from shop where name like 'QA %' or name like 'TEST %';
delete from bot_session;
update stock s set on_hand = coalesce((select sum(qty) from stock_move m where m.variant_id = s.variant_id), 0);
select setval('cash_sale_no_seq', 1, false);
commit;
select (select count(*) from cash_sale) bills, (select count(*) from ledger_entry) ledger, (select count(*) from payment_account) paid_into,
  (select count(*) from money_transfer) moves, (select sum(on_hand) from stock) stock, (select sum(qty) from stock_move) stock_moves,
  (select count(*) from shop where active) shops, (select tgenabled from pg_trigger where tgname = 'ledger_append_only') guard_on;
