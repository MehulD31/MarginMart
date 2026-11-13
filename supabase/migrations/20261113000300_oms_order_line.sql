-- Pepsi portal: one row per order, SKU and kind of line (General / Specific MRP / Near Expiry / Filler / Range / Must Bill ...).
-- Pepsi adds Near Expiry and Specific MRP lines to our orders and corrects quantities; we keep what was asked vs what we got,
-- and why a line was deleted or rejected. Written by the GitHub Actions job (service key). Admin read only.
create table if not exists public.oms_order_line (
  order_no text not null,
  sku_code text not null,
  kind text not null check (kind in ('general', 'specific_mrp', 'near_expiry', 'filler', 'must_bill', 'range', 'promo', 'other')),
  order_type text,                  -- Pepsi's own wording, e.g. "General Order, Range SKU Order"
  order_date date,
  description text,
  asked numeric not null default 0,
  corrected numeric not null default 0,
  allocated numeric not null default 0,
  invoiced numeric not null default 0,
  deleted numeric not null default 0,
  value_paise bigint not null default 0,
  delete_reason text,
  reject_reason text,
  updated_at timestamptz not null default now(),
  primary key (order_no, sku_code, kind)
);
create index if not exists oms_order_line_kind on public.oms_order_line (kind, order_date desc);
alter table public.oms_order_line enable row level security;
create policy oms_order_line_admin on public.oms_order_line for select using ((select public.is_admin()));
