-- M6: end of day. The driver counts what came back and the cash in hand; the server compares both with
-- what it expected and records the differences. The manager then confirms the cash received.

create table public.cash_handover (
  route_day_plan_id uuid primary key references public.route_day_plan (id),
  expected_cash_paise bigint not null,
  expected_upi_paise bigint not null,
  handed_cash_paise bigint not null check (handed_cash_paise >= 0),
  stock_diff jsonb not null default '[]',      -- [{variant_id, expected, returned}] where they differ
  note text check (length(note) <= 300),
  closed_by uuid references auth.users (id),
  closed_at timestamptz not null default now(),
  received_paise bigint check (received_paise >= 0),
  received_by uuid references auth.users (id),
  received_at timestamptz
);
alter table public.cash_handover enable row level security;
create policy cash_handover_read on public.cash_handover for select to authenticated using ((select public.is_staff()));
grant select on public.cash_handover to authenticated;
revoke all on public.cash_handover from anon;
revoke insert, update, delete on public.cash_handover from authenticated;
create trigger cash_handover_audit after insert or update on public.cash_handover for each row execute function public.audit_row();

-- What should be on the truck now, per flavour: loaded − delivered.
create function public.expected_returns(p_plan_id uuid)
returns table (variant_id uuid, loaded int, delivered int, expected int)
language sql stable security definer set search_path = '' as $$
  select ll.variant_id, (ll.qty_ordered_total + ll.qty_spare)::int,
         coalesce(d.qty, 0)::int, (ll.qty_ordered_total + ll.qty_spare - coalesce(d.qty, 0))::int
  from public.load_line ll
  left join (select dl.variant_id, sum(dl.qty_delivered) qty from public.delivery_line dl
             join public.orders o on o.id = dl.order_id where o.route_day_plan_id = p_plan_id group by 1) d on d.variant_id = ll.variant_id
  where ll.route_day_plan_id = p_plan_id
$$;
revoke execute on function public.expected_returns(uuid) from public, anon;
grant execute on function public.expected_returns(uuid) to authenticated;

-- p_returned: [{"variant_id", "qty"}] for every flavour counted back at the warehouse.
create function public.close_day(p_action_id uuid, p_plan_id uuid, p_returned jsonb, p_cash_handed_paise bigint, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_done jsonb; v_plan public.route_day_plan; v_cash bigint; v_upi bigint; v_diff jsonb;
begin
  select result into v_done from public.client_action where id = p_action_id;
  if found then return v_done; end if;
  select * into v_plan from public.route_day_plan where id = p_plan_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or (v_plan.driver_id = auth.uid() and p_plan_id in (select public.driver_plan_ids()))) then raise exception 'FORBIDDEN'; end if;
  if v_plan.status not in ('loaded', 'out') then raise exception 'PLAN_NOT_OUT'; end if;
  if p_cash_handed_paise is null or p_cash_handed_paise < 0 or p_cash_handed_paise > 100000000 then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(p_returned) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_returned) e
    where (e ->> 'qty') !~ '^\d{1,4}$' or not exists (select 1 from public.load_line ll where ll.route_day_plan_id = p_plan_id and ll.variant_id = (e ->> 'variant_id')::uuid))
  then raise exception 'INVALID_INPUT'; end if;

  -- Flavours not listed are taken as "nothing came back".
  update public.load_line ll set qty_returned = coalesce((select (e ->> 'qty')::int from jsonb_array_elements(p_returned) e where (e ->> 'variant_id')::uuid = ll.variant_id), 0)
   where ll.route_day_plan_id = p_plan_id;

  select coalesce(jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'expected', x.expected, 'returned', ll.qty_returned)), '[]')
    into v_diff from public.expected_returns(p_plan_id) x join public.load_line ll on ll.route_day_plan_id = p_plan_id and ll.variant_id = x.variant_id
   where ll.qty_returned <> x.expected;
  select coalesce(-sum(amount_paise) filter (where payment_mode = 'cash'), 0), coalesce(-sum(amount_paise) filter (where payment_mode = 'upi'), 0)
    into v_cash, v_upi from public.ledger_entry where route_day_plan_id = p_plan_id and type = 'payment';

  insert into public.cash_handover (route_day_plan_id, expected_cash_paise, expected_upi_paise, handed_cash_paise, stock_diff, note, closed_by)
  values (p_plan_id, v_cash, v_upi, p_cash_handed_paise, v_diff, left(p_note, 300), auth.uid());
  -- Orders still on the truck were not delivered.
  update public.orders set status = 'cancelled', cancel_reason = 'not delivered (day closed)', updated_at = now()
   where route_day_plan_id = p_plan_id and status = 'locked';
  update public.route_day_plan set status = 'closed' where id = p_plan_id;

  v_done := jsonb_build_object('expected_cash_paise', v_cash, 'expected_upi_paise', v_upi, 'handed_cash_paise', p_cash_handed_paise,
                               'cash_diff_paise', p_cash_handed_paise - v_cash, 'stock_diff', v_diff);
  insert into public.client_action (id, kind, result) values (p_action_id, 'close_day', v_done);
  return v_done;
end $$;
revoke execute on function public.close_day(uuid, uuid, jsonb, bigint, text) from public, anon;
grant execute on function public.close_day(uuid, uuid, jsonb, bigint, text) to authenticated;

create function public.confirm_handover(p_plan_id uuid, p_received_paise bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_received_paise is null or p_received_paise < 0 then raise exception 'INVALID_INPUT'; end if;
  update public.cash_handover set received_paise = p_received_paise, received_by = auth.uid(), received_at = now()
   where route_day_plan_id = p_plan_id and received_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke execute on function public.confirm_handover(uuid, bigint) from public, anon;
grant execute on function public.confirm_handover(uuid, bigint) to authenticated;

-- Admin only: reopen a closed day (e.g. a delivery was forgotten). The handover stays in the audit log.
create function public.reopen_day(p_plan_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.route_day_plan set status = 'out' where id = p_plan_id and status = 'closed';
  if not found then raise exception 'NOT_FOUND'; end if;
  delete from public.cash_handover where route_day_plan_id = p_plan_id;
  update public.orders set status = 'locked', cancel_reason = null, updated_at = now()
   where route_day_plan_id = p_plan_id and status = 'cancelled' and cancel_reason = 'not delivered (day closed)';
end $$;
revoke execute on function public.reopen_day(uuid) from public, anon;
grant execute on function public.reopen_day(uuid) to authenticated;
create trigger cash_handover_audit_del after delete on public.cash_handover for each row execute function public.audit_row();

-- Drivers can see their day's expected returns until they close it (driver_plan_ids covers loaded/out only).
