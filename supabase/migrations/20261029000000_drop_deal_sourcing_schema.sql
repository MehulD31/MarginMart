-- M0: remove the retired deal-sourcing schema (archived at git tag v0-deal-sourcing).
select cron.unschedule('telegram-spy-heartbeat');
drop table if exists public.matches, public.watchlists, public.orders, public.invoices, public.shopkeepers,
  public.admin_settings, public.telegram_configs, public.spy_trackers, public.monitor_health cascade;
drop function if exists public.generate_invoice_no() cascade;
drop function if exists public.update_updated_at_column() cascade;
