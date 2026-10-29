-- Live deliveries page: push new bills, payments and trip status changes to admins (RLS still applies).
alter publication supabase_realtime add table public.invoice, public.ledger_entry, public.route_day_plan;
