const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Branches ──────────────────────────────────────────────
async function getBranches() {
  const { data, error } = await db.from('branches').select('*').order('name');
  if (error) throw error;
  return data;
}

// ── Employees ─────────────────────────────────────────────
async function getEmployees(branchId) {
  const { data, error } = await db
    .from('employees')
    .select('*')
    .eq('branch_id', branchId)
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data;
}

async function createEmployee({ branchId, name, role, openCapable = false, annualLeaveTotal = null, hireDate = null }) {
  const roleCapabilities = {
    kitchen_full:  { employment_type: 'fulltime',  pizza_capable: true,  pasta_capable: true  },
    kitchen_pizza: { employment_type: 'fulltime',  pizza_capable: true,  pasta_capable: false },
    kitchen_pasta: { employment_type: 'fulltime',  pizza_capable: false, pasta_capable: true  },
    kitchen_part:  { employment_type: 'parttime',  pizza_capable: false, pasta_capable: false },
    hall_full:     { employment_type: 'fulltime',  pizza_capable: false, pasta_capable: false },
    hall_part:     { employment_type: 'parttime',  pizza_capable: false, pasta_capable: false },
  };
  const caps = roleCapabilities[role];
  const { data, error } = await db
    .from('employees')
    .insert({ branch_id: branchId, name, role, open_capable: openCapable, annual_leave_total: annualLeaveTotal, hire_date: hireDate, ...caps })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateEmployee(id, { name, role, openCapable = false, annualLeaveTotal = null, hireDate = null }) {
  const roleCapabilities = {
    kitchen_full:  { employment_type: 'fulltime',  pizza_capable: true,  pasta_capable: true  },
    kitchen_pizza: { employment_type: 'fulltime',  pizza_capable: true,  pasta_capable: false },
    kitchen_pasta: { employment_type: 'fulltime',  pizza_capable: false, pasta_capable: true  },
    kitchen_part:  { employment_type: 'parttime',  pizza_capable: false, pasta_capable: false },
    hall_full:     { employment_type: 'fulltime',  pizza_capable: false, pasta_capable: false },
    hall_part:     { employment_type: 'parttime',  pizza_capable: false, pasta_capable: false },
  };
  const caps = roleCapabilities[role];
  const { error } = await db
    .from('employees')
    .update({ name, role, open_capable: openCapable, annual_leave_total: annualLeaveTotal, hire_date: hireDate, ...caps })
    .eq('id', id);
  if (error) throw error;
}

async function getAnnualLeaveStats(branchId, year) {
  const employees = await getEmployees(branchId);
  const withHire = employees.filter(e => e.hire_date != null);
  if (withHire.length === 0) return [];

  const { data: entries, error } = await db
    .from('annual_leave_ledger')
    .select('employee_id, type, days')
    .in('employee_id', withHire.map(e => e.id));
  if (error) throw error;

  return withHire.map(e => {
    const empEntries = (entries || []).filter(r => r.employee_id === e.id);
    const accrued = empEntries
      .filter(r => r.type === 'accrual')
      .reduce((s, r) => s + Number(r.days), 0);
    const used = empEntries
      .filter(r => r.type === 'usage')
      .reduce((s, r) => s + Number(r.days), 0);
    return { emp: e, total: accrued, used, remaining: accrued - used };
  });
}

async function deactivateEmployee(id) {
  const { error } = await db
    .from('employees')
    .update({ active: false })
    .eq('id', id);
  if (error) throw error;
}

// ── Schedule Conditions ───────────────────────────────────
async function getConditions(branchId) {
  const { data, error } = await db
    .from('schedule_conditions')
    .select('*')
    .eq('branch_id', branchId);
  if (error) throw error;
  return data;
}

async function updateCondition(id, fields) {
  const { error } = await db
    .from('schedule_conditions')
    .update(fields)
    .eq('id', id);
  if (error) throw error;
}

// ── Day Off Requests ──────────────────────────────────────
async function getDayOffRequests(branchId, year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  const { data, error } = await db
    .from('day_off_requests')
    .select('*, employees(name, role, branch_id)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('requested_at');
  if (error) throw error;
  return (data || []).filter(r => r.employees?.branch_id === branchId);
}

async function getEmployeeDayOffRequests(employeeId, year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  const { data, error } = await db
    .from('day_off_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('requested_at');
  if (error) throw error;
  return data;
}

async function createDayOffRequest({ employeeId, date, type, status, rejectionReason }) {
  const { data, error } = await db
    .from('day_off_requests')
    .insert({
      employee_id: employeeId,
      date,
      type,
      status,
      rejection_reason: rejectionReason || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function overrideDayOffRequest(id, newStatus) {
  const { error } = await db
    .from('day_off_requests')
    .update({ status: newStatus, overridden_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function deleteDayOffRequest(id) {
  const { error } = await db.from('day_off_requests').delete().eq('id', id);
  if (error) throw error;
}

// ── Schedules ─────────────────────────────────────────────
async function getOrCreateSchedule(branchId, year, month) {
  const { data: existing } = await db
    .from('schedules')
    .select('*')
    .eq('branch_id', branchId)
    .eq('year', year)
    .eq('month', month)
    .single();
  if (existing) return existing;

  const { data, error } = await db
    .from('schedules')
    .insert({ branch_id: branchId, year, month })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function publishSchedule(scheduleId) {
  const { error } = await db
    .from('schedules')
    .update({ published_at: new Date().toISOString() })
    .eq('id', scheduleId);
  if (error) throw error;
}

async function unpublishSchedule(scheduleId) {
  const { error } = await db
    .from('schedules')
    .update({ published_at: null })
    .eq('id', scheduleId);
  if (error) throw error;
}

// ── Schedule Entries ──────────────────────────────────────
async function getScheduleEntries(scheduleId) {
  const { data, error } = await db
    .from('schedule_entries')
    .select('*, employees(name, role)')
    .eq('schedule_id', scheduleId);
  if (error) throw error;
  return data;
}

async function upsertScheduleEntry({ scheduleId, employeeId, date, shiftType }) {
  const { error } = await db
    .from('schedule_entries')
    .upsert(
      { schedule_id: scheduleId, employee_id: employeeId, date, shift_type: shiftType },
      { onConflict: 'schedule_id,employee_id,date' }
    );
  if (error) throw error;
}

// ── Annual Leave Ledger ───────────────────────────────────
async function getAnnualLedger(employeeId) {
  const { data, error } = await db
    .from('annual_leave_ledger')
    .select('*')
    .eq('employee_id', employeeId)
    .order('date');
  if (error) throw error;
  return data;
}

async function addLedgerEntry({ employeeId, date, type, days, note = null }) {
  const { data, error } = await db
    .from('annual_leave_ledger')
    .insert({ employee_id: employeeId, date, type, days, note })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteLedgerEntry(id) {
  const { error } = await db.from('annual_leave_ledger').delete().eq('id', id);
  if (error) throw error;
}
