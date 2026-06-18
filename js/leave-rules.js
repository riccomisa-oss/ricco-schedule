// 휴무/연차 신청 캡 순수 규칙 (일수 합산 기준 — 반차 0.5 지원).
// 정책:
//  - 한 직원이 한 달에 신청 가능한 휴무 + 연차 합계는 최대 MAX_MONTHLY_OFFS"일"(반차는 0.5).
//  - 연차는 본인 잔여(전기간 발생-사용) − 전기간 pending 연차"일수" 범위 안에서만.
//  - 같은 날짜는 휴무 또는 연차 중 하나만.

const MAX_MONTHLY_OFFS = 3; // 한 달 휴무+연차 합산 상한(일)

function isRejectedStatus(status) {
  return status === 'rejected' || status === 'override_rejected';
}

// 비거절(살아있는) 요청만
function activeRequests(requests) {
  return (requests || []).filter((r) => !isRejectedStatus(r.status));
}

// 일수 합 (각 항목의 days, 없으면 1일로 간주)
function sumDays(items) {
  return (items || []).reduce((s, x) => s + (Number(x.days) || 1), 0);
}

// 가용 연차 = 잔여(전기간 발생-사용) − 전기간 pending 연차 일수
function effectiveAnnualRemaining(remaining, pendingAnnualDays) {
  return (Number(remaining) || 0) - (Number(pendingAnnualDays) || 0);
}

// 선택 항목들의 일수 합 (전체 / 연차)
// selected: [{type:'normal'|'annual', days:number}]
function selectionDays(selected) {
  let total = 0, annual = 0;
  for (const s of (selected || [])) {
    const d = Number(s.days) || 0;
    total += d;
    if (s.type === 'annual') annual += d;
  }
  return { total, annual };
}

// 항목 1건(mode, addDays일)을 더 추가할 수 있는가?
//  baseline: 이번 달 기제출 비거절(휴무+연차) 일수 합
//  selected: 이번 세션 선택분(추가 대상 제외) [{type,days}]
function canAddSelection({ mode, addDays, baseline, selected, effRemaining }) {
  const add = Number(addDays) || 0;
  const { total, annual } = selectionDays(selected);
  if ((baseline || 0) + total + add > MAX_MONTHLY_OFFS) {
    return { ok: false, reason: `한 달에 휴무·연차 합쳐 최대 ${MAX_MONTHLY_OFFS}일까지예요.` };
  }
  if (mode === 'annual' && annual + add > Math.max(0, effRemaining || 0)) {
    return { ok: false, reason: `잔여 연차 ${Math.max(0, effRemaining || 0)}일을 초과할 수 없어요.` };
  }
  return { ok: true, reason: null };
}

// 제출 직전 최종 검증 (selected 전체)
function validateSubmission({ baseline, selected, effRemaining }) {
  const { total, annual } = selectionDays(selected);
  if (total === 0) return { ok: false, reason: '신청할 날짜를 선택해주세요.' };
  if ((baseline || 0) + total > MAX_MONTHLY_OFFS) {
    return { ok: false, reason: `한 달에 휴무·연차 합쳐 최대 ${MAX_MONTHLY_OFFS}일까지예요. (이미 ${baseline || 0}일 신청됨)` };
  }
  if (annual > Math.max(0, effRemaining || 0)) {
    return { ok: false, reason: `잔여 연차 ${Math.max(0, effRemaining || 0)}일을 초과했어요.` };
  }
  return { ok: true, reason: null };
}

if (typeof module !== 'undefined') {
  module.exports = {
    MAX_MONTHLY_OFFS,
    isRejectedStatus,
    activeRequests,
    sumDays,
    effectiveAnnualRemaining,
    selectionDays,
    canAddSelection,
    validateSubmission,
  };
}
