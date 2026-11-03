-- Catalogue updates for the 3 Nov Pepsi invoice: flavours split per invoice line, plus Creambell Kesar Badam.
-- (Flavour ids are generated; this mirrors what was applied on the live DB.)

-- Pepsi Black on 400ml PET
insert into public.variant (pack_id, flavour_en, flavour_hi, sort)
select id, 'Pepsi Black', 'पेप्सी ब्लैक', 5 from public.pack where name_en = '400ml PET All Flavours'
on conflict (pack_id, flavour_en) do nothing;

-- 330ml Can: replace the generic flavour with Pepsi + Pepsi Black
delete from public.variant v using public.pack p
 where v.pack_id = p.id and p.name_en = '330ml Can' and v.flavour_en = '330ml Can'
   and not exists (select 1 from public.order_line ol where ol.variant_id = v.id)
   and not exists (select 1 from public.load_line ll where ll.variant_id = v.id)
   and not exists (select 1 from public.stock_move sm where sm.variant_id = v.id);
insert into public.variant (pack_id, flavour_en, flavour_hi, sort)
select p.id, f, h, s from public.pack p, (values ('Pepsi','पेप्सी',1), ('Pepsi Black','पेप्सी ब्लैक',2)) x(f,h,s)
where p.name_en = '330ml Can' on conflict (pack_id, flavour_en) do nothing;

-- 750ml (MRP 40): Mirinda, Mountain Dew, Pepsi
delete from public.variant v using public.pack p
 where v.pack_id = p.id and p.name_en = '750ml (MRP 40)' and v.flavour_en = '750ml (MRP 40)'
   and not exists (select 1 from public.order_line ol where ol.variant_id = v.id)
   and not exists (select 1 from public.load_line ll where ll.variant_id = v.id)
   and not exists (select 1 from public.stock_move sm where sm.variant_id = v.id);
insert into public.variant (pack_id, flavour_en, flavour_hi, sort)
select p.id, f, h, s from public.pack p, (values ('Mirinda','मिरिंडा',1), ('Mountain Dew','माउंटेन ड्यू',2), ('Pepsi','पेप्सी',3)) x(f,h,s)
where p.name_en = '750ml (MRP 40)' on conflict (pack_id, flavour_en) do nothing;

-- Creambell Kesar Badam 180ml (30/case, MRP 20), trade price 539/case
insert into public.pack (brand_id, name_en, name_hi, units_per_case, mrp_paise, sort)
select id, 'Creambell Kesar Badam 180ml', 'क्रीमबेल केसर बादाम 180ml', 30, 2000, 100
from public.brand where name = 'Creambell' on conflict (brand_id, name_en) do nothing;
insert into public.variant (pack_id, flavour_en, flavour_hi, sort)
select id, 'Kesar Badam', 'केसर बादाम', 1 from public.pack where name_en = 'Creambell Kesar Badam 180ml'
on conflict (pack_id, flavour_en) do nothing;
insert into public.price_list_item (price_list_id, pack_id, trade_price_paise)
select (select id from public.price_list where status = 'active'), id, 53900
from public.pack where name_en = 'Creambell Kesar Badam 180ml' on conflict (price_list_id, pack_id) do nothing;

-- Assumed margin for items with no recorded cost: 35 -> 32 (3 Nov invoice average).
update public.business_settings set default_margin_paise = 3200 where id = 1;
