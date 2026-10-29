-- M4: loading sheet. Locking a route-day freezes its orders and records what goes on the truck.

create table public.load_line (
  id uuid primary key default gen_random_uuid(),
  route_day_plan_id uuid not null references public.route_day_plan (id) on delete cascade,
  variant_id uuid not null references public.variant (id),
  qty_ordered_total int not null default 0 check (qty_ordered_total >= 0),
  qty_spare int not null default 0 check (qty_spare between 0 and 999),
  qty_returned int not null default 0 check (qty_returned >= 0),
  unique (route_day_plan_id, variant_id)
);
alter table public.load_line enable row level security;
create policy load_line_read on public.load_line for select to authenticated using ((select public.is_staff()));
grant select on public.load_line to authenticated;
revoke all on public.load_line from anon;

-- Cases ordered per plan and flavour (open + locked orders). Invoker view: RLS of orders applies.
create view public.v_route_load with (security_invoker = true) as
select o.route_day_plan_id, l.variant_id, sum(l.qty_ordered)::int as qty_ordered, count(distinct o.shop_id)::int as shops
from public.orders o join public.order_line l on l.order_id = o.id
where o.status in ('placed', 'locked')
group by 1, 2;
grant select on public.v_route_load to authenticated;

-- p_spares: [{"variant_id": uuid, "qty": int}]
create function public.lock_load(p_plan_id uuid, p_vehicle_id uuid, p_driver_id uuid, p_spares jsonb default '[]')
returns void language plpgsql security definer set search_path = '' as $$
declare v_plan public.route_day_plan;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v_plan from public.route_day_plan where id = p_plan_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_plan.status <> 'planning' then raise exception 'ORDER_LOCKED'; end if;
  if not exists (select 1 from public.vehicle where id = p_vehicle_id and active) then raise exception 'VEHICLE_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where user_id = p_driver_id and role = 'driver' and active) then raise exception 'DRIVER_REQUIRED'; end if;
  if jsonb_typeof(p_spares) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_spares) e left join public.variant v on v.id = (e ->> 'variant_id')::uuid
    where v.id is null or (e ->> 'qty') !~ '^\d{1,3}$') then raise exception 'INVALID_INPUT'; end if;

  -- Freeze orders first so nothing changes between counting and loading.
  update public.orders set status = 'locked', updated_at = now() where route_day_plan_id = p_plan_id and status = 'placed';

  insert into public.load_line (route_day_plan_id, variant_id, qty_ordered_total, qty_spare)
  select p_plan_id, coalesce(o.variant_id, s.variant_id), coalesce(o.qty, 0), coalesce(s.qty, 0)
  from (select l.variant_id, sum(l.qty_ordered)::int qty from public.orders ord join public.order_line l on l.order_id = ord.id
        where ord.route_day_plan_id = p_plan_id and ord.status = 'locked' group by 1) o
  full join (select (e ->> 'variant_id')::uuid variant_id, sum((e ->> 'qty')::int)::int qty from jsonb_array_elements(p_spares) e group by 1) s
    on s.variant_id = o.variant_id
  where coalesce(o.qty, 0) + coalesce(s.qty, 0) > 0;

  update public.route_day_plan set status = 'loaded', vehicle_id = p_vehicle_id, driver_id = p_driver_id where id = p_plan_id;
end $$;
revoke execute on function public.lock_load(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.lock_load(uuid, uuid, uuid, jsonb) to authenticated;

-- Admin-only undo while the truck has not left.
create function public.unlock_load(p_plan_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.route_day_plan where id = p_plan_id and status = 'loaded' for update;
  if not found then raise exception 'ORDER_LOCKED'; end if;
  delete from public.load_line where route_day_plan_id = p_plan_id;
  update public.orders set status = 'placed', updated_at = now() where route_day_plan_id = p_plan_id and status = 'locked';
  update public.route_day_plan set status = 'planning' where id = p_plan_id;
end $$;
revoke execute on function public.unlock_load(uuid) from public, anon;
grant execute on function public.unlock_load(uuid) to authenticated;

create trigger load_line_audit after insert or update or delete on public.load_line for each row execute function public.audit_row();
