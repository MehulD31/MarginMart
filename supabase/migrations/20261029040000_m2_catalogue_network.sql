-- M2: catalogue, price lists, routes, vehicles, shops.
-- Writes: admin only for catalogue/prices; staff (admin+manager) for routes/vehicles/shops.
-- Everyone signed in can read the catalogue and the ACTIVE price list.

create type public.scheme_type as enum ('net_rate', 'bogo_on_mrp');
create type public.price_list_status as enum ('draft', 'active', 'archived');

create table public.brand (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pack (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brand (id),
  name_en text not null check (length(trim(name_en)) between 1 and 100),
  name_hi text,
  size_label text,
  units_per_case int not null check (units_per_case between 1 and 500),
  mrp_paise bigint not null check (mrp_paise > 0),
  hsn text,
  gst_rate_bp int not null default 0 check (gst_rate_bp between 0 and 10000),
  cess_rate_bp int not null default 0 check (cess_rate_bp between 0 and 10000),
  is_returnable boolean not null default false,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name_en)
);

create table public.variant (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.pack (id) on delete cascade,
  flavour_en text not null check (length(trim(flavour_en)) between 1 and 60),
  flavour_hi text,
  image_path text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pack_id, flavour_en)
);
create index variant_pack on public.variant (pack_id);

create table public.price_list (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  effective_from date not null,
  price_includes_gst boolean not null default true,
  status public.price_list_status not null default 'draft',
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid()
);
create unique index price_list_one_active on public.price_list (status) where status = 'active';

create table public.price_list_item (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.price_list (id) on delete cascade,
  pack_id uuid not null references public.pack (id),
  trade_price_paise bigint not null check (trade_price_paise > 0),
  scheme_value_paise bigint not null default 0 check (scheme_value_paise >= 0),
  scheme_type public.scheme_type not null default 'net_rate',
  net_rate_paise bigint generated always as (trade_price_paise - scheme_value_paise) stored,
  remarks text,
  unique (price_list_id, pack_id),
  check (scheme_value_paise < trade_price_paise)
);

create table public.route (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 40),
  visit_days smallint[] not null check (cardinality(visit_days) between 1 and 7 and visit_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vehicle (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 40),
  reg_no text,
  capacity_cases int not null check (capacity_cases between 1 and 5000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.shop (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null check (length(trim(name)) between 1 and 100),
  owner_name text,
  phone text check (phone ~ '^[6-9][0-9]{9}$'),
  alt_phone text check (alt_phone ~ '^[6-9][0-9]{9}$'),
  address text,
  gstin text check (gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  route_id uuid not null references public.route (id),
  stop_seq int not null default 0,
  credit_limit_paise bigint not null default 0 check (credit_limit_paise >= 0),
  credit_days int not null default 7 check (credit_days between 0 and 90),
  order_block_override_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shop_route on public.shop (route_id, stop_seq);
create unique index shop_phone_unique on public.shop (phone) where phone is not null;

alter table public.profiles
  add constraint profiles_shop_fk foreign key (shop_id) references public.shop (id),
  add constraint profiles_vehicle_fk foreign key (vehicle_id) references public.vehicle (id),
  add constraint profiles_shop_role check (role <> 'shop' or shop_id is not null) not valid;

-- ---------- RLS ----------
alter table public.brand enable row level security;
alter table public.pack enable row level security;
alter table public.variant enable row level security;
alter table public.price_list enable row level security;
alter table public.price_list_item enable row level security;
alter table public.route enable row level security;
alter table public.vehicle enable row level security;
alter table public.shop enable row level security;

-- Catalogue: everyone signed in reads; admin writes.
create policy brand_read on public.brand for select to authenticated using (true);
create policy pack_read on public.pack for select to authenticated using (true);
create policy variant_read on public.variant for select to authenticated using (true);
create policy brand_write on public.brand for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy pack_write on public.pack for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy variant_write on public.variant for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Price lists: non-staff only see the active one. Admin writes drafts; activation via RPC.
create policy price_list_read on public.price_list for select to authenticated
  using (status = 'active' or (select public.is_staff()));
create policy price_list_item_read on public.price_list_item for select to authenticated
  using ((select public.is_staff()) or exists (select 1 from public.price_list pl where pl.id = price_list_id and pl.status = 'active'));
create policy price_list_insert on public.price_list for insert to authenticated
  with check ((select public.is_admin()) and status = 'draft');
create policy price_list_update on public.price_list for update to authenticated
  using ((select public.is_admin()) and status = 'draft') with check ((select public.is_admin()) and status = 'draft');
create policy price_list_delete on public.price_list for delete to authenticated
  using ((select public.is_admin()) and status = 'draft');
create policy price_list_item_write on public.price_list_item for all to authenticated
  using ((select public.is_admin()) and exists (select 1 from public.price_list pl where pl.id = price_list_id and pl.status = 'draft'))
  with check ((select public.is_admin()) and exists (select 1 from public.price_list pl where pl.id = price_list_id and pl.status = 'draft'));

-- Network: routes readable by all signed in (shop app shows delivery days); vehicles by staff+drivers.
create policy route_read on public.route for select to authenticated using (true);
create policy route_write on public.route for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy vehicle_read on public.vehicle for select to authenticated using ((select public.auth_role()) in ('admin','manager','driver'));
create policy vehicle_write on public.vehicle for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
-- Shops: staff all; a shop user only its own row. Driver access arrives with route-day plans (M5).
create policy shop_read on public.shop for select to authenticated
  using ((select public.is_staff()) or id = (select public.auth_shop_id()));
create policy shop_write on public.shop for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

grant select, insert, update, delete on public.brand, public.pack, public.variant, public.price_list,
  public.price_list_item, public.route, public.vehicle, public.shop to authenticated;
revoke all on public.brand, public.pack, public.variant, public.price_list,
  public.price_list_item, public.route, public.vehicle, public.shop from anon;

-- Activate a draft: archives the current active list atomically.
create function public.activate_price_list(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.price_list where id = p_id and status = 'draft' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from public.price_list_item where price_list_id = p_id) then raise exception 'EMPTY_PRICE_LIST'; end if;
  update public.price_list set status = 'archived' where status = 'active';
  update public.price_list set status = 'active', activated_at = now() where id = p_id;
end $$;
revoke execute on function public.activate_price_list(uuid) from public, anon;
grant execute on function public.activate_price_list(uuid) to authenticated;

-- Audit + updated_at.
create trigger pack_audit after insert or update or delete on public.pack for each row execute function public.audit_row();
create trigger variant_audit after insert or update or delete on public.variant for each row execute function public.audit_row();
create trigger price_list_audit after insert or update or delete on public.price_list for each row execute function public.audit_row();
create trigger price_list_item_audit after insert or update or delete on public.price_list_item for each row execute function public.audit_row();
create trigger route_audit after insert or update or delete on public.route for each row execute function public.audit_row();
create trigger vehicle_audit after insert or update or delete on public.vehicle for each row execute function public.audit_row();
create trigger shop_audit after insert or update or delete on public.shop for each row execute function public.audit_row();
create trigger pack_touch before update on public.pack for each row execute function public.touch_updated_at();
create trigger shop_touch before update on public.shop for each row execute function public.touch_updated_at();

-- Product photos: public-read bucket, admin upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 307200, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;
create policy product_images_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));

-- Original sheet text per pack, used to match monthly price-sheet imports.
-- Rows whose name repeats in the sheet are keyed "name|MRP". Values are set in seed.sql.
alter table public.pack add column source_name text;
create unique index pack_source_name_unique on public.pack (brand_id, lower(source_name)) where source_name is not null;
