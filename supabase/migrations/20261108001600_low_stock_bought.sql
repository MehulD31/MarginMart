-- Low stock only for items we have bought (applied live as low_stock_only_bought + low_stock_smart_speed).
-- Low = below zero, or it sells and runs out within 3 days at its real selling speed, or it sells and is at its alert level.
-- Bought-but-never-sold items are slow stock (dashboard), not low stock. Never-bought catalogue items are ignored.
create or replace function public._bought_items() returns table(variant_id uuid)
language sql stable security definer set search_path to '' as $$
  select distinct m.variant_id from public.stock_move m where m.kind = 'purchase'
$$;
revoke all on function public._bought_items() from public, anon, authenticated;

create or replace function public._stock_watch() returns table(variant_id uuid, on_hand int, low_threshold int, per_day numeric, days_left numeric, low boolean)
language sql stable security definer set search_path to '' as $$
  with x as (
      select l.variant_id, l.qty q, s.created_at at_ from public.cash_sale_line l join public.cash_sale s on s.id = l.cash_sale_id
       where s.voided_at is null and s.created_at >= now() - interval '30 days'
      union all
      select d.variant_id, d.qty_delivered, i.created_at from public.delivery_line d join public.invoice i on i.id = d.invoice_id
       where coalesce(i.status, '') <> 'void' and i.created_at >= now() - interval '30 days'),
  span as (select greatest(1, least(30, (now() at time zone 'Asia/Kolkata')::date - (min(at_) at time zone 'Asia/Kolkata')::date + 1)) d from x),
  sold as (select x.variant_id, sum(x.q)::numeric / (select d from span) per_day from x group by 1)
  select s.variant_id, s.on_hand, s.low_threshold, round(coalesce(sd.per_day, 0), 1),
         case when coalesce(sd.per_day, 0) > 0 then round(greatest(s.on_hand, 0) / sd.per_day, 1) end,
         s.on_hand < 0
           or (coalesce(sd.per_day, 0) > 0 and (s.on_hand / sd.per_day <= 3 or (s.low_threshold > 0 and s.on_hand <= s.low_threshold)))
    from public.stock s join public._bought_items() b on b.variant_id = s.variant_id
    join public.variant v on v.id = s.variant_id join public.pack p on p.id = v.pack_id
    left join sold sd on sd.variant_id = s.variant_id
   where v.active and p.active
$$;
revoke all on function public._stock_watch() from public, anon, authenticated;

create or replace function public.stock_watch() returns setof jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return query select to_jsonb(w) from public._stock_watch() w;
end $$;
revoke all on function public.stock_watch() from public, anon;
grant execute on function public.stock_watch() to authenticated;

-- bot_stock and ops_reorder were also changed to use only bought items (see the live migration low_stock_only_bought).
