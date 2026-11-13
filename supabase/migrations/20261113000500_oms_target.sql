-- Pepsi portal: monthly Must Bill list and Range SKU progress (from the Must Bill DBR Target and Range Target reports).
-- Pepsi sets a Must Bill quantity per SKU; Range SKUs are tracked month to date. Admin read only, written by the sync job.
create table if not exists public.oms_target (
  kind text not null check (kind in ('must_bill', 'range')),
  month text not null,                 -- 'YYYY-MM'
  parent_sku_code text not null,
  description text not null,
  brand text,
  target_qty numeric not null default 0,   -- must bill: cases Pepsi wants us to bill this month (0 = not set)
  done_qty numeric not null default 0,     -- billed so far this month
  open_qty numeric not null default 0,     -- ordered, not billed yet
  valid_to date,
  updated_at timestamptz not null default now(),
  primary key (kind, month, parent_sku_code)
);
alter table public.oms_target enable row level security;
create policy oms_target_admin on public.oms_target for select using ((select public.is_admin()));
