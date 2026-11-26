-- Audit triggers for Call Sheet so manager call logs and added shops appear in Telegram activity alerts.
CREATE TRIGGER route_call_log_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.route_call_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

CREATE TRIGGER route_sheet_shop_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.route_sheet_shop
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();
