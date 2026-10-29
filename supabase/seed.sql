-- Seed: PepsiCo catalogue + price list dated 01-09-2026 (from Shobhit's sheet), routes, vehicles.
-- Idempotent. Ambiguous sheet rows are disambiguated by MRP in the name (PRD Q4).
-- Variant (flavour) mapping is a first guess from the product photo; admin can edit it.

insert into public.brand (name) values ('PepsiCo') on conflict (name) do nothing;

with b as (select id from public.brand where name = 'PepsiCo'),
p(sort, name_en, units, mrp, trade, scheme, stype, returnable) as (values
  (1,  'Slice Tetra 125ml',                40, 10, 315, 0,   'net_rate',    false),
  (2,  'Mix Fruit / Apple / Litchi Tetra 125ml', 40, 10, 300, 100, 'bogo_on_mrp', false),
  (3,  '200ml RGB CSD',                    24, 12, 262, 0,   'net_rate',    true),
  (4,  '200ml RGB Slice',                  24, 14, 266, 0,   'net_rate',    true),
  (5,  'Sting Can 180ml',                  30, 30, 715, 0,   'net_rate',    false),
  (6,  'Ad Rush Can',                      24, 60, 1051, 0,  'net_rate',    false),
  (7,  '300ml Can',                        24, 40, 775, 0,   'net_rate',    false),
  (8,  '330ml Can',                        24, 70, 850, 0,   'net_rate',    false),
  (9,  '300ml Soda',                       24, 10, 195, 0,   'net_rate',    false),
  (10, 'Sting PET 250ml (Red)',            30, 20, 525, 0,   'net_rate',    false),
  (11, 'Slice PET 250ml',                  30, 20, 530, 0,   'net_rate',    false),
  (12, 'Nimbooz 345ml',                    30, 20, 535, 0,   'net_rate',    false),
  (13, '400ml PET All Flavours',           30, 20, 530, 0,   'net_rate',    false),
  (14, 'Slice PET 600ml',                  24, 40, 805, 0,   'net_rate',    false),
  (15, '750ml Soda',                       24, 20, 380, 0,   'net_rate',    false),
  (16, '750ml (MRP 40)',                   24, 40, 820, 0,   'net_rate',    false),
  (17, '750ml (MRP 35)',                   24, 35, 730, 0,   'net_rate',    false),
  (18, '1.25L CSD',                        15, 50, 665, 0,   'net_rate',    false),
  (19, '2.25L All Flavours',               9,  90, 665, 0,   'net_rate',    false),
  (20, 'Slice 1.2L',                       12, 70, 710, 290, 'bogo_on_mrp', false),
  (21, 'Slice 1.75L',                      9,  99, 741, 0,   'net_rate',    false),
  (22, 'Trop PET 180ml',                   30, 20, 535, 0,   'net_rate',    false),
  (23, 'Trop PET 180ml Guava',             30, 20, 520, 220, 'bogo_on_mrp', false),
  (24, 'Trop PET 500ml Mix',               24, 30, 615, 0,   'net_rate',    false),
  (25, 'Trop PET 500ml Guava',             24, 30, 600, 240, 'bogo_on_mrp', false),
  (26, 'Trop PET 1L',                      12, 75, 585, 0,   'net_rate',    false),
  (27, 'VAD (MRP 20)',                     30, 20, 530, 0,   'net_rate',    false),
  (28, 'VAD Rest (MRP 30)',                24, 30, 615, 0,   'net_rate',    false),
  (29, 'Aquafina 250ml',                   30, 7,  180, 0,   'net_rate',    false),
  (30, 'Aquafina 1L',                      12, 20, 140, 5,   'net_rate',    false),
  (31, 'Aquafina 500ml',                   24, 10, 190, 0,   'net_rate',    false),
  (32, 'Gatorade 250ml',                   30, 20, 542, 0,   'net_rate',    false),
  (33, 'Gatorade 500ml',                   24, 50, 1004, 0,  'net_rate',    false),
  (34, 'Tropicana Tetra 180ml',            30, 20, 420, 0,   'net_rate',    false),
  (35, 'Tropicana Tetra 1L (MRP 105)',     12, 105, 907, 0,  'net_rate',    false),
  (36, 'Tropicana Tetra 1L (MRP 115)',     12, 115, 1035, 0, 'net_rate',    false),
  (37, 'Tropicana Tetra 1L (MRP 120)',     12, 120, 1037, 0, 'net_rate',    false),
  (38, 'Tropicana Tetra 1L (MRP 140)',     12, 140, 1210, 0, 'net_rate',    false),
  (39, 'Tropicana Tetra 1L Cranberry',     12, 120, 864, 0,  'net_rate',    false)
),
ins_pack as (
  insert into public.pack (brand_id, name_en, units_per_case, mrp_paise, is_returnable, sort)
  select b.id, p.name_en, p.units, p.mrp * 100, p.returnable, p.sort from p, b
  on conflict (brand_id, name_en) do update set units_per_case = excluded.units_per_case,
    mrp_paise = excluded.mrp_paise, is_returnable = excluded.is_returnable, sort = excluded.sort
  returning id, name_en
),
pl as (
  insert into public.price_list (name, effective_from, status)
  select 'PepsiCo 01-09-2026', date '2026-09-01', 'draft'
  where not exists (select 1 from public.price_list where name = 'PepsiCo 01-09-2026')
  returning id
)
insert into public.price_list_item (price_list_id, pack_id, trade_price_paise, scheme_value_paise, scheme_type)
select pl.id, ip.id, p.trade * 100, p.scheme * 100, p.stype::public.scheme_type
from pl join p on true join ins_pack ip on ip.name_en = p.name_en;

-- Flavours. Multi-flavour packs get one variant per flavour; every other pack gets one variant of the same name.
with f(pack, flavour_en, flavour_hi, sort) as (values
  ('300ml Can', 'Pepsi', 'पेप्सी', 1), ('300ml Can', 'Pepsi Black', 'पेप्सी ब्लैक', 2),
  ('300ml Can', 'Mountain Dew', 'माउंटेन ड्यू', 3), ('300ml Can', '7UP', '7अप', 4), ('300ml Can', 'Mirinda', 'मिरिंडा', 5),
  ('Sting Can 180ml', 'Sting Red', 'स्टिंग रेड', 1), ('Sting Can 180ml', 'Sting Gold', 'स्टिंग गोल्ड', 2),
  ('400ml PET All Flavours', 'Pepsi', 'पेप्सी', 1), ('400ml PET All Flavours', 'Mountain Dew', 'माउंटेन ड्यू', 2),
  ('400ml PET All Flavours', '7UP', '7अप', 3), ('400ml PET All Flavours', 'Mirinda', 'मिरिंडा', 4),
  ('2.25L All Flavours', 'Pepsi', 'पेप्सी', 1), ('2.25L All Flavours', 'Mountain Dew', 'माउंटेन ड्यू', 2),
  ('2.25L All Flavours', '7UP', '7अप', 3), ('2.25L All Flavours', 'Mirinda', 'मिरिंडा', 4),
  ('1.25L CSD', 'Pepsi', 'पेप्सी', 1), ('1.25L CSD', 'Mountain Dew', 'माउंटेन ड्यू', 2),
  ('1.25L CSD', '7UP', '7अप', 3), ('1.25L CSD', 'Mirinda', 'मिरिंडा', 4),
  ('200ml RGB CSD', 'Pepsi', 'पेप्सी', 1), ('200ml RGB CSD', '7UP', '7अप', 2), ('200ml RGB CSD', 'Mirinda', 'मिरिंडा', 3)
)
insert into public.variant (pack_id, flavour_en, flavour_hi, sort)
select pk.id, f.flavour_en, f.flavour_hi, f.sort from f join public.pack pk on pk.name_en = f.pack
on conflict (pack_id, flavour_en) do nothing;

insert into public.variant (pack_id, flavour_en, sort)
select pk.id, pk.name_en, 1 from public.pack pk
where not exists (select 1 from public.variant v where v.pack_id = pk.id)
on conflict (pack_id, flavour_en) do nothing;

-- Routes (ISO weekdays: 1 = Mon) and vehicles. Capacity 100 cases is from the old bot; edit per truck.
insert into public.route (name, visit_days) values
  ('Mon/Thu', '{1,4}'), ('Tue/Fri', '{2,5}'), ('Wed/Sat', '{3,6}')
on conflict (name) do nothing;
insert into public.vehicle (name, capacity_cases) values
  ('Vehicle 1', 100), ('Vehicle 2', 100), ('Vehicle 3', 100), ('Vehicle 4', 100)
on conflict (name) do nothing;

-- Sheet text per pack for import matching (duplicates keyed "name|MRP").
update public.pack p set source_name = m.src from (values
 ('Slice Tetra 125ml','SLICE Tetra 125 ml'),('Mix Fruit / Apple / Litchi Tetra 125ml','MIX FRUIT /Apple/Litchi Tetra 125 ml'),
 ('200ml RGB CSD','200ml - RGB CSD'),('200ml RGB Slice','200ml - RGB SLICE'),('Sting Can 180ml','STING CAN 180ML'),
 ('Ad Rush Can','Ad Rush Cans'),('300ml Can','300ml Can'),('330ml Can','330ml Can'),('300ml Soda','300ml Soda'),
 ('Sting PET 250ml (Red)','250ml STING PET-30bts-RED'),('Slice PET 250ml','250ml Pet Slice'),('Nimbooz 345ml','345ml Nimbooz'),
 ('400ml PET All Flavours','400ml Pet All Flavours'),('Slice PET 600ml','600ml Slice pet ,Mrp 40/-'),('750ml Soda','750ml Soda'),
 ('750ml (MRP 40)','750ml|40'),('750ml (MRP 35)','750ml|35'),('1.25L CSD','1.25 LTR CSD ,Mrp 50'),
 ('2.25L All Flavours','2.25 LTR : All flavours , Mrp 90'),('Slice 1.2L','1.2 LTR SLICE'),('Slice 1.75L','1.75 LTR SLICE'),
 ('Trop PET 180ml','TROP PET-180ml'),('Trop PET 180ml Guava','TROP PET-180ml Guava'),('Trop PET 500ml Mix','TROP PET-500ml Mix'),
 ('Trop PET 500ml Guava','TROP PET-500ml Guava'),('Trop PET 1L','TROP PET-LTR'),('VAD (MRP 20)','VAD'),('VAD Rest (MRP 30)','VAD Rest'),
 ('Aquafina 250ml','Aquafina 250ml'),('Aquafina 1L','Aquafina ltr'),('Aquafina 500ml','Aquafina 500ml'),
 ('Gatorade 250ml','GATORADE 250ML ,MRP 20/-'),('Gatorade 500ml','GATORADE 500ML ,MRP 50/-'),('Tropicana Tetra 180ml','TROPICANA 180ML TETRA'),
 ('Tropicana Tetra 1L (MRP 105)','TROPICANA LTR TETRA|105'),('Tropicana Tetra 1L (MRP 115)','TROPICANA LTR TETRA|115'),
 ('Tropicana Tetra 1L (MRP 120)','TROPICANA LTR TETRA|120'),('Tropicana Tetra 1L (MRP 140)','TROPICANA LTR TETRA|140'),
 ('Tropicana Tetra 1L Cranberry','TROPICANA LTR TETRA CRANBERRY')
) as m(name, src) where p.name_en = m.name and p.source_name is null;
