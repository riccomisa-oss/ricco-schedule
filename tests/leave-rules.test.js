const {
  MAX_MONTHLY_OFFS,
  isRejectedStatus,
  activeRequests,
  effectiveAnnualRemaining,
  selectionCounts,
  canAddSelection,
  validateSubmission,
} = require('../js/leave-rules.js');

const A = (date, type, status) => ({ date, type, status });

describe('상수/기본', () => {
  test('월 합산 상한은 3', () => {
    expect(MAX_MONTHLY_OFFS).toBe(3);
  });
});

describe('isRejectedStatus / activeRequests', () => {
  test('거절·관리자거절만 비활성', () => {
    expect(isRejectedStatus('rejected')).toBe(true);
    expect(isRejectedStatus('override_rejected')).toBe(true);
    expect(isRejectedStatus('pending')).toBe(false);
    expect(isRejectedStatus('approved')).toBe(false);
    expect(isRejectedStatus('override_approved')).toBe(false);
  });
  test('activeRequests는 거절 계열 제외', () => {
    const reqs = [
      A('2026-06-03', 'normal', 'pending'),
      A('2026-06-04', 'annual', 'approved'),
      A('2026-06-05', 'normal', 'rejected'),
      A('2026-06-06', 'annual', 'override_rejected'),
      A('2026-06-07', 'normal', 'override_approved'),
    ];
    expect(activeRequests(reqs)).toHaveLength(3);
  });
  test('빈/undefined 안전', () => {
    expect(activeRequests(undefined)).toEqual([]);
    expect(activeRequests([])).toEqual([]);
  });
});

describe('effectiveAnnualRemaining', () => {
  test('잔여 − pending', () => {
    expect(effectiveAnnualRemaining(8, 2)).toBe(6);
    expect(effectiveAnnualRemaining(1, 0)).toBe(1);
  });
  test('pending이 잔여보다 많으면 음수 가능', () => {
    expect(effectiveAnnualRemaining(1, 3)).toBe(-2);
  });
  test('비정상 입력은 0 취급', () => {
    expect(effectiveAnnualRemaining(undefined, undefined)).toBe(0);
    expect(effectiveAnnualRemaining(null, null)).toBe(0);
  });
});

describe('selectionCounts', () => {
  test('총/연차 분리 카운트', () => {
    const sel = [
      { date: '2026-06-03', type: 'normal' },
      { date: '2026-06-04', type: 'annual' },
      { date: '2026-06-05', type: 'annual' },
    ];
    expect(selectionCounts(sel)).toEqual({ total: 3, annual: 2 });
  });
});

describe('canAddSelection — 월 3일 합산 캡 (R1)', () => {
  test('baseline 0, 선택 0 → 추가 가능', () => {
    expect(canAddSelection({ mode: 'normal', baseline: 0, selected: [], effRemaining: 5 }).ok).toBe(true);
  });
  test('baseline 2 + 선택 1 = 3 → 더는 불가', () => {
    const sel = [{ date: '2026-06-03', type: 'normal' }];
    const r = canAddSelection({ mode: 'normal', baseline: 2, selected: sel, effRemaining: 5 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('3일');
  });
  test('baseline 0 + 선택 3 → 4번째 불가', () => {
    const sel = [
      { date: '2026-06-03', type: 'normal' },
      { date: '2026-06-04', type: 'normal' },
      { date: '2026-06-05', type: 'annual' },
    ];
    expect(canAddSelection({ mode: 'normal', baseline: 0, selected: sel, effRemaining: 5 }).ok).toBe(false);
  });
});

describe('canAddSelection — 잔여 연차 캡 (R2)', () => {
  test('잔여 1, 연차 선택 0 → 첫 연차 가능', () => {
    expect(canAddSelection({ mode: 'annual', baseline: 0, selected: [], effRemaining: 1 }).ok).toBe(true);
  });
  test('잔여 1, 이미 연차 1 선택 → 2번째 연차 불가(휴무는 합산 캡 내에서 가능)', () => {
    const sel = [{ date: '2026-06-03', type: 'annual' }];
    expect(canAddSelection({ mode: 'annual', baseline: 0, selected: sel, effRemaining: 1 }).ok).toBe(false);
    expect(canAddSelection({ mode: 'normal', baseline: 0, selected: sel, effRemaining: 1 }).ok).toBe(true);
  });
  test('잔여 0 → 연차 불가', () => {
    const r = canAddSelection({ mode: 'annual', baseline: 0, selected: [], effRemaining: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('잔여 연차');
  });
  test('잔여 음수 → 연차 불가, 메시지 0으로 클램프', () => {
    const r = canAddSelection({ mode: 'annual', baseline: 0, selected: [], effRemaining: -2 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('0일');
  });
});

describe('validateSubmission — 제출 최종 검증', () => {
  test('빈 선택 거부', () => {
    expect(validateSubmission({ baseline: 0, selected: [], effRemaining: 5 }).ok).toBe(false);
  });
  test('합산 3 이내 + 잔여 이내 → 통과', () => {
    const sel = [
      { date: '2026-06-03', type: 'annual' },
      { date: '2026-06-04', type: 'normal' },
    ];
    expect(validateSubmission({ baseline: 1, selected: sel, effRemaining: 5 }).ok).toBe(true);
  });
  test('baseline+선택 > 3 거부', () => {
    const sel = [
      { date: '2026-06-03', type: 'normal' },
      { date: '2026-06-04', type: 'normal' },
    ];
    expect(validateSubmission({ baseline: 2, selected: sel, effRemaining: 5 }).ok).toBe(false);
  });
  test('연차 선택 > 잔여 거부 (예: 잔여 1인데 연차 2)', () => {
    const sel = [
      { date: '2026-06-03', type: 'annual' },
      { date: '2026-06-04', type: 'annual' },
    ];
    const r = validateSubmission({ baseline: 0, selected: sel, effRemaining: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('잔여 연차');
  });
  test('순수 휴무 제출은 effRemaining 음수여도 통과 (연차 0개)', () => {
    const sel = [{ date: '2026-06-03', type: 'normal' }];
    expect(validateSubmission({ baseline: 0, selected: sel, effRemaining: -1 }).ok).toBe(true);
  });
  test('effRemaining 음수일 때 연차 포함 제출은 거부', () => {
    const sel = [{ date: '2026-06-03', type: 'annual' }];
    expect(validateSubmission({ baseline: 0, selected: sel, effRemaining: -1 }).ok).toBe(false);
  });
});
