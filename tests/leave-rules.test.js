const {
  MAX_MONTHLY_OFFS,
  isRejectedStatus,
  activeRequests,
  sumDays,
  effectiveAnnualRemaining,
  selectionDays,
  canAddSelection,
  validateSubmission,
} = require('../js/leave-rules.js');

const A = (date, type, status, days = 1) => ({ date, type, status, days });
const S = (type, days) => ({ type, days });

describe('상수/기본', () => {
  test('월 합산 상한은 3', () => expect(MAX_MONTHLY_OFFS).toBe(3));
});

describe('isRejectedStatus / activeRequests', () => {
  test('거절·관리자거절만 비활성', () => {
    expect(isRejectedStatus('rejected')).toBe(true);
    expect(isRejectedStatus('override_rejected')).toBe(true);
    expect(isRejectedStatus('pending')).toBe(false);
    expect(isRejectedStatus('approved')).toBe(false);
  });
  test('activeRequests는 거절 계열 제외', () => {
    const reqs = [
      A('2026-07-03', 'normal', 'pending'),
      A('2026-07-05', 'normal', 'rejected'),
      A('2026-07-07', 'annual', 'override_approved', 0.5),
    ];
    expect(activeRequests(reqs)).toHaveLength(2);
  });
});

describe('sumDays', () => {
  test('days 합산 (없으면 1)', () => {
    expect(sumDays([{ days: 1 }, { days: 0.5 }, {}])).toBe(2.5);
    expect(sumDays([])).toBe(0);
  });
});

describe('effectiveAnnualRemaining', () => {
  test('잔여 − pending 일수', () => {
    expect(effectiveAnnualRemaining(8, 1.5)).toBe(6.5);
    expect(effectiveAnnualRemaining(1, 0)).toBe(1);
  });
  test('음수 가능 / 비정상 0', () => {
    expect(effectiveAnnualRemaining(0, 1)).toBe(-1);
    expect(effectiveAnnualRemaining(null, null)).toBe(0);
  });
});

describe('selectionDays', () => {
  test('전체/연차 일수 분리', () => {
    const sel = [S('normal', 1), S('annual', 1), S('annual', 0.5)];
    expect(selectionDays(sel)).toEqual({ total: 2.5, annual: 1.5 });
  });
});

describe('canAddSelection — 월 3일 합산 캡 (반차 0.5 반영)', () => {
  test('baseline 0, 빈 선택에 휴무 1 추가 가능', () => {
    expect(canAddSelection({ mode: 'normal', addDays: 1, baseline: 0, selected: [], effRemaining: 5 }).ok).toBe(true);
  });
  test('baseline 2 + 선택 0.5 + 휴무 1 = 3.5 → 초과 거부', () => {
    const r = canAddSelection({ mode: 'normal', addDays: 1, baseline: 2, selected: [S('annual', 0.5)], effRemaining: 5 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('3일');
  });
  test('합 2.5에 반차 0.5 추가 = 3.0 → 가능', () => {
    const r = canAddSelection({ mode: 'annual', addDays: 0.5, baseline: 2, selected: [S('annual', 0.5)], effRemaining: 5 });
    expect(r.ok).toBe(true);
  });
});

describe('canAddSelection — 잔여 연차 캡 (반차)', () => {
  test('잔여 0.5에 반차 0.5 가능, 종일 1 불가', () => {
    expect(canAddSelection({ mode: 'annual', addDays: 0.5, baseline: 0, selected: [], effRemaining: 0.5 }).ok).toBe(true);
    expect(canAddSelection({ mode: 'annual', addDays: 1, baseline: 0, selected: [], effRemaining: 0.5 }).ok).toBe(false);
  });
  test('잔여 1, 이미 반차 1개(0.5) 선택 → 종일 1 불가, 반차 0.5 가능', () => {
    const sel = [S('annual', 0.5)];
    expect(canAddSelection({ mode: 'annual', addDays: 1, baseline: 0, selected: sel, effRemaining: 1 }).ok).toBe(false);
    expect(canAddSelection({ mode: 'annual', addDays: 0.5, baseline: 0, selected: sel, effRemaining: 1 }).ok).toBe(true);
  });
  test('잔여 음수 → 연차 추가 불가', () => {
    const r = canAddSelection({ mode: 'annual', addDays: 0.5, baseline: 0, selected: [], effRemaining: -1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('0일');
  });
});

describe('validateSubmission', () => {
  test('빈 선택 거부', () => {
    expect(validateSubmission({ baseline: 0, selected: [], effRemaining: 5 }).ok).toBe(false);
  });
  test('휴무1 + 연차반차1(0.5) = 1.5, baseline 1 → 통과', () => {
    const sel = [S('normal', 1), S('annual', 0.5)];
    expect(validateSubmission({ baseline: 1, selected: sel, effRemaining: 5 }).ok).toBe(true);
  });
  test('baseline+선택 > 3 거부', () => {
    const sel = [S('normal', 1), S('normal', 1)];
    expect(validateSubmission({ baseline: 2, selected: sel, effRemaining: 5 }).ok).toBe(false);
  });
  test('연차 일수 > 잔여 거부 (반차 3개=1.5 vs 잔여 1)', () => {
    const sel = [S('annual', 0.5), S('annual', 0.5), S('annual', 0.5)];
    const r = validateSubmission({ baseline: 0, selected: sel, effRemaining: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('잔여 연차');
  });
  test('순수 휴무는 effRemaining 음수여도 통과', () => {
    expect(validateSubmission({ baseline: 0, selected: [S('normal', 1)], effRemaining: -1 }).ok).toBe(true);
  });
});
