-- Removes persona-review fixtures. Run before the pilot (SQL editor / MCP, as the postgres owner).
-- The ledger and delivery tables are append-only by trigger, so triggers are bypassed for this one script.
--
-- SCOPE: QA fixtures ONLY. This script must never touch real pilot data:
--   admins Mehul (8871565551) and Shobhit (9630012636), shop "Shobh", and routes Mon/Thu, Tue/Fri, Wed/Sat.
-- Everything below is keyed to QA markers:
--   shops   : phone 9000000150 / 9000000151, or name like 'QA Stop %' / 'QA Shop %'
--   staff   : email 900000010_@login.marginmart.app  (90000001 01..05 only)
--   routes  : name like 'QA %'
-- Pilot routes (Mon/Thu, Tue/Fri, Wed/Sat) do not match 'QA %', so their plans/loads survive.

set session_replication_role = replica;

-- QA shops by phone or by either QA naming scheme (QA Shop One/Two, QA Stop A/B <tag>).
with qa_shops as (
  select id from public.shop
  where phone in ('9000000150','9000000151') or name like 'QA Stop %' or name like 'QA Shop %'
),
qa_plans as (
  select id from public.route_day_plan
  where route_id in (select id from public.route where name like 'QA %')
)
-- Children first.
delete from public.cash_handover where route_day_plan_id in (select id from qa_plans);
delete from public.ledger_entry where shop_id in (select id from public.shop where phone in ('9000000150','9000000151') or name like 'QA Stop %' or name like 'QA Shop %');
delete from public.delivery_line where order_id in (select o.id from public.orders o join public.shop s on s.id = o.shop_id where s.phone in ('9000000150','9000000151') or s.name like 'QA Stop %' or s.name like 'QA Shop %');
delete from public.invoice where shop_id in (select id from public.shop where phone in ('9000000150','9000000151') or name like 'QA Stop %' or name like 'QA Shop %');
delete from public.order_line where order_id in (select o.id from public.orders o join public.shop s on s.id = o.shop_id where s.phone in ('9000000150','9000000151') or s.name like 'QA Stop %' or s.name like 'QA Shop %');
delete from public.orders where shop_id in (select id from public.shop where phone in ('9000000150','9000000151') or name like 'QA Stop %' or name like 'QA Shop %');

-- Audit rows the QA run wrote. Scoped to QA actors and QA rows so pilot history survives.
-- Done BEFORE deleting the QA logins, because the actor lookup reads public.profiles
-- (which cascade-deletes with auth.users below).
delete from public.audit_log
where actor in (select user_id from public.profiles where phone like '90000001%')
   or row_id in (select id::text from public.route where name like 'QA %');

-- Logins: the dynamic QA Stop shop owner (profile points at a QA shop) and the five fixed staff/shop accounts.
delete from auth.users where id in (
  select user_id from public.profiles
  where shop_id in (select id from public.shop where name like 'QA Stop %' or name like 'QA Shop %')
);
delete from auth.users where email like '900000010_@login.marginmart.app';

delete from public.shop where phone in ('9000000150','9000000151') or name like 'QA Stop %' or name like 'QA Shop %';

-- QA routes and their day plans / load lines.
delete from public.load_line where route_day_plan_id in (
  select p.id from public.route_day_plan p join public.route r on r.id = p.route_id where r.name like 'QA %');
delete from public.route_day_plan where route_id in (select id from public.route where name like 'QA %');
delete from public.route where name like 'QA %';

-- client_action only holds idempotency results (random UUIDs the suite generated); safe to clear.
delete from public.client_action;

delete from public.login_attempts where phone like '90000001%';

drop function if exists public._qa_make_user(text, public.user_role, text, uuid, boolean);

set session_replication_role = origin;

-- Bill numbers used by tests are gone; restart the counter so real bills begin at 000001.
delete from public.invoice_counter where not exists (select 1 from public.invoice);
