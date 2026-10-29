-- Shared per-vehicle driver logins use placeholder numbers (1111111111 ...), so allow any 10 digits.
alter table public.profiles drop constraint profiles_phone_check;
alter table public.profiles add constraint profiles_phone_check check (phone ~ '^[0-9]{10}$');
