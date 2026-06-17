// 휴무/연차 신청 캡 순수 규칙. 브라우저(employee-request.js)와 jest 양쪽에서 사용.
// 정책:
//  - 한 직원이 한 달에 신청 가능한 휴무 + 연차 합계는 최대 MAX_MONTHLY_OFFS일.
//  - 연차는 본인 잔여(전기간 accrued - used) − 전기간 pending 연차 범위 안에서만.
//  - 같은 날짜는 휴무 또는 연차 중 하나만.

const MAX_MONTHLY_OFFS = 3; // 한 달 휴무+연차 합산 상한

// 거절 계열(살아있지 않은) 상태
function isRejectedStatus(status) {
  return status === 'rejected' || status === 'override_rejected';
}

// 비거절(살아있는) 요청만 — 캡·잔여·중복 판정의 공통 기준
function activeRequests(requests) {
  return (requests || []).filter((r) => !isRejectedStatus(r.status));
}

// 가용 연차 = 잔여(전기간 accrued-used) − 전기간 pending 연차(ledger 미반영분)
function effectiveAnnualRemaining(remaining, pendingAnnualCount) {
  return (Number(remaining) || 0) - (Number(pendingAnnualCount) || 0);
}

// selected: [{date, type}] — 이번 세션에 새로 고른 것들
function selectionCounts(selected) {
  const list = selected || [];
  return {
    total: list.length,
    annual: list.filter((s) => s.type === 'annual').length,
  };
}

// 날짜 1건을 mode로 추가할 수 있는가?
//  baseline: 이번 달 기제출 비거절(휴무+연차) 건수
//  selected: 이번 세션에 새로 고른 [{date,type}] (추가 대상 날짜는 제외한 현재 상태)
//  effRemaining: effectiveAnnualRemaining 결과
function canAddSelection({ mode, baseline, selected, effRemaining }) {
  const { total, annual } = selectionCounts(selected);
  if ((baseline || 0) + total >= MAX_MONTHLY_OFFS) {
    return { ok: false, reason: `한 달에 휴무·연차 합쳐 최대 ${MAX_MONTHLY_OFFS}일까지 신청할 수 있어요.` };
  }
  if (mode === 'annual' && annual >= Math.max(0, effRemaining || 0)) {
    const r = Math.max(0, effRemaining || 0);
    return { ok: false, reason: `잔여 연차 ${r}일을 초과할 수 없어요.` };
  }
  return { ok: true, reason: null };
}

// 제출 직전 최종 검증 (selected 전체가 캡을 만족하는가)
function validateSubmission({ baseline, selected, effRemaining }) {
  const { total, annual } = selectionCounts(selected);
  if (total === 0) return { ok: false, reason: '신청할 날짜를 선택해주세요.' };
  if ((baseline || 0) + total > MAX_MONTHLY_OFFS) {
    return {
      ok: false,
      reason: `한 달에 휴무·연차 합쳐 최대 ${MAX_MONTHLY_OFFS}일까지예요. (이미 ${baseline || 0}일 신청됨)`,
    };
  }
  // 연차를 실제로 고른 경우에만 잔여 검사 (순수 휴무 제출은 effRemaining 음수여도 통과)
  if (annual > 0 && annual > Math.max(0, effRemaining || 0)) {
    return { ok: false, reason: `잔여 연차 ${Math.max(0, effRemaining || 0)}일을 초과했어요.` };
  }
  return { ok: true, reason: null };
}

if (typeof module !== 'undefined') {
  module.exports = {
    MAX_MONTHLY_OFFS,
    isRejectedStatus,
    activeRequests,
    effectiveAnnualRemaining,
    selectionCounts,
    canAddSelection,
    validateSubmission,
  };
}
