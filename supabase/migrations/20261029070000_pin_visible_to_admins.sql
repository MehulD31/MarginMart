-- Owner decision (2026-10-29): admins can see PINs. Stored apart from profiles, readable only by the
-- service role (admin-users Edge Function, action view_pin). Every view is written to audit_log.
create table public.pin_record (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin text not null check (pin ~ '^\d{6}$'),
  set_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
alter table public.pin_record enable row level security;
revoke all on public.pin_record from anon, authenticated;
