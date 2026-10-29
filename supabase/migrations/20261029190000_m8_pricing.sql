-- M8: margin pricing. Business settings drive a cost per case; each pack gets a minimum price and a floor.
-- Staff can price order lines (volume slabs); shops still pay the price list. Pepsi invoices import from Excel.

create table public.business_settings (
  id int primary key default 1 check (id = 1),
  fixed_costs jsonb not null default '[{"label":"EMI","paise":2500000},{"label":"Drivers (3)","paise":4500000},{"label":"Helpers (3)","paise":3000000},{"label":"Manager","paise":2000000},{"label":"Director","paise":3000000},{"label":"Miscellaneous","paise":2000000}]',
  loading_paise_per_case int not null default 125 check (loading_paise_per_case between 0 and 10000),
  cash_discount_paise int not null default 100 check (cash_discount_paise between 0 and 10000),
  on_time_pct int not null default 70 check (on_time_pct between 0 and 100),
  default_margin_paise int not null default 3500 check (default_margin_paise between 0 and 100000),
  truck_capacity int not null default 120 check (truck_capacity between 1 and 5000),
  trips_per_day int not null default 2 check (trips_per_day between 1 and 5),
  working_days int not null default 26 check (working_days between 1 and 31),
  on_season_months smallint[] not null default '{3,4,5,6,7,8}',
  planned_cases_off int not null default 10000 check (planned_cases_off > 0),
  planned_cases_on int not null default 18720 check (planned_cases_on > 0),
  -- [{min_cases, off_paise}] by season; applied on the total cases in an order.
  slabs jsonb not null default '{"off":[{"min":5,"off":500},{"min":10,"off":1000}],"on":[{"min":5,"off":800},{"min":10,"off":1500}]}',
  updated_at timestamptz not null default now()
);
insert into public.business_settings (id) values (1);
alter table public.business_settings enable row level security;
create policy business_settings_read on public.business_settings for select to authenticated using ((select public.is_staff()) or public.auth_role() = 'driver');
create policy business_settings_write on public.business_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, update on public.business_settings to authenticated;
revoke all on public.business_settings from anon;
create trigger business_settings_audit after update on public.business_settings for each row execute function public.audit_row();
create trigger business_settings_touch before update on public.business_settings for each row execute function public.touch_updated_at();

-- Supplier SKU code -> our flavour, learned from Excel imports.
create table public.supplier_sku (
  supplier_id uuid not null references public.supplier (id) on delete cascade,
  sku_code text not null check (length(sku_code) between 1 and 40),
  variant_id uuid not null references public.variant (id) on delete cascade,
  primary key (supplier_id, sku_code)
);
alter table public.supplier_sku enable row level security;
create policy supplier_sku_read on public.supplier_sku for select to authenticated using ((select public.is_staff()));
create policy supplier_sku_write on public.supplier_sku for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.supplier_sku to authenticated;
revoke all on public.supplier_sku from anon;

-- This month (IST): cases delivered, sales value and cost of those cases.
-- Cost uses the flavour's average purchase cost, else trade price minus the default margin.
create function public.month_stats() returns table (cases bigint, sales_paise bigint, cost_paise bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(dl.qty_delivered), 0)::bigint,
         coalesce(sum(dl.qty_delivered * dl.unit_price_paise), 0)::bigint,
         coalesce(sum(dl.qty_delivered * coalesce(nullif(s.avg_cost_paise, 0),
           greatest(i.trade_price_paise - (select default_margin_paise from public.business_settings), 0), dl.unit_price_paise)), 0)::bigint
  from public.delivery_line dl
  join public.invoice inv on inv.id = dl.invoice_id
  join public.variant v on v.id = dl.variant_id
  left join public.stock s on s.variant_id = dl.variant_id
  left join public.price_list_item i on i.pack_id = v.pack_id and i.price_list_id = (select id from public.price_list where status = 'active')
  where public.is_staff()
    and inv.created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
$$;
revoke execute on function public.month_stats() from public, anon;
grant execute on function public.month_stats() to authenticated;

-- save_order: staff may send "price_paise" per line (per case). Shops can't; their price stays the price list.
do $outer$
declare d text; n text;
begin
  select pg_get_functiondef('public.save_order(jsonb, uuid, uuid)'::regprocedure) into d;
  n := replace(d,
    'select (e ->> ''variant_id'')::uuid variant_id, (e ->> ''qty'') qty from jsonb_array_elements(p_lines) e',
    'select (e ->> ''variant_id'')::uuid variant_id, (e ->> ''qty'') qty, (e ->> ''price_paise'') price from jsonb_array_elements(p_lines) e');
  n := replace(n,
    'where i.id is null or l.qty !~ ''^\d{1,3}$'' or l.qty::int < 1;',
    'where i.id is null or l.qty !~ ''^\d{1,3}$'' or l.qty::int < 1 or (l.price is not null and (l.price !~ ''^\d{1,9}$'' or l.price::bigint < 1));');
  n := replace(n,
    'select v_order, v.id, pk.id, (e ->> ''qty'')::int, i.net_rate_paise,',
    'select v_order, v.id, pk.id, (e ->> ''qty'')::int,
         case when v_role <> ''shop'' and (e ->> ''price_paise'') is not null then (e ->> ''price_paise'')::bigint else i.net_rate_paise end,');
  if n = d or position('price_paise'')::bigint else i.net_rate_paise' in n) = 0 or position('l.price is not null' in n) = 0 then
    raise exception 'save_order patch did not apply';
  end if;
  execute n;
end $outer$;

-- Creambell milk (on Pepsi's invoice, not on the scheme sheet). Trade price ₹615/case agreed with the owner.
insert into public.brand (name) values ('Creambell') on conflict (name) do nothing;
insert into public.pack (brand_id, name_en, units_per_case, mrp_paise, sort)
select id, 'Creambell Milk 180ml', 24, 3000, 99 from public.brand where name = 'Creambell'
on conflict (brand_id, name_en) do nothing;
insert into public.variant (pack_id, flavour_en, sort)
select pk.id, f, s from public.pack pk, (values ('Chocolate', 1), ('Coffee', 2)) x(f, s) where pk.name_en = 'Creambell Milk 180ml'
on conflict (pack_id, flavour_en) do nothing;
insert into public.price_list_item (price_list_id, pack_id, trade_price_paise)
select pl.id, pk.id, 61500 from public.price_list pl, public.pack pk where pl.status = 'active' and pk.name_en = 'Creambell Milk 180ml'
on conflict (price_list_id, pack_id) do nothing;
