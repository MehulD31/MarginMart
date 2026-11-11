-- WhatsApp community invites: which shops have been sent the group link.
create table if not exists public.shop_invite (
  shop_id uuid primary key references public.shop(id) on delete cascade,
  invited_at timestamptz not null default now(),
  invited_by uuid default auth.uid()
);
alter table public.shop_invite enable row level security;
create policy shop_invite_staff on public.shop_invite for all using ((select is_staff())) with check ((select is_staff()));

-- Today's batch: 50 uninvited active shops with a phone. Buyers first (most bills), then by area.
create or replace function public.invite_batch(p_limit int default 50)
returns table (id uuid, name text, owner_name text, phone text, locality text, bought boolean, left_count bigint)
language sql stable security invoker set search_path = public as $$
  with c as (
    select s.id, s.name, s.owner_name, s.phone, s.locality,
      (select count(*) from cash_sale x where x.shop_id = s.id) + (select count(*) from orders o where o.shop_id = s.id) as n
    from shop s
    where s.active and coalesce(s.phone, '') <> '' and s.name not like 'QA %'
      and not exists (select 1 from shop_invite i where i.shop_id = s.id)
  )
  select id, name, owner_name, phone, locality, n > 0, (select count(*) from c)
  from c order by (n > 0) desc, coalesce(locality, 'zzz'), n desc, name limit p_limit
$$;

create or replace function public.mark_invited(p_shop uuid)
returns void language sql security invoker set search_path = public as $$
  insert into shop_invite (shop_id) values (p_shop) on conflict do nothing
$$;
grant execute on function public.invite_batch(int), public.mark_invited(uuid) to authenticated;

-- Applied as a second step (invite_batch_daily_cap): the batch shrinks by the invites already sent today (IST),
-- so the list is at most 50 per day: ... limit greatest(0, p_limit - <invited today>).
