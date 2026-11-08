-- GST data per counter-sale line (kept for "real margin after GST" and the accountant's reports; no bill PDF in the app).
-- Each line keeps the HSN + GST rate it was sold at, so a later catalogue change never rewrites an old sale.

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

-- The Telegram sale RPC also returns the bill id (harmless; used by tests and future features).
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

-- Bill PDF functions (bill_data, bot_bill, _bill, settings_get, settings_save) were added and then removed on the
-- owner's request: no invoice feature in the app or Telegram.
drop function if exists public.bill_data(uuid);
drop function if exists public.bot_bill(text, uuid);
drop function if exists public._bill(uuid);
drop function if exists public.settings_get();
drop function if exists public.settings_save(text, text, text, text, text);
