-- Removes persona-review fixtures. Run before the pilot (in the SQL editor, as the postgres owner).
-- The ledger and delivery tables are append-only by trigger, so triggers are bypassed for this one script.
set session_replication_role = replica;

with qa_shops as (select id from public.shop where phone in ('9000000150','9000000151') or name like 'QA Stop %'),
     qa_orders as (select id from public.orders where shop_id in (select id from qa_shops))
delete from public.ledger_entry where shop_id in (select id from qa_shops);
delete from public.delivery_line where order_id in (select o.id from public.orders o join public.shop s on s.id = o.shop_id where s.phone in ('9000000150','9000000151') or s.name like 'QA Stop %');
delete from public.invoice where shop_id in (select id from public.shop where phone in ('9000000150','9000000151') or name like 'QA Stop %');
delete from public.order_line where order_id in (select o.id from public.orders o join public.shop s on s.id = o.shop_id where s.phone in ('9000000150','9000000151') or s.name like 'QA Stop %');
delete from public.orders where shop_id in (select id from public.shop where phone in ('9000000150','9000000151') or name like 'QA Stop %');
delete from auth.users where id in (select user_id from public.profiles where shop_id in (select id from public.shop where name like 'QA Stop %'));
delete from auth.users where email like '900000010_@login.marginmart.app';
delete from public.shop where phone in ('9000000150','9000000151') or name like 'QA Stop %';
delete from public.load_line where route_day_plan_id in (select p.id from public.route_day_plan p join public.route r on r.id = p.route_id where r.name like 'QA %');
delete from public.route_day_plan where route_id in (select id from public.route where name like 'QA %');
delete from public.route where name like 'QA %';
delete from public.client_action;
delete from public.login_attempts where phone like '90000001%';
drop function if exists public._qa_make_user(text, public.user_role, text, uuid, boolean);

set session_replication_role = origin;
-- Bill numbers used by tests are gone; restart the counter so real bills begin at 000001.
delete from public.invoice_counter where not exists (select 1 from public.invoice);
