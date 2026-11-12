-- Deleting a purchase must undo its effect on the average cost (owner, 12 Nov 2026).
-- Before: record_purchase blended each purchase into stock.avg_cost_paise, but admin_delete('purchase') only took the
-- cases out again, so the average stayed blended. A test that adds and deletes 1 case of Sting at ₹400 ran 14 times and
-- pulled Sting's average from ₹483 to ₹481.23; bills then saved that wrong cost.
-- Fix: when a purchase line is deleted (admin_delete cascades purchase -> purchase_line after taking its cases out of
-- stock), remove its cases from the average: avg_before = ((left + qty) * avg - qty * cost) / left.
create or replace function public._purchase_line_unblend() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.stock s
     set avg_cost_paise = case
       when s.on_hand > 0 then greatest(round(((s.on_hand + old.qty)::numeric * s.avg_cost_paise - old.qty::numeric * old.cost_paise) / s.on_hand), 0)
       else s.avg_cost_paise end
   where s.variant_id = old.variant_id;
  return old;
end $$;

drop trigger if exists purchase_line_unblend on public.purchase_line;
create trigger purchase_line_unblend after delete on public.purchase_line for each row execute function public._purchase_line_unblend();

-- One-off repair: Sting PET 250ml (Red) has a single real purchase (719 cases @ ₹483, 4 Nov) and nothing else.
update public.stock s set avg_cost_paise = 48300
  from public.variant v join public.pack p on p.id = v.pack_id
 where s.variant_id = v.id and v.flavour_en = 'Sting PET 250ml (Red)' and p.name_en ilike 'Sting PET 250ml%' and s.avg_cost_paise <> 48300;
