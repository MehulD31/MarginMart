-- Staff Attendance & Salary Manager
CREATE TABLE IF NOT EXISTS public.staff_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT 'driver',
  phone text,
  monthly_salary_paise bigint NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_member(id) ON DELETE CASCADE,
  att_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'half_day', 'absent', 'paid_leave', 'holiday')),
  overtime_paise bigint NOT NULL DEFAULT 0,
  note text,
  marked_by uuid REFERENCES auth.users(id),
  marked_by_name text,
  marked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, att_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON public.staff_attendance(att_date);

CREATE TABLE IF NOT EXISTS public.staff_advance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_member(id) ON DELETE CASCADE,
  given_on date NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_advance_date ON public.staff_advance(given_on);

ALTER TABLE public.staff_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_advance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_member_auth_all" ON public.staff_member FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "staff_attendance_auth_all" ON public.staff_attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "staff_advance_auth_all" ON public.staff_advance FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER staff_member_audit AFTER INSERT OR UPDATE OR DELETE ON public.staff_member FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER staff_attendance_audit AFTER INSERT OR UPDATE OR DELETE ON public.staff_attendance FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER staff_advance_audit AFTER INSERT OR UPDATE OR DELETE ON public.staff_advance FOR EACH ROW EXECUTE FUNCTION public.audit_row();
