-- Counter sales from Telegram (cash/UPI, fully paid), a bot session table, and key-checked RPCs for the
-- Telegram bot (Vercel) and the Google Sheet (Apps Script). Applied on the live DB as migration "cash_sales";
-- this file mirrors it. Keys are random, stored only in public.bot_secret (no client can read it).
-- See the live DB for the exact function bodies: bot_ok, bot_session_get/set, bot_shops, bot_add_shop,
-- bot_catalog, bot_record_sale, sheet_rows, and month_stats (now includes counter sales).

create table public.bot_secret (id int primary key default 1 check (id = 1), bot_key text not null, sheet_key text not null);
alter table public.bot_secret enable row level security;
revoke all on public.bot_secret from anon, authenticated;
insert into public.bot_secret (bot_key, sheet_key) values (encode(extensions.gen_random_bytes(24), 'hex'), encode(extensions.gen_random_bytes(24), 'hex'));

insert into public.route (name, visit_days, active) values ('Direct sales', '{1,2,3,4,5,6,7}', false) on conflict (name) do nothing;

create sequence public.cash_sale_no_seq;
create table public.cash_sale (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique,
  number text not null unique,
  shop_id uuid not null references public.shop (id),
  payment_mode text not null check (payment_mode in ('cash', 'upi')),
  total_paise bigint not null,
  entered_by text check (length(entered_by) <= 60),
  created_at timestamptz not null default now()
);
create table public.cash_sale_line (
  id bigint generated always as identity primary key,
  cash_sale_id uuid not null references public.cash_sale (id) on delete cascade,
  variant_id uuid not null references public.variant (id),
  qty int not null check (qty between 1 and 9999),
  price_paise bigint not null check (price_paise between 1 and 10000000),
  buy_paise bigint not null default 0
);
create index cash_sale_line_sale on public.cash_sale_line (cash_sale_id);
create index cash_sale_created on public.cash_sale (created_at desc);
alter table public.cash_sale enable row level security;
alter table public.cash_sale_line enable row level security;
create policy cash_sale_read on public.cash_sale for select to authenticated using ((select public.is_staff()));
create policy cash_sale_line_read on public.cash_sale_line for select to authenticated using ((select public.is_staff()));
grant select on public.cash_sale, public.cash_sale_line to authenticated;
revoke all on public.cash_sale, public.cash_sale_line from anon;
create trigger cash_sale_audit after insert or update or delete on public.cash_sale for each row execute function public.audit_row();
alter table public.stock_move add column cash_sale_id uuid references public.cash_sale (id);

create table public.bot_session (user_id bigint primary key, state jsonb not null default '{}', updated_at timestamptz not null default now());
alter table public.bot_session enable row level security;
revoke all on public.bot_session from anon, authenticated;
