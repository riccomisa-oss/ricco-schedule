function getZone(role) {
  return role.startsWith('kitchen') ? 'kitchen' : 'hall';
}

function isWeekend(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return day === 0 || day === 6;
}

function isSameMonth(dateStr, year, month) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

const APPROVED_STATUSES = ['approved', 'override_approved'];

function validateDayOffRequest({ employee, date, type, allEmployees, approvedRequests, conditions }) {
  const dateObj = new Date(date + 'T00:00:00');
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const weekend = isWeekend(date);
  const zone = getZone(employee.role);
  const dayType = weekend ? 'weekend' : 'weekday';

  const myApproved = approvedRequests.filter(
    r => r.employee_id === employee.id &&
         APPROVED_STATUSES.includes(r.status) &&
         isSameMonth(r.date, year, month)
  );

  // 조건 3: 정상 휴무 월 최대
  if (type === 'normal') {
    const cond = conditions.find(c => c.zone === zone);
    const count = myApproved.filter(r => r.type === 'normal').length;
    if (count >= cond.max_normal_offs) {
      return { approved: false, reason: `정상 휴무는 월 최대 ${cond.max_normal_offs}회까지 가능합니다. (현재 ${count}회 사용)` };
    }
  }

  // 조건 4: 연차 월 최대
  if (type === 'annual') {
    const cond = conditions.find(c => c.zone === zone);
    const count = myApproved.filter(r => r.type === 'annual').length;
    if (count >= cond.max_annual_offs) {
      return { approved: false, reason: `연차는 월 최대 ${cond.max_annual_offs}회까지 가능합니다. (현재 ${count}회 사용)` };
    }
  }

  // 조건 2: 주말 휴무 월 최대
  if (weekend) {
    const cond = conditions.find(c => c.zone === zone);
    const count = myApproved.filter(r => isWeekend(r.date)).length;
    if (count >= cond.max_weekend_offs) {
      return { approved: false, reason: `주말 휴무는 월 최대 ${cond.max_weekend_offs}회까지 가능합니다. (현재 ${count}회 사용)` };
    }
  }

  // 조건 1: 최소 근무 인원
  const condition = conditions.find(c => c.day_type === dayType && c.zone === zone);
  if (condition) {
    // 신청자를 제외하고 이미 해당 날짜에 승인된 같은 구역 직원 ID 집합
    const alreadyOffIds = new Set(
      approvedRequests
        .filter(r => r.date === date && APPROVED_STATUSES.includes(r.status))
        .map(r => r.employee_id)
    );

    const zoneEmployees = allEmployees.filter(e => getZone(e.role) === zone);
    const totalInZone = zoneEmployees.length;
    const alreadyOffCount = zoneEmployees.filter(e => alreadyOffIds.has(e.id)).length;

    // 신청자 포함 후 남을 총 근무 인원
    const remainingTotal = totalInZone - alreadyOffCount - 1;

    // 총 인원이 0이 되거나 허용 최대 휴무를 이미 초과한 경우 → 총 인원 메시지 우선
    if (remainingTotal <= 0) {
      return { approved: false, reason: `해당 날 ${zone === 'kitchen' ? '주방' : '홀'} 최소 인원(${condition.min_total}명)을 충족하지 못합니다.` };
    }

    // 피자/파스타/고용형태 세분화 체크 (신청자 본인 포함해서 남을 인원 계산)
    if (zone === 'kitchen') {
      const totalPizza = zoneEmployees.filter(e => e.pizza_capable).length;
      const totalPasta = zoneEmployees.filter(e => e.pasta_capable).length;
      const alreadyOffPizza = zoneEmployees.filter(e => alreadyOffIds.has(e.id) && e.pizza_capable).length;
      const alreadyOffPasta = zoneEmployees.filter(e => alreadyOffIds.has(e.id) && e.pasta_capable).length;

      const remainingPizza = totalPizza - alreadyOffPizza - (employee.pizza_capable ? 1 : 0);
      const remainingPasta = totalPasta - alreadyOffPasta - (employee.pasta_capable ? 1 : 0);

      if (remainingPizza < condition.min_pizza_capable) {
        return { approved: false, reason: `피자 가능 인원이 부족합니다 (최소 ${condition.min_pizza_capable}명 필요, 현재 ${remainingPizza}명).` };
      }
      if (remainingPasta < condition.min_pasta_capable) {
        return { approved: false, reason: `파스타 가능 인원이 부족합니다 (최소 ${condition.min_pasta_capable}명 필요, 현재 ${remainingPasta}명).` };
      }
    }

    if (zone === 'hall') {
      const totalFulltime = zoneEmployees.filter(e => e.employment_type === 'fulltime').length;
      const totalParttime = zoneEmployees.filter(e => e.employment_type === 'parttime').length;
      const alreadyOffFulltime = zoneEmployees.filter(e => alreadyOffIds.has(e.id) && e.employment_type === 'fulltime').length;
      const alreadyOffParttime = zoneEmployees.filter(e => alreadyOffIds.has(e.id) && e.employment_type === 'parttime').length;

      const remainingFulltime = totalFulltime - alreadyOffFulltime - (employee.employment_type === 'fulltime' ? 1 : 0);
      const remainingParttime = totalParttime - alreadyOffParttime - (employee.employment_type === 'parttime' ? 1 : 0);

      if (remainingFulltime < condition.min_fulltime) {
        return { approved: false, reason: `홀 정직원이 부족합니다 (최소 ${condition.min_fulltime}명 필요).` };
      }
      if (remainingParttime < condition.min_parttime) {
        return { approved: false, reason: `홀 파트타임이 부족합니다 (최소 ${condition.min_parttime}명 필요).` };
      }
    }
  }

  return { approved: true, reason: null };
}

if (typeof module !== 'undefined') module.exports = { validateDayOffRequest };
