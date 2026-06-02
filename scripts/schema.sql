-- 리꼬 피자 연차 관리 스키마
-- Supabase SQL Editor에 붙여넣기 후 실행

ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date date;

CREATE TABLE IF NOT EXISTS annual_leave_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('accrual', 'usage')),
  days numeric NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE annual_leave_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'annual_leave_ledger' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON annual_leave_ledger FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
