-- GST bills for counter sales. Prices are GST-inclusive (like the Pepsi invoices), so per line:
--   taxable = round(line total x 10000 / (10000 + rate_bp)),  GST = total - taxable,  CGST = round(GST / 2),  SGST = rest
-- (Durg/Bhilai sales stay inside Chhattisgarh, so always CGST + SGST, never IGST). The bill total never changes.
-- Each line keeps the HSN + rate it was billed at, so a later catalogue change never rewrites an old bill.

alter table public.cash_sale_line add column if not exists hsn text;
alter table public.cash_sale_line add column if not exists gst_rate_bp int check (gst_rate_bp between 0 and 10000);

create or replace function public._cash_sale_line_gst() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' or new.variant_id is distinct from old.variant_id or new.gst_rate_bp is null then
    select p.hsn, p.gst_rate_bp into new.hsn, new.gst_rate_bp
      from public.variant v join public.pack p on p.id = v.pack_id where v.id = new.variant_id;
  end if;
  return new;
end $$;
drop trigger if exists cash_sale_line_gst on public.cash_sale_line;
create trigger cash_sale_line_gst before insert or update on public.cash_sale_line
  for each row execute function public._cash_sale_line_gst();
update public.cash_sale_line l set hsn = p.hsn, gst_rate_bp = p.gst_rate_bp
  from public.variant v join public.pack p on p.id = v.pack_id where v.id = l.variant_id and l.gst_rate_bp is null;

/** Everything needed to print one bill. Margin is NOT included (bills go to shops). */
create or replace function public._bill(p_id uuid) returns jsonb
language sql stable security definer set search_path to '' as $$
  with c as (select * from public.cash_sale where id = p_id),
  l as (
    select l.id, l.qty, l.price_paise, l.hsn, coalesce(l.gst_rate_bp, 0) rate,
           case when v.flavour_en = p.name_en then p.name_en else p.name_en || ' (' || v.flavour_en || ')' end item,
           l.qty * l.price_paise total
      from public.cash_sale_line l join public.variant v on v.id = l.variant_id join public.pack p on p.id = v.pack_id
     where l.cash_sale_id = p_id),
  t as (select l.*, round(l.total * 10000.0 / (10000 + l.rate))::bigint taxable from l),
  g as (select t.*, t.total - t.taxable gst, round((t.total - t.taxable) / 2.0)::bigint cgst from t)
  select case when not exists (select 1 from c) then null else jsonb_build_object(
    'id', c.id, 'number', c.number, 'at', c.created_at, 'mode', c.payment_mode, 'total_paise', c.total_paise,
    'voided', c.voided_at is not null, 'void_reason', c.void_reason,
    'seller', (select jsonb_build_object('name', s.business_name, 'legal_name', s.legal_name, 'gstin', s.business_gstin,
                 'address', s.business_address, 'phone', s.business_phone, 'state_code', s.state_code, 'state', s.state_name)
                 from public.settings s limit 1),
    'buyer', (select jsonb_build_object('name', sh.name, 'owner', sh.owner_name, 'phone', sh.phone, 'address', sh.address,
                 'locality', sh.locality, 'gstin', sh.gstin) from public.shop sh where sh.id = c.shop_id),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('item', g.item, 'hsn', g.hsn, 'rate_bp', g.rate, 'qty', g.qty,
                 'price_paise', g.price_paise, 'total_paise', g.total, 'taxable_paise', g.taxable,
                 'cgst_paise', g.cgst, 'sgst_paise', g.gst - g.cgst) order by g.id) from g), '[]'::jsonb),
    'taxable_paise', coalesce((select sum(taxable) from g), 0),
    'cgst_paise', coalesce((select sum(cgst) from g), 0),
    'sgst_paise', coalesce((select sum(gst - cgst) from g), 0),
    'missing_gst', exists (select 1 from l where l.hsn is null))
  end from (select 1) one left join c on true
$$;
revoke all on function public._bill(uuid) from public, anon, authenticated;
grant execute on function public._bill(uuid) to service_role;

create or replace function public.bill_data(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return public._bill(p_id);
end $$;
revoke all on function public.bill_data(uuid) from public, anon;
grant execute on function public.bill_data(uuid) to authenticated;

create or replace function public.bot_bill(p_key text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  return public._bill(p_id);
end $$;
revoke all on function public.bot_bill(text, uuid) from public;
grant execute on function public.bot_bill(text, uuid) to anon, authenticated;

-- Telegram needs the bill id to send the PDF: return it from the sale RPC (new sale and double tap alike).
create or replace function public.bot_record_sale_into(p_key text, p_action uuid, p_shop uuid, p_lines jsonb, p_mode text, p_by text, p_account uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; v_id uuid;
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  perform public._money_check(p_account);
  r := public.bot_record_sale(p_key, p_action, p_shop, p_lines, p_mode, p_by);
  select id into v_id from public.cash_sale where action_id = p_action;
  r := r || jsonb_build_object('id', v_id);
  if coalesce((r->>'repeat')::boolean, false) or p_account is null then return r; end if;
  perform public._set_payment_account('counter_sale', v_id, p_account, null);
  return r || jsonb_build_object('account', (select name from public.money_account where id = p_account));
end $$;

-- Admin: business details printed on every bill (GSTIN can be added later; until then bills say "GSTIN to be added").
create or replace function public.settings_get() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return (select to_jsonb(s) - 'id' from public.settings s limit 1);
end $$;
create or replace function public.settings_save(p_business_name text, p_legal_name text, p_gstin text, p_address text, p_phone text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_before jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  p_gstin := nullif(upper(regexp_replace(coalesce(p_gstin, ''), '\s', '', 'g')), '');
  if p_gstin is not null and p_gstin !~ '^22[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then raise exception 'BAD_GSTIN'; end if;
  if coalesce(length(trim(p_business_name)), 0) < 2 then raise exception 'INVALID_INPUT'; end if;
  select to_jsonb(s) into v_before from public.settings s limit 1;
  update public.settings set business_name = trim(p_business_name), legal_name = nullif(trim(p_legal_name), ''), business_gstin = p_gstin,
    business_address = nullif(trim(p_address), ''), business_phone = nullif(trim(p_phone), ''), updated_at = now() where id;
  insert into public.audit_log (actor, table_name, row_id, action, before, after)
  values (auth.uid(), 'settings', 'bill', 'update', v_before,
          jsonb_build_object('business_name', p_business_name, 'legal_name', p_legal_name, 'gstin', p_gstin, 'address', p_address, 'phone', p_phone));
end $$;
revoke all on function public.settings_get(), public.settings_save(text, text, text, text, text) from public, anon;
grant execute on function public.settings_get(), public.settings_save(text, text, text, text, text) to authenticated;
