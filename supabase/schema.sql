-- branches
CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

-- employees
CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN (
    'kitchen_full', 'kitchen_pizza', 'kitchen_pasta',
    'kitchen_part', 'hall_full', 'hall_part'
  )),
  employment_type text NOT NULL CHECK (employment_type IN ('fulltime', 'parttime')),
  pizza_capable boolean NOT NULL DEFAULT false,
  pasta_capable boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true
);

-- schedule_conditions (매장 × 평일/주말 × 주방/홀)
CREATE TABLE schedule_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  day_type text NOT NULL CHECK (day_type IN ('weekday', 'weekend')),
  zone text NOT NULL CHECK (zone IN ('kitchen', 'hall')),
  min_total int NOT NULL DEFAULT 0,
  min_pizza_capable int NOT NULL DEFAULT 0,
  min_pasta_capable int NOT NULL DEFAULT 0,
  min_open_shift int NOT NULL DEFAULT 0,
  min_fulltime int NOT NULL DEFAULT 0,
  min_parttime int NOT NULL DEFAULT 0,
  max_weekend_offs int NOT NULL DEFAULT 2,
  max_normal_offs int NOT NULL DEFAULT 8,
  max_annual_offs int NOT NULL DEFAULT 1,
  max_consecutive_days int NOT NULL DEFAULT 5,
  UNIQUE(branch_id, day_type, zone)
);

-- day_off_requests
CREATE TABLE day_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('normal', 'annual')),
  status text NOT NULL DEFAULT 'approved' CHECK (
    status IN ('approved', 'rejected', 'override_approved', 'override_rejected')
  ),
  requested_at timestamptz NOT NULL DEFAULT now(),
  rejection_reason text,
  overridden_at timestamptz
);

-- schedules (매장 × 연월)
CREATE TABLE schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL,
  published_at timestamptz,
  UNIQUE(branch_id, year, month)
);

-- schedule_entries (일별 직원 시프트)
CREATE TABLE schedule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES schedules(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  shift_type text NOT NULL CHECK (shift_type IN ('open', 'close', 'hall_fixed', 'off')),
  UNIQUE(schedule_id, employee_id, date)
);

-- RLS 정책 (anon key로 전체 접근 허용 — 내부 도구)
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all" ON branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON schedule_conditions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON day_off_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON schedule_entries FOR ALL USING (true) WITH CHECK (true);
