-- Owner decision: 4-digit PINs. Old 6-digit records are left as they are until reset (not validated).
alter table public.pin_record drop constraint pin_record_pin_check;
alter table public.pin_record add constraint pin_record_pin_check check (pin ~ '^[0-9]{4}$') not valid;
