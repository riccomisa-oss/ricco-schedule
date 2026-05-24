// ── 한국 공휴일 (토·일 외 공휴일/대체공휴일 포함) ──────────
const KOREAN_HOLIDAYS = {
  2025: new Set([
    '2025-01-01', // 신정
    '2025-01-28', // 설날 연휴
    '2025-01-29', // 설날
    '2025-01-30', // 설날 연휴
    '2025-03-01', // 삼일절
    '2025-05-05', // 어린이날
    '2025-05-06', // 대체공휴일 (부처님오신날·어린이날 겹침)
    '2025-06-06', // 현충일
    '2025-08-15', // 광복절
    '2025-10-03', // 개천절
    '2025-10-05', // 추석 연휴
    '2025-10-06', // 추석
    '2025-10-07', // 추석 연휴
    '2025-10-08', // 대체공휴일
    '2025-10-09', // 한글날
    '2025-12-25', // 크리스마스
  ]),
  2026: new Set([
    '2026-01-01', // 신정
    '2026-02-16', // 설날 연휴
    '2026-02-17', // 설날
    '2026-02-18', // 설날 연휴
    '2026-03-01', // 삼일절 (일요일)
    '2026-03-02', // 대체공휴일
    '2026-05-05', // 어린이날
    '2026-05-24', // 부처님오신날 (일요일)
    '2026-05-25', // 대체공휴일
    '2026-06-06', // 현충일
    '2026-08-15', // 광복절 (토요일)
    '2026-08-17', // 대체공휴일
    '2026-09-24', // 추석 연휴
    '2026-09-25', // 추석
    '2026-09-26', // 추석 연휴 (토요일)
    '2026-09-28', // 대체공휴일
    '2026-10-03', // 개천절 (토요일)
    '2026-10-05', // 대체공휴일
    '2026-10-09', // 한글날
    '2026-12-25', // 크리스마스
  ]),
};

function isHolidayOrWeekend(year, month, day) {
  const dow = new Date(year, month - 1, day).getDay();
  if (dow === 0 || dow === 6) return true;
  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return KOREAN_HOLIDAYS[year]?.has(dateStr) ?? false;
}

async function renderScheduleTab(branchId) {
  const el = document.getElementById('schedule');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let viewMode = 'edit';

  async function render() {
    const [employees, conditions] = await Promise.all([
      getEmployees(branchId),
      getConditions(branchId),
    ]);
    const schedule = await getOrCreateSchedule(branchId, year, month);
    const [entries, requests] = await Promise.all([
      getScheduleEntries(schedule.id),
      getDayOffRequests(branchId, year, month),
    ]);

    const approvedOffDates = new Map();
    requests
      .filter(r => ['approved', 'override_approved'].includes(r.status))
      .forEach(r => {
        if (!approvedOffDates.has(r.employee_id)) approvedOffDates.set(r.employee_id, new Set());
        approvedOffDates.get(r.employee_id).add(r.date);
      });

    const entryMap = new Map();
    entries.forEach(e => { entryMap.set(`${e.employee_id}_${e.date}`, e); });

    const isPublished = !!schedule.published_at;
    const kitchenEmps = employees.filter(e => e.role.startsWith('kitchen'));
    const hallEmps    = employees.filter(e => e.role.startsWith('hall'));
    const allEmps     = [...kitchenEmps, ...hallEmps];
    const openCapableEmps = kitchenEmps.filter(e => e.open_capable);
    const daysInMonth = new Date(year, month, 0).getDate();

    const SHIFT_COLORS = {
      open:       { bg: '#e8f5e9', color: '#2e7d32', label: '오픈' },
      close:      { bg: '#e3f2fd', color: '#1565c0', label: '마감' },
      hall_fixed: { bg: '#f3e5f5', color: '#6a1b9a', label: '홀'   },
      off:        { bg: '#f5f5f5', color: '#9e9e9e', label: '휴무' },
    };

    const DAY_NAMES = ['일','월','화','수','목','금','토'];

    function renderPreview() {
      const pfx = `${year}-${String(month).padStart(2,'0')}`;

      // 일요일 기준으로 주 분리
      const weeks = [];
      let week = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        if (dow === 0 && week.length) { weeks.push(week); week = []; }
        week.push({ d, dow });
      }
      if (week.length) weeks.push(week);

      function shiftCell(emp, d) {
        const dateStr = `${pfx}-${String(d).padStart(2,'0')}`;
        if (approvedOffDates.get(emp.id)?.has(dateStr)) {
          return `<td style="background:#fff3e0;text-align:center;padding:6px 2px;">
            <span style="font-size:12px;color:#e65100;font-weight:600;">휴신청</span></td>`;
        }
        const entry = entryMap.get(`${emp.id}_${dateStr}`);
        const shift = entry?.shift_type;
        if (!shift) return `<td style="text-align:center;color:#ddd;">—</td>`;
        const s = SHIFT_COLORS[shift] || {};
        return `<td style="background:${s.bg};text-align:center;padding:6px 2px;">
          <span style="font-size:13px;color:${s.color};font-weight:700;">${s.label}</span></td>`;
      }

      // 직원별 월간 주말·공휴일 휴무 총계 (승인 휴무 신청 + 배정 off 포함)
      const monthlyWeekendOff = new Map();
      allEmps.forEach(emp => {
        let count = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          if (!isHolidayOrWeekend(year, month, d)) continue;
          const dateStr = `${pfx}-${String(d).padStart(2,'0')}`;
          const isOff = approvedOffDates.get(emp.id)?.has(dateStr) ||
            entryMap.get(`${emp.id}_${dateStr}`)?.shift_type === 'off';
          if (isOff) count++;
        }
        monthlyWeekendOff.set(emp.id, count);
      });

      const weekCards = weeks.map((days, wi) => {
        const first = days[0], last = days[days.length - 1];
        const range = `${month}/${first.d}(${DAY_NAMES[first.dow]}) ~ ${month}/${last.d}(${DAY_NAMES[last.dow]})`;

        const thCells = days.map(({ d, dow }) => {
          const dateStr = `${pfx}-${String(d).padStart(2,'0')}`;
          const isHoliday = KOREAN_HOLIDAYS[year]?.has(dateStr);
          const color = (dow === 0 || isHoliday) ? '#c62828' : dow === 6 ? '#1565c0' : '#fff';
          return `<th style="min-width:52px;text-align:center;padding:6px 4px;">
            <div style="font-size:11px;font-weight:400;opacity:.85;">${DAY_NAMES[dow]}</div>
            <div style="font-size:17px;font-weight:700;color:${color};">${d}</div>
          </th>`;
        }).join('');

        function empRow(emp, borderTop) {
          const isHall = emp.role.startsWith('hall');
          const cells = days.map(({ d }) => shiftCell(emp, d)).join('');
          const wkOff = monthlyWeekendOff.get(emp.id) || 0;
          return `<tr style="${borderTop ? 'border-top:2px solid var(--olive);' : ''}border-bottom:1px solid var(--light);">
            <td style="white-space:nowrap;padding:6px 10px;border-right:2px solid var(--light);background:var(--white);">
              <div style="font-size:10px;color:var(--gray);">${isHall ? '홀' : '주방'}</div>
              <div style="font-size:13px;font-weight:600;">${emp.name}</div>
              <div style="font-size:10px;color:#1565c0;margin-top:2px;">주말휴 ${wkOff}일</div>
            </td>
            ${cells}
          </tr>`;
        }

        const kitchenRows = kitchenEmps.map(e => empRow(e, false)).join('');
        const hallRows    = hallEmps.map((e, i) => empRow(e, i === 0)).join('');

        return `
          <div style="margin-bottom:28px;">
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px;">
              <span style="font-size:15px;font-weight:700;">${wi + 1}주차</span>
              <span style="font-size:13px;color:var(--gray);">${range}</span>
            </div>
            <div style="border:1px solid var(--light);border-radius:8px;overflow:hidden;">
              <table style="border-collapse:collapse;width:100%;">
                <thead>
                  <tr style="background:var(--olive);color:var(--white);">
                    <th style="min-width:72px;padding:6px 10px;text-align:left;font-size:12px;">직원</th>
                    ${thCells}
                  </tr>
                </thead>
                <tbody>${kitchenRows}${hallRows}</tbody>
              </table>
            </div>
          </div>`;
      }).join('');

      return weekCards + `
        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;">
          ${Object.values(SHIFT_COLORS).map(s =>
            `<span style="background:${s.bg};color:${s.color};border-radius:3px;padding:2px 8px;font-weight:600;">${s.label}</span>`
          ).join('')}
          <span style="background:#fff3e0;color:#e65100;border-radius:3px;padding:2px 8px;">휴신청(승인)</span>
        </div>`;
    }

    function renderCell(date) {
      let cellHtml = '';
      allEmps.forEach(emp => {
        const isOff = approvedOffDates.get(emp.id)?.has(date);
        const entry = entryMap.get(`${emp.id}_${date}`);
        const currentShift = entry?.shift_type || '';
        const isHall = emp.role.startsWith('hall');

        if (isOff) {
          cellHtml += `<div class="shift-chip off" style="font-size:10px;">${emp.name} 휴</div>`;
          return;
        }
        if (isHall) {
          cellHtml += `
            <select class="shift-select" data-emp="${emp.id}" data-date="${date}"
              style="font-size:10px;width:100%;margin:1px 0;border:1px solid var(--light);border-radius:3px;padding:1px;">
              <option value="">— ${emp.name}</option>
              <option value="hall_fixed" ${currentShift==='hall_fixed'?'selected':''}>홀 고정</option>
              <option value="off" ${currentShift==='off'?'selected':''}>휴무</option>
            </select>`;
        } else {
          const openMark = emp.open_capable ? ' ★' : '';
          cellHtml += `
            <select class="shift-select" data-emp="${emp.id}" data-date="${date}"
              style="font-size:10px;width:100%;margin:1px 0;border:1px solid var(--light);border-radius:3px;padding:1px;${currentShift==='open'?'background:#e8f5e9;':''}">
              <option value="">— ${emp.name}${openMark}</option>
              <option value="open"  ${currentShift==='open' ?'selected':''}>오픈</option>
              <option value="close" ${currentShift==='close'?'selected':''}>마감</option>
              <option value="off"   ${currentShift==='off'  ?'selected':''}>휴무</option>
            </select>`;
        }
      });
      return cellHtml;
    }

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <h2>스케줄 편집</h2>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="prev-month-sched">◀</button>
          <span style="font-weight:600;">${year}년 ${month}월</span>
          <button class="btn btn-ghost btn-sm" id="next-month-sched">▶</button>
          <button class="btn ${viewMode==='preview' ? 'btn-primary' : 'btn-ghost'}" id="toggle-view-btn">
            ${viewMode==='preview' ? '✏️ 편집 모드' : '📋 미리보기'}
          </button>
          ${viewMode==='edit' ? `<button class="btn btn-ghost" id="auto-assign-btn">★ 자동 배정</button>` : ''}
          <button class="btn ${isPublished ? 'btn-ghost' : 'btn-primary'}" id="publish-btn">
            ${isPublished ? '발행 취소' : '직원에게 발행'}
          </button>
        </div>
      </div>
      <div id="schedule-body">
        ${viewMode === 'preview'
          ? renderPreview()
          : `<p style="font-size:12px;color:var(--gray);margin-bottom:12px;">
               ★ = 오픈 가능 직원 &nbsp;|&nbsp; 오픈 시 연두색
             </p>
             <div style="overflow-x:auto;">${buildCalendarHTML(year, month, renderCell)}</div>`
        }
      </div>
      <div id="annual-leave-section" style="margin-top:24px;"></div>
    `;

    document.getElementById('toggle-view-btn').addEventListener('click', () => {
      viewMode = viewMode === 'edit' ? 'preview' : 'edit';
      render();
    });

    if (viewMode === 'edit') {
      document.querySelectorAll('.shift-select').forEach(sel => {
        sel.addEventListener('change', async () => {
          const val = sel.value;
          if (!val) return;
          await upsertScheduleEntry({ scheduleId: schedule.id, employeeId: sel.dataset.emp, date: sel.dataset.date, shiftType: val });
          sel.style.background = val === 'open' ? '#e8f5e9' : '';
        });
      });

      document.getElementById('auto-assign-btn').addEventListener('click', async () => {
        if (openCapableEmps.length === 0) {
          alert('오픈 가능 직원이 없습니다.\n직원 관리 탭에서 주방 직원의 "오픈 가능" 버튼을 설정해주세요.');
          return;
        }
        if (!confirm(`${year}년 ${month}월 전체 시프트를 자동 배정할까요?\n• 오픈/마감/홀고정 배정\n• 휴무 자동 분배 (최소 인원 유지)\n\n기존 배정이 모두 덮어씌워집니다.`)) return;
        await autoAssignShifts({ schedule, kitchenEmps, hallEmps, openCapableEmps, approvedOffDates, conditions, year, month });
        render();
      });
    }

    document.getElementById('prev-month-sched').addEventListener('click', () => {
      ({ year, month } = prevMonth(year, month)); render();
    });
    document.getElementById('next-month-sched').addEventListener('click', () => {
      ({ year, month } = nextMonth(year, month)); render();
    });
    document.getElementById('publish-btn').addEventListener('click', async () => {
      if (isPublished) await unpublishSchedule(schedule.id);
      else await publishSchedule(schedule.id);
      render();
    });

    // 연차 현황 비동기 렌더링
    getAnnualLeaveStats(branchId, year).then(stats => {
      const section = document.getElementById('annual-leave-section');
      if (!section) return;
      if (stats.length === 0) { section.innerHTML = ''; return; }
      section.innerHTML = `
        <h3 style="margin-bottom:12px;">연차 현황 (${year}년)</h3>
        <div class="card" style="padding:0;">
          <table class="data-table">
            <thead>
              <tr><th>이름</th><th>역할</th><th style="text-align:center;">총 연차</th><th style="text-align:center;">사용</th><th style="text-align:center;">잔여</th></tr>
            </thead>
            <tbody>
              ${stats.map(({ emp, total, used, remaining }) => `
                <tr>
                  <td>${emp.name}</td>
                  <td style="font-size:12px;color:var(--gray);">${ROLE_LABELS[emp.role]}</td>
                  <td style="text-align:center;">${total}일</td>
                  <td style="text-align:center;">${used}일</td>
                  <td style="text-align:center;">
                    <span style="font-weight:700;color:${remaining < 0 ? 'var(--red)' : remaining <= 3 ? '#e65100' : 'var(--olive)'};">
                      ${remaining}일
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    }).catch(() => {});
  }

  await render();
}

// ── 구역별 휴무 자동 분배 ─────────────────────────────────
function assignZoneOff(emps, approvedOffDates, daysInMonth, year, month, weekdayMin, weekendMin, fullTimeIds = new Set()) {
  if (emps.length === 0) return new Map();

  const autoOff = new Map();
  emps.forEach(e => autoOff.set(e.id, new Set()));

  const TARGET_OFF = 8;
  const MAX_WEEKEND_OFF = 2;
  const N = emps.length;
  const pfx = `${year}-${String(month).padStart(2,'0')}`;

  function weekendOffs(empId) {
    let n = 0;
    autoOff.get(empId).forEach(d => {
      const [y, m, dd] = d.split('-').map(Number);
      if (isHolidayOrWeekend(y, m, dd)) n++;
    });
    approvedOffDates.get(empId)?.forEach(d => {
      if (d.startsWith(pfx)) {
        const [y, m, dd] = d.split('-').map(Number);
        if (isHolidayOrWeekend(y, m, dd)) n++;
      }
    });
    return n;
  }

  function monthlyOffs(empId) {
    let n = autoOff.get(empId).size;
    approvedOffDates.get(empId)?.forEach(d => { if (d.startsWith(pfx)) n++; });
    return n;
  }

  function alreadyOff(dateStr) {
    return emps.filter(e => approvedOffDates.get(e.id)?.has(dateStr) || autoOff.get(e.id).has(dateStr)).length;
  }

  function canOff(empId, dateStr, isWeekend) {
    if (approvedOffDates.get(empId)?.has(dateStr)) return false;
    if (autoOff.get(empId).has(dateStr)) return false;
    if (monthlyOffs(empId) >= TARGET_OFF) return false;
    if (isWeekend && weekendOffs(empId) >= MAX_WEEKEND_OFF) return false;
    // 정직원 최소 1명 출근 보장: 이 사람이 쉬면 정직원 전원 휴무가 되는 경우 불가
    if (fullTimeIds.size > 0 && fullTimeIds.has(empId)) {
      const offFt = emps.filter(e =>
        fullTimeIds.has(e.id) &&
        (approvedOffDates.get(e.id)?.has(dateStr) || autoOff.get(e.id).has(dateStr))
      ).length;
      if (offFt + 1 >= fullTimeIds.size) return false;
    }
    return true;
  }

  // Phase 1: 순환 배정 — 직원 i는 (i+1)일, (i+1+N)일 … 에 휴무
  // 이렇게 하면 휴무가 월 전체에 고르게 분산됨
  for (let i = 0; i < N; i++) {
    const emp = emps[i];
    for (let day = i + 1; day <= daysInMonth; day += N) {
      const dateStr = `${pfx}-${String(day).padStart(2,'0')}`;
      const isWeekend = isHolidayOrWeekend(year, month, day);
      const maxOff = N - (isWeekend ? weekendMin : weekdayMin);
      if (!canOff(emp.id, dateStr, isWeekend)) continue;
      if (alreadyOff(dateStr) >= maxOff) continue;
      autoOff.get(emp.id).add(dateStr);
    }
  }

  // Phase 2: 목표(8일) 미달 직원 보충 — 남은 슬롯에 그리디로 채움
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${pfx}-${String(day).padStart(2,'0')}`;
    const isWeekend = isHolidayOrWeekend(year, month, day);
    const maxOff = N - (isWeekend ? weekendMin : weekdayMin);
    const available = maxOff - alreadyOff(dateStr);
    if (available <= 0) continue;

    const eligible = emps
      .filter(e => canOff(e.id, dateStr, isWeekend))
      .sort((a, b) => monthlyOffs(a.id) - monthlyOffs(b.id));

    eligible.slice(0, available).forEach(e => autoOff.get(e.id).add(dateStr));
  }

  // Phase 3: 연속 근무 5일 초과 방지 — 월간 목표 무시하고 강제 휴무 삽입
  const MAX_CONSECUTIVE = 5;
  for (const emp of emps) {
    let streak = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${pfx}-${String(day).padStart(2,'0')}`;
      const isEmpOff = approvedOffDates.get(emp.id)?.has(dateStr) || autoOff.get(emp.id).has(dateStr);
      if (isEmpOff) { streak = 0; continue; }
      streak++;
      if (streak <= MAX_CONSECUTIVE) continue;

      // 6번째 연속 근무일 → 휴무 강제 삽입 시도
      const isWeekend = isHolidayOrWeekend(year, month, day);
      const maxOff = N - (isWeekend ? weekendMin : weekdayMin);
      if (alreadyOff(dateStr) >= maxOff) continue; // 최소 인원 미달이면 포기
      if (isWeekend && weekendOffs(emp.id) >= MAX_WEEKEND_OFF) continue;
      if (fullTimeIds.size > 0 && fullTimeIds.has(emp.id)) {
        const offFt = emps.filter(e =>
          fullTimeIds.has(e.id) &&
          (approvedOffDates.get(e.id)?.has(dateStr) || autoOff.get(e.id).has(dateStr))
        ).length;
        if (offFt + 1 >= fullTimeIds.size) continue;
      }
      autoOff.get(emp.id).add(dateStr);
      streak = 0;
    }
  }

  return autoOff;
}

// ── 전체 자동 배정 ────────────────────────────────────────
async function autoAssignShifts({ schedule, kitchenEmps, hallEmps, openCapableEmps, approvedOffDates, conditions, year, month }) {
  const daysInMonth = new Date(year, month, 0).getDate();

  const kitchenWeekdayMin = conditions.find(c => c.zone === 'kitchen' && c.day_type === 'weekday')?.min_total || 3;
  const kitchenWeekendMin = conditions.find(c => c.zone === 'kitchen' && c.day_type === 'weekend')?.min_total || 4;
  const hallWeekdayMin    = conditions.find(c => c.zone === 'hall'    && c.day_type === 'weekday')?.min_total || 2;
  const hallWeekendMin    = conditions.find(c => c.zone === 'hall'    && c.day_type === 'weekend')?.min_total || 3;

  const hallFullTimeIds = new Set(hallEmps.filter(e => e.employment_type === 'fulltime').map(e => e.id));

  const kitchenAutoOff = assignZoneOff(kitchenEmps, approvedOffDates, daysInMonth, year, month, kitchenWeekdayMin, kitchenWeekendMin);
  const hallAutoOff    = assignZoneOff(hallEmps,    approvedOffDates, daysInMonth, year, month, hallWeekdayMin,    hallWeekendMin, hallFullTimeIds);

  // 홀 최대 3인 초과 날은 추가 휴무 강제 배정
  const MAX_HALL_WORKERS = 3;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const working = hallEmps.filter(e =>
      !approvedOffDates.get(e.id)?.has(dateStr) &&
      !hallAutoOff.get(e.id)?.has(dateStr)
    );
    const excess = working.length - MAX_HALL_WORKERS;
    if (excess <= 0) continue;

    // 파트타이머 우선, 동순위면 이미 off가 적은 쪽 (많이 일한 쪽에 휴무)
    const candidates = [...working].sort((a, b) => {
      const aFt = hallFullTimeIds.has(a.id) ? 1 : 0;
      const bFt = hallFullTimeIds.has(b.id) ? 1 : 0;
      if (aFt !== bFt) return aFt - bFt;
      return (hallAutoOff.get(a.id)?.size || 0) - (hallAutoOff.get(b.id)?.size || 0);
    });

    const forcedOff = new Set();
    let forced = 0;
    for (const emp of candidates) {
      if (forced >= excess) break;
      if (hallFullTimeIds.has(emp.id)) {
        const remainingFt = working.filter(e =>
          hallFullTimeIds.has(e.id) && e.id !== emp.id && !forcedOff.has(e.id)
        ).length;
        if (remainingFt === 0) continue; // 정직원 마지막 1명은 건드리지 않음
      }
      hallAutoOff.get(emp.id).add(dateStr);
      forcedOff.add(emp.id);
      forced++;
    }
  }

  function isOff(emp, dateStr) {
    return approvedOffDates.get(emp.id)?.has(dateStr)
        || kitchenAutoOff.get(emp.id)?.has(dateStr)
        || hallAutoOff.get(emp.id)?.has(dateStr);
  }

  const upserts = [];
  const openQueue = [...openCapableEmps];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    // 오픈 담당자 결정 (오픈 가능 + 휴무 아닌 사람 순환)
    let openEmpId = null;
    for (let i = 0; i < openQueue.length; i++) {
      if (!isOff(openQueue[i], dateStr)) {
        openEmpId = openQueue[i].id;
        const [emp] = openQueue.splice(i, 1);
        openQueue.push(emp);
        break;
      }
    }

    for (const emp of kitchenEmps) {
      upserts.push({
        scheduleId: schedule.id,
        employeeId: emp.id,
        date: dateStr,
        shiftType: isOff(emp, dateStr) ? 'off' : (emp.id === openEmpId ? 'open' : 'close'),
      });
    }

    for (const emp of hallEmps) {
      upserts.push({
        scheduleId: schedule.id,
        employeeId: emp.id,
        date: dateStr,
        shiftType: isOff(emp, dateStr) ? 'off' : 'hall_fixed',
      });
    }
  }

  await Promise.all(upserts.map(u => upsertScheduleEntry(u)));
}
