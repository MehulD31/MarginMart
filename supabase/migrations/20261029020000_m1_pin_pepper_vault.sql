-- PIN pepper lives in Supabase Vault, generated inside the database so it never leaves it.
-- Rotating it invalidates every PIN: only do it together with a reset of all users.
create extension if not exists supabase_vault;
create extension if not exists pgcrypto with schema extensions;
select vault.create_secret(encode(extensions.gen_random_bytes(48), 'base64'), 'pin_pepper',
  'HMAC pepper for phone+PIN login. Never rotate without resetting all PINs.')
where not exists (select 1 from vault.secrets where name = 'pin_pepper');

create function public.get_pin_pepper() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'pin_pepper'
$$;
revoke execute on function public.get_pin_pepper() from public, anon, authenticated;
grant execute on function public.get_pin_pepper() to service_role;
