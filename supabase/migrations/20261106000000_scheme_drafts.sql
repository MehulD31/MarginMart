-- Scheme bot drafts: what the bot understood from a Pepsi message, waiting for ✅ Approve in Telegram.
-- Written and read only by the bot (service role). Approving copies it into public.scheme.
create table public.scheme_draft (
  id uuid primary key default gen_random_uuid(),
  source_text text not null check (length(source_text) <= 2000),
  facts jsonb not null,            -- {pack_id, variant_ids, kind, amount_paise, starts_on, ends_on, note}
  telegram_from text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'replaced')),
  scheme_id uuid references public.scheme (id),
  created_at timestamptz not null default now()
);
alter table public.scheme_draft enable row level security;
revoke all on public.scheme_draft from anon, authenticated;
