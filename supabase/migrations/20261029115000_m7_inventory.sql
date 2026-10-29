-- M7: warehouse inventory (single warehouse). Stock is counted in cases per flavour (variant).
-- Every change is a row in stock_move; stock.on_hand is the running total kept by trigger.
-- Order flow moves stock automatically:
--   lock_load  (planning -> loaded): ordered + spare cases leave the warehouse   ('load_out')
--   unlock_load (loaded -> planning): that is reversed                             ('load_undo')
--   close_day  (-> closed): cases counted back come in                             ('return_in')
--   reopen_day (closed -> out): those returns are reversed                         ('return_undo')
-- Stock may go negative. It never limits what shops can see or order.
-- Cost: weighted average cost per case, updated on every purchase.
create type public.stock_move_kind as enum ('purchase', 'load_out', 'load_undo', 'return_in', 'return_undo', 'adjust');

create table public.stock (
  variant_id uuid primary key references public.variant (id) on delete cascade,
  on_hand int not null default 0,
  low_threshold int not null default 0 check (low_threshold between 0 and 100000),
  avg_cost_paise bigint not null default 0 check (avg_cost_paise >= 0),
  updated_at timestamptz not null default now()
);

create table public.supplier (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 100),
  phone text check (phone ~ '^[6-9][0-9]{9}$'),
  gstin text check (gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.purchase (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier (id),
  invoice_no text check (length(invoice_no) <= 40),
  purchase_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  note text check (length(note) <= 300),
  total_paise bigint not null default 0,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index purchase_date on public.purchase (purchase_date desc);

create table public.purchase_line (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchase (id) on delete cascade,
  variant_id uuid not null references public.variant (id),
  qty int not null check (qty between 1 and 100000),
  cost_paise bigint not null check (cost_paise > 0),  -- per case
  unique (purchase_id, variant_id)
);

create table public.stock_move (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.variant (id) on delete cascade,
  qty int not null check (qty <> 0),                -- + in, - out (cases)
  kind public.stock_move_kind not null,
  reason text check (length(reason) <= 200),
  route_day_plan_id uuid references public.route_day_plan (id),
  purchase_id uuid references public.purchase (id),
  balance_after int not null default 0,
  actor uuid default auth.uid(),
  at timestamptz not null default now()
);
create index stock_move_variant on public.stock_move (variant_id, at desc);
create index stock_move_plan on public.stock_move (route_day_plan_id) where route_day_plan_id is not null;

-- Keep stock.on_hand in step with the ledger.
create function public.stock_move_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock (variant_id, on_hand) values (new.variant_id, new.qty)
  on conflict (variant_id) do update set on_hand = public.stock.on_hand + excluded.on_hand, updated_at = now();
  select on_hand into new.balance_after from public.stock where variant_id = new.variant_id;
  return new;
end $$;
revoke execute on function public.stock_move_apply() from public, anon, authenticated;
create trigger stock_move_apply before insert on public.stock_move for each row execute function public.stock_move_apply();

-- Order flow -> stock.
create function public.plan_stock_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'planning' and new.status = 'loaded' then
    insert into public.stock_move (variant_id, qty, kind, route_day_plan_id)
    select variant_id, -(qty_ordered_total + qty_spare), 'load_out', new.id
      from public.load_line where route_day_plan_id = new.id and qty_ordered_total + qty_spare > 0;
  elsif old.status = 'loaded' and new.status = 'planning' then
    insert into public.stock_move (variant_id, qty, kind, route_day_plan_id)
    select variant_id, -sum(qty)::int, 'load_undo', new.id from public.stock_move
     where route_day_plan_id = new.id and kind in ('load_out', 'load_undo') group by 1 having sum(qty) <> 0;
  elsif new.status = 'closed' and old.status <> 'closed' then
    insert into public.stock_move (variant_id, qty, kind, route_day_plan_id)
    select variant_id, qty_returned, 'return_in', new.id
      from public.load_line where route_day_plan_id = new.id and qty_returned > 0;
  elsif old.status = 'closed' and new.status <> 'closed' then
    insert into public.stock_move (variant_id, qty, kind, route_day_plan_id)
    select variant_id, -sum(qty)::int, 'return_undo', new.id from public.stock_move
     where route_day_plan_id = new.id and kind in ('return_in', 'return_undo') group by 1 having sum(qty) <> 0;
  end if;
  return new;
end $$;
revoke execute on function public.plan_stock_sync() from public, anon, authenticated;
create trigger plan_stock_sync after update of status on public.route_day_plan
  for each row when (old.status is distinct from new.status) execute function public.plan_stock_sync();

-- ---------- RLS: staff read, admin writes (stock changes only through the RPCs below) ----------
alter table public.stock enable row level security;
alter table public.supplier enable row level security;
alter table public.purchase enable row level security;
alter table public.purchase_line enable row level security;
alter table public.stock_move enable row level security;
create policy stock_read on public.stock for select to authenticated using ((select public.is_staff()));
create policy supplier_read on public.supplier for select to authenticated using ((select public.is_staff()));
create policy purchase_read on public.purchase for select to authenticated using ((select public.is_staff()));
create policy purchase_line_read on public.purchase_line for select to authenticated using ((select public.is_staff()));
create policy stock_move_read on public.stock_move for select to authenticated using ((select public.is_staff()));
create policy supplier_write on public.supplier for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.stock, public.purchase, public.purchase_line, public.stock_move to authenticated;
grant select, insert, update on public.supplier to authenticated;
revoke all on public.stock, public.supplier, public.purchase, public.purchase_line, public.stock_move from anon;

-- p_lines: [{"variant_id": uuid, "qty": int, "cost_paise": int}]  cost is per case.
create function public.record_purchase(p_supplier_id uuid, p_invoice_no text, p_date date, p_lines jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; r record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.supplier where id = p_supplier_id) then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or exists (
    select 1 from jsonb_array_elements(p_lines) e left join public.variant v on v.id = (e ->> 'variant_id')::uuid
    where v.id is null or (e ->> 'qty') !~ '^\d{1,5}$' or (e ->> 'qty')::int < 1
       or (e ->> 'cost_paise') !~ '^\d{1,10}$' or (e ->> 'cost_paise')::bigint < 1)
    or (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines)
  then raise exception 'INVALID_INPUT'; end if;
  insert into public.purchase (supplier_id, invoice_no, purchase_date, note)
  values (p_supplier_id, nullif(trim(left(p_invoice_no, 40)), ''), coalesce(p_date, (now() at time zone 'Asia/Kolkata')::date), nullif(trim(left(p_note, 300)), ''))
  returning id into v_id;
  for r in select (e ->> 'variant_id')::uuid variant_id, (e ->> 'qty')::int qty, (e ->> 'cost_paise')::bigint cost
             from jsonb_array_elements(p_lines) e loop
    insert into public.purchase_line (purchase_id, variant_id, qty, cost_paise) values (v_id, r.variant_id, r.qty, r.cost);
    insert into public.stock (variant_id) values (r.variant_id) on conflict do nothing;
    -- Weighted average over stock actually on hand (negative stock counts as zero).
    update public.stock s set avg_cost_paise = round((greatest(s.on_hand, 0) * s.avg_cost_paise + r.qty * r.cost)::numeric / (greatest(s.on_hand, 0) + r.qty))
     where s.variant_id = r.variant_id;
    insert into public.stock_move (variant_id, qty, kind, purchase_id) values (r.variant_id, r.qty, 'purchase', v_id);
  end loop;
  update public.purchase set total_paise = (select sum(qty * cost_paise) from public.purchase_line where purchase_id = v_id) where id = v_id;
  return v_id;
end $$;
revoke execute on function public.record_purchase(uuid, text, date, jsonb, text) from public, anon;
grant execute on function public.record_purchase(uuid, text, date, jsonb, text) to authenticated;

-- Manual correction. p_mode 'count' sets on_hand to p_qty; 'delta' adds p_qty (negative for damage/write-off).
create function public.adjust_stock(p_variant_id uuid, p_mode text, p_qty int, p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_now int; v_delta int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.variant where id = p_variant_id) then raise exception 'NOT_FOUND'; end if;
  if p_mode not in ('count', 'delta') or p_qty is null or abs(p_qty) > 100000 or (p_mode = 'count' and p_qty < 0)
     or length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'INVALID_INPUT'; end if;
  insert into public.stock (variant_id) values (p_variant_id) on conflict do nothing;
  select on_hand into v_now from public.stock where variant_id = p_variant_id for update;
  v_delta := case when p_mode = 'count' then p_qty - v_now else p_qty end;
  if v_delta <> 0 then
    insert into public.stock_move (variant_id, qty, kind, reason) values (p_variant_id, v_delta, 'adjust', trim(left(p_reason, 200)));
  end if;
  return v_now + v_delta;
end $$;
revoke execute on function public.adjust_stock(uuid, text, int, text) from public, anon;
grant execute on function public.adjust_stock(uuid, text, int, text) to authenticated;

create function public.set_stock_threshold(p_variant_id uuid, p_threshold int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_threshold is null or p_threshold not between 0 and 100000 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.variant where id = p_variant_id) then raise exception 'NOT_FOUND'; end if;
  insert into public.stock (variant_id, low_threshold) values (p_variant_id, p_threshold)
  on conflict (variant_id) do update set low_threshold = excluded.low_threshold, updated_at = now();
end $$;
revoke execute on function public.set_stock_threshold(uuid, int) from public, anon;
grant execute on function public.set_stock_threshold(uuid, int) to authenticated;

create trigger supplier_audit after insert or update or delete on public.supplier for each row execute function public.audit_row();
create trigger purchase_audit after insert or update or delete on public.purchase for each row execute function public.audit_row();
create trigger purchase_line_audit after insert or update or delete on public.purchase_line for each row execute function public.audit_row();
create trigger stock_move_audit after insert on public.stock_move for each row execute function public.audit_row();
create trigger stock_threshold_audit after update of low_threshold on public.stock for each row execute function public.audit_row();
