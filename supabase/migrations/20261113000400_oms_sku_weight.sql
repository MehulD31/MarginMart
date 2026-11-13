-- Pepsi portal: weight of one case in kg (gross_weight in the SKU master). Used to show how full an 8,000 kg truck an order is.
alter table public.oms_sku add column if not exists gross_weight_kg numeric;
