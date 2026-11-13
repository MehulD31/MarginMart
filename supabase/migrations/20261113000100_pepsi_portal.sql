-- Pepsi (Varun Beverages) distributor portal sync (owner, 13 Nov 2026). Read-only copy of what the portal shows us.
-- Written by the GitHub Actions job (service key). Admins only: these are buy prices and credit.
create table if not exists public.oms_sku (
  sku_code text primary key,
  description text not null,
  child text,
  mrp_paise bigint,
  units_per_case int,
  price_paise bigint,          -- per case incl. GST, what Pepsi bills us
  base_paise bigint,
  tax_paise bigint,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.oms_price_change (
  id bigint generated always as identity primary key,
  sku_code text not null references public.oms_sku (sku_code) on delete cascade,
  old_paise bigint, new_paise bigint,
  seen_at timestamptz not null default now()
);
-- Our flavour -> portal SKU. 'auto' rows are re-matched every sync; 'manual' rows are never touched by the job.
create table if not exists public.oms_map (
  variant_id uuid primary key references public.variant (id) on delete cascade,
  sku_code text not null references public.oms_sku (sku_code) on delete cascade,
  source text not null default 'auto' check (source in ('auto', 'manual')),
  mrp_differs boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.oms_state (
  id int primary key default 1 check (id = 1),
  synced_at timestamptz, ok boolean, error text,
  distributor_code text, distributor_name text,
  credit_paise bigint, credit_at timestamptz,
  pdp jsonb, schemes jsonb, orders jsonb, vehicles jsonb
);
insert into public.oms_state (id) values (1) on conflict do nothing;

alter table public.oms_sku enable row level security;
alter table public.oms_price_change enable row level security;
alter table public.oms_map enable row level security;
alter table public.oms_state enable row level security;
create policy oms_sku_admin on public.oms_sku for select using ((select public.is_admin()));
create policy oms_price_change_admin on public.oms_price_change for select using ((select public.is_admin()));
create policy oms_map_admin_read on public.oms_map for select using ((select public.is_admin()));
create policy oms_map_admin_write on public.oms_map for all using ((select public.is_admin())) with check ((select public.is_admin()));
create policy oms_state_admin on public.oms_state for select using ((select public.is_admin()));
create trigger oms_map_audit after insert or update or delete on public.oms_map for each row execute function public.audit_row();
