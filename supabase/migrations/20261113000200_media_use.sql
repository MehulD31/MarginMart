-- Which library clip/photo went into which Reel (one item can feed many Reels). Service role only.
create table if not exists public.media_use (
  media_id uuid not null references public.media_library(id) on delete cascade,
  post_id uuid not null,
  from_s numeric not null default 0,
  style text,
  created_at timestamptz not null default now(),
  primary key (media_id, post_id, from_s)
);
alter table public.media_use enable row level security;
alter table public.social_post add column if not exists style text;
-- history so far: each edited item was used once by the post it was claimed into
insert into public.media_use (media_id, post_id) select id, edited_into from public.media_library where edited_into is not null on conflict do nothing;
