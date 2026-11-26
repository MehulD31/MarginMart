-- Route Call Sheet: exact Excel route sheets + extra manual/DB shops at end + daily call tracking for manager/admin
create table if not exists public.route_sheet_shop (
  id uuid primary key default gen_random_uuid(),
  sheet_name text not null,
  route_id uuid references public.route(id) on delete set null,
  sr_no integer,
  sort_order integer not null default 0,
  source text not null default 'excel' check (source in ('excel', 'manual', 'db_extra')),
  shop_id uuid references public.shop(id) on delete set null,
  r_no text,
  beat text,
  mkt text,
  outlet_name text not null,
  address text,
  location text,
  contact_name text,
  phone text,
  visi_info text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists route_sheet_shop_sheet_sort_idx
  on public.route_sheet_shop (sheet_name, sort_order);

create index if not exists route_sheet_shop_route_idx
  on public.route_sheet_shop (route_id);

create table if not exists public.route_call_log (
  id uuid primary key default gen_random_uuid(),
  sheet_shop_id uuid not null references public.route_sheet_shop(id) on delete cascade,
  call_date date not null,
  status text not null check (status in ('pending', 'called', 'order_taken', 'no_answer', 'callback')),
  note text,
  called_by uuid references auth.users(id) on delete set null,
  called_by_name text,
  called_at timestamptz not null default now(),
  unique (sheet_shop_id, call_date)
);

create index if not exists route_call_log_date_idx
  on public.route_call_log (call_date);

alter table public.route_sheet_shop enable row level security;
alter table public.route_call_log enable row level security;

drop policy if exists route_sheet_shop_staff on public.route_sheet_shop;
create policy route_sheet_shop_staff on public.route_sheet_shop
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists route_call_log_staff on public.route_call_log;
create policy route_call_log_staff on public.route_call_log
  for all using ((select public.is_staff())) with check ((select public.is_staff()));
