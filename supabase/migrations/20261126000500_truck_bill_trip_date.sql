-- Backfill all truck bills so created_at matches their trip's route_day_plan.date,
-- and enforce this automatically on insert/update so old parchis typed in later count on the trip's day.
UPDATE public.cash_sale c
SET created_at = ((p.date + (c.created_at AT TIME ZONE 'Asia/Kolkata')::time) AT TIME ZONE 'Asia/Kolkata')
FROM public.route_day_plan p
WHERE c.route_day_plan_id = p.id
  AND (c.created_at AT TIME ZONE 'Asia/Kolkata')::date <> p.date;

CREATE OR REPLACE FUNCTION public.cash_sale_sync_trip_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_plan_day date;
BEGIN
  IF NEW.route_day_plan_id IS NOT NULL THEN
    SELECT date INTO v_plan_day FROM public.route_day_plan WHERE id = NEW.route_day_plan_id;
    IF v_plan_day IS NOT NULL AND (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date <> v_plan_day THEN
      NEW.created_at := ((v_plan_day + (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::time) AT TIME ZONE 'Asia/Kolkata');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cash_sale_trip_date ON public.cash_sale;
CREATE TRIGGER cash_sale_trip_date
  BEFORE INSERT OR UPDATE OF route_day_plan_id, created_at ON public.cash_sale
  FOR EACH ROW EXECUTE FUNCTION public.cash_sale_sync_trip_date();
