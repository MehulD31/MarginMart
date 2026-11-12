-- Telegram media library + auto-edited Reels (owner, 11 Nov 2026).
-- Every photo/video the owners send to the KD bot is kept here; the reel job edits fresh items into one Reel.
create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('video', 'image')),
  url text not null,
  note text,
  who text,
  tg_file_id text unique,
  edited_into uuid references public.social_post(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists media_library_fresh on public.media_library (created_at) where edited_into is null;
alter table public.media_library enable row level security;
create policy media_library_staff_read on public.media_library for select using ((select is_staff()));

-- where an approved post goes: 'all' = Telegram channel + Facebook + Instagram; 'fb' = channel + Facebook only
-- (owner posts Instagram by hand with Instagram's own music, from manual_url = the same edit without music)
alter table public.social_post add column if not exists targets text not null default 'all' check (targets in ('all', 'fb'));
alter table public.social_post add column if not exists manual_url text;

create or replace function public.bot_social_approve_fb(p_key text, p_id uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare v text;
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  update public.social_post set status = 'queued', targets = 'fb', error = null where id = p_id and status = 'draft' returning status into v;
  if v is null then select status into v from public.social_post where id = p_id; return coalesce(v, 'missing'); end if;
  return 'queued';
end $$;
revoke all on function public.bot_social_approve_fb(text, uuid) from public;
grant execute on function public.bot_social_approve_fb(text, uuid) to anon, authenticated;
