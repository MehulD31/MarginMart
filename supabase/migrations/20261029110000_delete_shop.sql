-- Admin-only: remove a shop created by mistake, with its login. Shops with orders or khata entries must be deactivated instead.
create function public.delete_shop(p_shop_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.orders where shop_id = p_shop_id) or exists (select 1 from public.ledger_entry where shop_id = p_shop_id)
  then raise exception 'SHOP_HAS_HISTORY'; end if;
  delete from public.pin_record where user_id in (select user_id from public.profiles where shop_id = p_shop_id);
  delete from auth.users where id in (select user_id from public.profiles where shop_id = p_shop_id);
  delete from public.profiles where shop_id = p_shop_id;
  delete from public.shop where id = p_shop_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke execute on function public.delete_shop(uuid) from public, anon;
grant execute on function public.delete_shop(uuid) to authenticated;
