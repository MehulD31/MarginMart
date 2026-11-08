-- HSN code + GST rate per pack, read from the Varun Beverages tax invoices RV0001603316 and RV0001603319 (4 Nov 2026).
-- Rates are in basis points (4000 = 40%). Packs that are not on those invoices (Tropicana, Gatorade, Ad Rush, VAD,
-- Mix Fruit tetra) are left unset on purpose: fill them from their first Pepsi invoice in Catalogue, never guess.
update public.pack set hsn = '22021010', gst_rate_bp = 4000
 where name_en in ('1.25L CSD', '2.25L All Flavours', '200ml RGB CSD', '300ml Can', '330ml Can', '400ml PET All Flavours', '750ml (MRP 35)', '750ml (MRP 40)');
update public.pack set hsn = '22029999', gst_rate_bp = 4000 where name_en in ('Sting PET 250ml (Red)', 'Sting Can 180ml');
update public.pack set hsn = '22029929', gst_rate_bp = 500
 where name_en in ('Nimbooz 345ml', 'Slice PET 250ml', 'Slice PET 600ml', 'Slice Tetra 125ml', 'Slice 1.2L', 'Slice 1.75L', '200ml RGB Slice');
update public.pack set hsn = '22029939', gst_rate_bp = 500 where name_en in ('Creambell Kesar Badam 180ml', 'Creambell Milk 180ml');
update public.pack set hsn = '22011010', gst_rate_bp = 500 where name_en in ('Aquafina 1L', 'Aquafina 250ml', 'Aquafina 500ml');
update public.pack set hsn = '22011020', gst_rate_bp = 500 where name_en in ('300ml Soda', '750ml Soda');

-- Bill header. Legal name + address as printed on the Pepsi invoices (buyer). GSTIN stays empty until the owner enters
-- the real one in Admin -> Settings; until then bills print "GSTIN: to be added" and are titled "Bill of Supply".
alter table public.settings add column if not exists legal_name text;
alter table public.settings add column if not exists business_phone text;
alter table public.settings add column if not exists state_code text not null default '22';
alter table public.settings add column if not exists state_name text not null default 'Chhattisgarh';
insert into public.settings (id, business_name, legal_name, business_gstin, business_address, business_phone, invoice_prefix)
values (true, 'K.D. Foods', 'Fortifit Nutrition Private Limited', null,
        'Plot No 10/C-1, Heavy Industrial Area, Bhilai, Dist. Durg, Chhattisgarh 490026', '96300 12636', 'KD')
on conflict (id) do update set business_name = excluded.business_name, legal_name = excluded.legal_name,
  business_address = excluded.business_address, business_phone = excluded.business_phone;