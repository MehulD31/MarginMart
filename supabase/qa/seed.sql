-- QA persona-review seed (docs/REVIEW-PERSONAS.md). TEST DATA ONLY.
-- Creates the fixed QA accounts (90000001xx, PIN 482915) and the two QA shops the
-- Playwright review suite (tests/review/*) logs in with. Idempotent: safe to re-run.
--
-- Auth model (HLD D8, supabase/functions/_shared/pin.ts): the GoTrue password is
-- HMAC-SHA256(pepper, "<phone>:<pin>") hex-encoded, then bcrypt-hashed. We reproduce that
-- here in pure SQL using the pepper from Vault (public.get_pin_pepper), extensions.hmac and
-- extensions.crypt, so a QA user created by this script logs in through the real pin-login
-- Edge Function exactly like a user created by admin-users.
--
-- Run as the postgres owner (SQL editor or MCP apply_migration). Must run AFTER supabase/seed.sql
-- (it needs the Mon/Thu route to exist) and AFTER the pin_pepper secret is in Vault.
--
-- Tear everything down again with supabase/qa/teardown.sql. NEVER run against pilot data:
-- the real admins (8871565551 Mehul, 9630012636 Shobhit), shop "Shobh", and the three real
-- routes are untouched by this script and MUST stay untouched by teardown.

-- ---------- _qa_make_user: create a loginable QA user with PIN 482915 ----------
create or replace function public._qa_make_user(
  p_phone text,
  p_role public.user_role,
  p_name text,
  p_shop_id uuid default null,
  p_must_change boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pepper text := public.get_pin_pepper();
  v_pw     text := encode(extensions.hmac(p_phone || ':482915', v_pepper, 'sha256'), 'hex');
  v_uid    uuid := gen_random_uuid();
  v_email  text := p_phone || '@login.marginmart.app';
begin
  if v_pepper is null or length(v_pepper) < 32 then
    raise exception 'pin_pepper missing from Vault; run supabase/migrations/20261029020000_m1_pin_pepper_vault.sql first';
  end if;
  -- Idempotent: drop any prior QA user with this email (cascades to profiles/pin_record).
  delete from auth.users where email = v_email;
  -- GoTrue's Go driver cannot scan NULL token columns, so seed them as empty strings.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_uid::text, v_uid, jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());
  insert into public.profiles (user_id, role, name, phone, shop_id, must_change_pin)
  values (v_uid, p_role, p_name, p_phone, p_shop_id, p_must_change);
  insert into public.pin_record (user_id, pin, set_by)
  values (v_uid, '482915', null)
  on conflict (user_id) do update set pin = excluded.pin, updated_at = now();
  return v_uid;
end $$;
revoke execute on function public._qa_make_user(text, public.user_role, text, uuid, boolean) from public, anon, authenticated;

-- ---------- QA shops ----------
-- Teardown keys off phone 9000000150/9000000151 OR name like 'QA Stop %'. Both QA shops sit on
-- the Mon/Thu route so loading.spec / ordering.spec find them. QA Shop One is the logged-in shop;
-- QA Shop Two is the first-login (must-change-PIN) shop and the "other shop" in RLS checks.
insert into public.shop (name, phone, route_id, stop_seq, owner_name)
select 'QA Shop One', '9000000150', r.id, 1, 'QA Owner' from public.route r where r.name = 'Mon/Thu'
on conflict do nothing;
insert into public.shop (name, phone, route_id, stop_seq, owner_name)
select 'QA Shop Two', '9000000151', r.id, 2, 'QA Owner Two' from public.route r where r.name = 'Mon/Thu'
on conflict do nothing;

-- ---------- QA accounts (PIN 482915) ----------
do $$
declare
  v_shop1 uuid := (select id from public.shop where phone = '9000000150');
  v_shop2 uuid := (select id from public.shop where phone = '9000000151');
begin
  perform public._qa_make_user('9000000101', 'admin',   'QA Admin',     null,    false);
  perform public._qa_make_user('9000000102', 'manager', 'QA Manager',   null,    false);
  perform public._qa_make_user('9000000103', 'driver',  'QA Driver',    null,    false);
  perform public._qa_make_user('9000000104', 'shop',    'QA Owner',     v_shop1, false);
  perform public._qa_make_user('9000000105', 'shop',    'QA Owner Two', v_shop2, true);
end $$;
