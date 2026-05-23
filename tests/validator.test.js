const { validateDayOffRequest } = require('../js/validator.js');

const mockEmployee = {
  id: 'emp-1',
  branch_id: 'branch-1',
  role: 'kitchen_full',
  employment_type: 'fulltime',
  pizza_capable: true,
  pasta_capable: true,
};

const kitchenEmployees = [
  mockEmployee,
  { id: 'emp-2', branch_id: 'branch-1', role: 'kitchen_pizza', employment_type: 'fulltime', pizza_capable: true,  pasta_capable: false },
  { id: 'emp-3', branch_id: 'branch-1', role: 'kitchen_pasta', employment_type: 'fulltime', pizza_capable: false, pasta_capable: true  },
];

const hallEmployees = [
  { id: 'emp-4', branch_id: 'branch-1', role: 'hall_full', employment_type: 'fulltime',  pizza_capable: false, pasta_capable: false },
  { id: 'emp-5', branch_id: 'branch-1', role: 'hall_part', employment_type: 'parttime', pizza_capable: false, pasta_capable: false },
];

const allEmployees = [...kitchenEmployees, ...hallEmployees];

const baseConditions = [
  { branch_id: 'branch-1', day_type: 'weekday', zone: 'kitchen', min_total: 3, min_pizza_capable: 1, min_pasta_capable: 1, min_open_shift: 1, min_fulltime: 0, min_parttime: 0, max_weekend_offs: 2, max_normal_offs: 8, max_annual_offs: 1, max_consecutive_days: 5 },
  { branch_id: 'branch-1', day_type: 'weekend', zone: 'kitchen', min_total: 4, min_pizza_capable: 1, min_pasta_capable: 1, min_open_shift: 1, min_fulltime: 0, min_parttime: 0, max_weekend_offs: 2, max_normal_offs: 8, max_annual_offs: 1, max_consecutive_days: 5 },
  { branch_id: 'branch-1', day_type: 'weekday', zone: 'hall',    min_total: 2, min_pizza_capable: 0, min_pasta_capable: 0, min_open_shift: 0, min_fulltime: 1, min_parttime: 1, max_weekend_offs: 2, max_normal_offs: 8, max_annual_offs: 1, max_consecutive_days: 5 },
  { branch_id: 'branch-1', day_type: 'weekend', zone: 'hall',    min_total: 3, min_pizza_capable: 0, min_pasta_capable: 0, min_open_shift: 0, min_fulltime: 1, min_parttime: 2, max_weekend_offs: 2, max_normal_offs: 8, max_annual_offs: 1, max_consecutive_days: 5 },
];

// 조건 1: 최소 근무 인원 — 총 인원 부족
test('주방 최소 인원 미충족 시 거절', () => {
  const approvedRequests = [
    { id: 'r1', employee_id: 'emp-2', date: '2026-06-02', type: 'normal', status: 'approved', requested_at: new Date().toISOString() },
    { id: 'r2', employee_id: 'emp-3', date: '2026-06-02', type: 'normal', status: 'approved', requested_at: new Date().toISOString() },
  ];
  const result = validateDayOffRequest({
    employee: mockEmployee,
    date: '2026-06-02',
    type: 'normal',
    allEmployees,
    approvedRequests,
    conditions: baseConditions,
  });
  expect(result.approved).toBe(false);
  expect(result.reason).toContain('최소 인원');
});

test('최소 인원 충족 시 승인', () => {
  const result = validateDayOffRequest({
    employee: mockEmployee,
    date: '2026-06-02',
    type: 'normal',
    allEmployees,
    approvedRequests: [],
    conditions: baseConditions,
  });
  expect(result.approved).toBe(true);
  expect(result.reason).toBeNull();
});

// 조건 1: 피자/파스타 가능 인원
test('피자 가능 인원 부족 시 거절', () => {
  // emp-2(피자전담)가 이미 휴무 → emp-1(풀) 신청 시 피자 0명
  const approvedRequests = [
    { id: 'r1', employee_id: 'emp-2', date: '2026-06-02', type: 'normal', status: 'approved', requested_at: new Date().toISOString() },
  ];
  const result = validateDayOffRequest({
    employee: mockEmployee,
    date: '2026-06-02',
    type: 'normal',
    allEmployees,
    approvedRequests,
    conditions: baseConditions,
  });
  expect(result.approved).toBe(false);
  expect(result.reason).toContain('피자');
});

// 조건 2: 주말 휴무 월 최대 2회
test('주말 휴무 2회 초과 시 거절', () => {
  const approvedRequests = [
    { id: 'r1', employee_id: 'emp-1', date: '2026-06-06', type: 'normal', status: 'approved', requested_at: new Date().toISOString() },
    { id: 'r2', employee_id: 'emp-1', date: '2026-06-07', type: 'normal', status: 'approved', requested_at: new Date().toISOString() },
  ];
  const result = validateDayOffRequest({
    employee: mockEmployee,
    date: '2026-06-13', // 토요일 — 3번째 주말 신청
    type: 'normal',
    allEmployees,
    approvedRequests,
    conditions: baseConditions,
  });
  expect(result.approved).toBe(false);
  expect(result.reason).toContain('주말 휴무');
});

// 조건 3: 정상 휴무 월 최대 8회
test('정상 휴무 8회 초과 시 거절', () => {
  const dates = ['06-02','06-03','06-04','06-05','06-09','06-10','06-11','06-12'];
  const approvedRequests = dates.map((d, i) => ({
    id: `r${i}`, employee_id: 'emp-1', date: `2026-${d}`, type: 'normal',
    status: 'approved', requested_at: new Date().toISOString(),
  }));
  const result = validateDayOffRequest({
    employee: mockEmployee,
    date: '2026-06-16',
    type: 'normal',
    allEmployees,
    approvedRequests,
    conditions: baseConditions,
  });
  expect(result.approved).toBe(false);
  expect(result.reason).toContain('정상 휴무');
});

// 조건 4: 연차 월 최대 1회
test('연차 1회 초과 시 거절', () => {
  const approvedRequests = [
    { id: 'r1', employee_id: 'emp-1', date: '2026-06-02', type: 'annual', status: 'approved', requested_at: new Date().toISOString() },
  ];
  const result = validateDayOffRequest({
    employee: mockEmployee,
    date: '2026-06-09',
    type: 'annual',
    allEmployees,
    approvedRequests,
    conditions: baseConditions,
  });
  expect(result.approved).toBe(false);
  expect(result.reason).toContain('연차');
});

// override_approved도 승인으로 카운트
test('override_approved 상태도 횟수 카운트에 포함', () => {
  const approvedRequests = [
    { id: 'r1', employee_id: 'emp-1', date: '2026-06-02', type: 'annual', status: 'override_approved', requested_at: new Date().toISOString() },
  ];
  const result = validateDayOffRequest({
    employee: mockEmployee,
    date: '2026-06-09',
    type: 'annual',
    allEmployees,
    approvedRequests,
    conditions: baseConditions,
  });
  expect(result.approved).toBe(false);
  expect(result.reason).toContain('연차');
});
