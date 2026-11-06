-- Time-limited schemes (e.g. Pepsi "400 ml pe Rs 80 TS, 4 din"). Applied to staff order prices between the dates.
--   pass_through: Pepsi funds it (our buy price drops by the amount) and we pass it to shops.
--   our_discount: we fund it ourselves (only the shop price drops).
-- Shops never read this table; price-list schemes (Aquafina Rs 5, BOGO) are untouched.
create type public.scheme_kind as enum ('pass_through', 'our_discount');

create table public.scheme (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.pack (id) on delete cascade,
  variant_ids uuid[],                         -- null = every flavour of the pack
  kind public.scheme_kind not null default 'pass_through',
  amount_paise int not null check (amount_paise between 1 and 100000),  -- per case
  starts_on date not null,
  ends_on date not null,
  note text check (length(note) <= 300),
  source_text text check (length(source_text) <= 2000),  -- the Pepsi message it came from
  active boolean not null default true,       -- false = ended early
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index scheme_dates on public.scheme (starts_on, ends_on) where active;

alter table public.scheme enable row level security;
create policy scheme_read on public.scheme for select to authenticated using ((select public.is_staff()) or (select public.auth_role()) = 'driver');
create policy scheme_write on public.scheme for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.scheme to authenticated;
revoke all on public.scheme from anon;
create trigger scheme_audit after insert or update or delete on public.scheme for each row execute function public.audit_row();
