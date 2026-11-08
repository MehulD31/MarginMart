-- ❌ "Mat daalo" on a queued social post preview (Telegram). Bot key checked; only a still-queued post can be skipped.
create or replace function public.bot_social_skip(p_key text, p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  update public.social_post set status = 'skipped', error = 'skipped from Telegram' where id = p_id and status = 'queued' returning status into v;
  if v is null then select status into v from public.social_post where id = p_id; return coalesce(v, 'missing'); end if;
  return 'skipped';
end $$;
revoke all on function public.bot_social_skip(text, uuid) from public;
grant execute on function public.bot_social_skip(text, uuid) to anon, authenticated;
