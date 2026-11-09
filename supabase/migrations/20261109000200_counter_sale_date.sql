-- Counter sale date (owner, 9 Nov): a bill can be entered or moved to an earlier day (old parchis typed in later).
-- counter_sale_save_dated = counter_sale_save_into (same checks, stock and paid-into account) + the bill's day, in one transaction.
--   p_day null, or the day the bill already has  -> date untouched (a new bill keeps now()).
--   any other day -> created_at moves to that day, keeping its time of day (IST), so reports, the day table,
--   month totals, margin and the Telegram hisaab all count it on that day (they all key off cash_sale.created_at).
-- Rules: not in the future, not more than a year back, and a truck bill always stays on its trip's day.
-- The cash_sale audit trigger keeps the old created_at, so a wrong date can always be traced and put back.
create or replace function public.counter_sale_save_dated(
  p_id uuid, p_action uuid, p_shop uuid, p_mode text, p_lines jsonb, p_account uuid,
  p_discount bigint default 0, p_plan uuid default null, p_day date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; v_id uuid; v_at timestamptz; v_plan uuid; v_plan_day date;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_day is not null and p_day > v_today then raise exception 'DATE_IN_FUTURE'; end if;
  if p_day is not null and p_day < v_today - 366 then raise exception 'DATE_TOO_OLD'; end if;
  -- a truck bill belongs to its trip's day (new: the plan passed in; edit: the plan already on the bill)
  v_plan := coalesce(p_plan, (select route_day_plan_id from public.cash_sale where id = p_id));
  if v_plan is not null and p_day is not null then
    select date into v_plan_day from public.route_day_plan where id = v_plan;
    if p_day <> v_plan_day then raise exception 'TRUCK_BILL_DATE'; end if;
  end if;

  r := public.counter_sale_save_into(p_id, p_action, p_shop, p_mode, p_lines, p_account, p_discount, p_plan);
  v_id := (r ->> 'id')::uuid;

  select created_at into v_at from public.cash_sale where id = v_id;
  if p_day is not null and (v_at at time zone 'Asia/Kolkata')::date <> p_day then
    update public.cash_sale
       set created_at = ((p_day + (v_at at time zone 'Asia/Kolkata')::time) at time zone 'Asia/Kolkata')
     where id = v_id;
  end if;
  return r || jsonb_build_object('day', ((select created_at from public.cash_sale where id = v_id) at time zone 'Asia/Kolkata')::date);
end $$;

revoke all on function public.counter_sale_save_dated(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid, date) from public, anon;
grant execute on function public.counter_sale_save_dated(uuid, uuid, uuid, text, jsonb, uuid, bigint, uuid, date) to authenticated;
