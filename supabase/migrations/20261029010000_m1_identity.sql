-- M1: identity, roles, join requests, settings, audit log, login attempts.
-- Login model (HLD D8): phone + 6-digit PIN. The auth password is HMAC(pepper, phone:pin),
-- computed only inside the pin-login / admin-users Edge Functions, so GoTrue can't be
-- brute-forced directly and lockout is enforced server-side.

create type public.user_role as enum ('admin', 'manager', 'driver', 'shop');
create type public.join_status as enum ('pending', 'approved', 'rejected');

-- ---------- profiles ----------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  name text not null check (length(trim(name)) between 1 and 100),
  phone text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  shop_id uuid,      -- FK to shop added in M2
  vehicle_id uuid,   -- FK to vehicle added in M2
  active boolean not null default true,
  must_change_pin boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

-- ---------- helpers (security definer so policies don't recurse into profiles RLS) ----------
create function public.auth_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where user_id = auth.uid() and active
$$;

create function public.auth_shop_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select shop_id from public.profiles where user_id = auth.uid() and active
$$;

create function public.auth_vehicle_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select vehicle_id from public.profiles where user_id = auth.uid() and active
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_role() in ('admin', 'manager'), false)
$$;

revoke execute on function public.auth_role(), public.auth_shop_id(), public.auth_vehicle_id(),
  public.is_admin(), public.is_staff() from public, anon;
grant execute on function public.auth_role(), public.auth_shop_id(), public.auth_vehicle_id(),
  public.is_admin(), public.is_staff() to authenticated;

alter table public.profiles enable row level security;
-- Reads only. All writes go through the admin-users Edge Function (service role).
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- ---------- settings (singleton) ----------
create table public.settings (
  id boolean primary key default true check (id),
  business_name text not null default 'MarginMart',
  business_gstin text,
  business_address text,
  cutoff_time time not null default '23:59',
  default_credit_days int not null default 7 check (default_credit_days between 0 and 90),
  crate_deposit_paise bigint not null default 0 check (crate_deposit_paise >= 0),
  bottle_deposit_paise bigint not null default 0 check (bottle_deposit_paise >= 0),
  invoice_prefix text not null default 'MM',
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

alter table public.settings enable row level security;
create policy settings_select on public.settings for select to authenticated using (true);
create policy settings_update on public.settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, update on public.settings to authenticated;

-- ---------- join requests ----------
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  shop_name text not null check (length(trim(shop_name)) between 1 and 100),
  owner_name text not null check (length(trim(owner_name)) between 1 and 100),
  address text not null check (length(trim(address)) between 1 and 300),
  status public.join_status not null default 'pending',
  review_note text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index join_requests_one_pending_per_phone on public.join_requests (phone) where status = 'pending';

alter table public.join_requests enable row level security;
create policy join_requests_select on public.join_requests for select to authenticated
  using ((select public.is_staff()));
grant select on public.join_requests to authenticated;

-- Public (no login) submission, rate limited.
create function public.submit_join_request(p_phone text, p_shop_name text, p_owner_name text, p_address text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if exists (select 1 from public.profiles where phone = v_phone) then raise exception 'ALREADY_REGISTERED'; end if;
  if exists (select 1 from public.join_requests where phone = v_phone and status = 'pending') then
    raise exception 'ALREADY_PENDING';
  end if;
  if (select count(*) from public.join_requests where created_at > now() - interval '1 day') >= 50 then
    raise exception 'RATE_LIMITED';
  end if;
  insert into public.join_requests (phone, shop_name, owner_name, address)
  values (v_phone, trim(p_shop_name), trim(p_owner_name), trim(p_address));
end $$;
revoke execute on function public.submit_join_request(text, text, text, text) from public;
grant execute on function public.submit_join_request(text, text, text, text) to anon, authenticated;

-- Approve/reject. Creating the shop + login from an approved request comes in M2.
create function public.review_join_request(p_id uuid, p_status public.join_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if p_status = 'pending' then raise exception 'INVALID_STATUS'; end if;
  update public.join_requests
     set status = p_status, review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke execute on function public.review_join_request(uuid, public.join_status, text) from public, anon;
grant execute on function public.review_join_request(uuid, public.join_status, text) to authenticated;

-- ---------- login attempts (service role only) ----------
create table public.login_attempts (
  id bigint generated always as identity primary key,
  phone text not null,
  success boolean not null,
  at timestamptz not null default now()
);
create index login_attempts_phone_at on public.login_attempts (phone, at desc);
alter table public.login_attempts enable row level security; -- no policies: only service role

-- ---------- audit log ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  table_name text not null,
  row_id text,
  action text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_at on public.audit_log (at desc);
alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select to authenticated using ((select public.is_staff()));
grant select on public.audit_log to authenticated;

create function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (actor, table_name, row_id, action, before, after)
  values (auth.uid(), tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'user_id'),
          lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger settings_audit after update on public.settings
  for each row execute function public.audit_row();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
create trigger join_requests_audit after update on public.join_requests
  for each row execute function public.audit_row();

-- Lock down defaults: tables are reachable only through the grants above.
revoke all on public.profiles, public.join_requests, public.login_attempts, public.audit_log from anon;
revoke insert, update, delete on public.profiles, public.join_requests, public.audit_log from authenticated;
grant select on public.profiles to authenticated;
