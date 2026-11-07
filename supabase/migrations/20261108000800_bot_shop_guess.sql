-- Voice / one-line sales: find the shops a free-text note most likely means ("maruti kirana sting 50 crate 495"
-- -> "Shri Maruti Kirana"), tolerant of speech misspellings. Fuzzy word match with pg_trgm. Key-checked like other bot RPCs.
create extension if not exists pg_trgm with schema extensions;

create or replace function public.bot_shop_guess(p_key text, p_text text)
returns table(id uuid, name text, phone text, locality text, score real)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if not public.bot_ok(p_key) then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_text), '') = '' then return; end if;
  return query
    select s.id, s.name, s.phone, s.locality,
           greatest(extensions.word_similarity(lower(regexp_replace(s.name, '^(shri|shree|sri|new|m/s\.?)\s+', '', 'i')), lower(p_text)),
                    extensions.word_similarity(lower(s.name), lower(p_text)))::real sc
      from public.shop s
     where s.active
     order by sc desc, s.name
     limit 25;
end $$;
revoke all on function public.bot_shop_guess(text, text) from public;
grant execute on function public.bot_shop_guess(text, text) to anon, authenticated;
