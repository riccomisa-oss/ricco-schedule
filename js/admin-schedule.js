// KOREAN_HOLIDAYS, isHolidayOrWeekend → calendar.js로 이전

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
          const wkOffLabel = emp.employment_type === 'fulltime'
            ? `<div style="font-size:10px;color:#1565c0;margin-top:2px;">주말휴 ${wkOff}일</div>`
            : '';
          return `<tr style="${borderTop ? 'border-top:2px solid var(--olive);' : ''}border-bottom:1px solid var(--light);">
            <td style="white-space:nowrap;padding:6px 10px;border-right:2px solid var(--light);background:var(--white);position:sticky;left:0;z-index:1;">
              <div style="font-size:10px;color:var(--gray);">${isHall ? '홀' : '주방'}</div>
              <div style="font-size:13px;font-weight:600;">${emp.name}</div>
              ${wkOffLabel}
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
            <div style="border:1px solid var(--light);border-radius:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;">
              <table style="border-collapse:collapse;width:max-content;min-width:100%;">
                <thead>
                  <tr style="background:var(--olive);color:var(--white);">
                    <th style="min-width:72px;padding:6px 10px;text-align:left;font-size:12px;position:sticky;left:0;background:var(--olive);z-index:2;">직원</th>
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
          ${viewMode==='edit' ? `
            <button class="btn btn-ghost" id="auto-assign-btn">★ 자동 배정</button>
            <button class="btn btn-ghost" id="annual-leave-btn">연차 입력</button>
          ` : ''}
          <button class="btn ${isPublished ? 'btn-ghost' : 'btn-primary'}" id="publish-btn">
            ${isPublished ? '발행 취소' : '직원에게 발행'}
          </button>
          ${isPublished ? `<button class="btn btn-ghost btn-sm" id="copy-emp-link-btn">🔗 링크 복사</button>` : ''}
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
      <div id="work-summary-section" style="margin-top:24px;"></div>

      <div class="modal-overlay" id="al-modal">
        <div class="modal">
          <h2>연차 입력</h2>
          <div class="form-group">
            <label>직원</label>
            <select id="al-employee">
              ${allEmps.filter(e => e.annual_leave_total != null).map(e => `<option value="${e.id}">${e.name} (${e.role.startsWith('kitchen') ? '주방' : '홀'})</option>`).join('')}
            </select>
            ${allEmps.filter(e => e.annual_leave_total != null).length === 0
              ? '<p style="color:var(--gray);font-size:12px;margin-top:4px;">연차 설정된 직원이 없습니다.</p>'
              : ''}
          </div>
          <div id="al-remaining" style="font-size:12px;margin-bottom:8px;min-height:18px;"></div>
          <div class="form-group">
            <label>날짜</label>
            <input type="date" id="al-date"
              min="${year}-${String(month).padStart(2,'0')}-01"
              max="${new Date(year, month, 0).toISOString().split('T')[0]}" />
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="al-cancel-btn">취소</button>
            <button class="btn btn-primary" id="al-save-btn">저장</button>
          </div>
        </div>
      </div>
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
        await autoAssignShifts({ schedule, kitchenEmps, hallEmps, openCapableEmps, approvedOffDates, conditions, year, month, branchId });
        render();
      });

      // ── 연차 입력 모달 ─────────────────────────────────────
      let alStatsMap = new Map();

      async function openAlModal() {
        document.getElementById('al-modal').classList.add('open');
        const stats = await getAnnualLeaveStats(branchId, year);
        alStatsMap = new Map(stats.map(s => [s.emp.id, s]));
        updateAlRemaining();
      }

      function updateAlRemaining() {
        const empId = document.getElementById('al-employee').value;
        const stat  = alStatsMap.get(empId);
        const el2   = document.getElementById('al-remaining');
        if (stat) {
          const color = stat.remaining <= 0 ? 'var(--red)' : stat.remaining <= 3 ? '#e65100' : 'var(--olive)';
          el2.innerHTML = `잔여 <strong style="color:${color};">${stat.remaining}일</strong>
            <span style="color:var(--gray);">&nbsp;(총 ${stat.total}일 중 ${stat.used}일 사용)</span>`;
        } else {
          el2.innerHTML = '<span style="color:var(--gray);">연차 미설정 직원</span>';
        }
      }

      document.getElementById('annual-leave-btn').addEventListener('click', openAlModal);
      document.getElementById('al-employee').addEventListener('change', updateAlRemaining);
      document.getElementById('al-cancel-btn').addEventListener('click', () => {
        document.getElementById('al-modal').classList.remove('open');
      });

      document.getElementById('al-save-btn').addEventListener('click', async () => {
        const empId = document.getElementById('al-employee').value;
        const date  = document.getElementById('al-date').value;
        if (!date) return alert('날짜를 선택하세요.');

        const already = requests.find(r => r.employee_id === empId && r.date === date
          && ['approved','override_approved'].includes(r.status));
        if (already) return alert('해당 날짜에 이미 승인된 휴무가 있습니다.');

        const stat = alStatsMap.get(empId);
        if (stat && stat.remaining <= 0) {
          if (!confirm('연차 잔여일이 없습니다. 그래도 입력하시겠습니까?')) return;
        }

        try {
          await createDayOffRequest({ employeeId: empId, date, type: 'annual', status: 'override_approved' });
          document.getElementById('al-modal').classList.remove('open');
          render();
        } catch (err) {
          alert('저장 실패: ' + (err.message || err));
        }
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

    if (isPublished && document.getElementById('copy-emp-link-btn')) {
      document.getElementById('copy-emp-link-btn').addEventListener('click', () => {
        const url = `${window.location.origin}/employee?branch=${branchId}`;
        navigator.clipboard.writeText(url).then(() => {
          document.getElementById('copy-emp-link-btn').textContent = '✅ 복사됨!';
          setTimeout(() => {
            const btn = document.getElementById('copy-emp-link-btn');
            if (btn) btn.textContent = '🔗 링크 복사';
          }, 2000);
        });
      });
    }

    // 월 근무일수 요약 비동기 렌더링
    getScheduleEntries(schedule.id).then(allEntries => {
      const summarySection = document.getElementById('work-summary-section');
      if (!summarySection) return;
      const allEmps = [...kitchenEmps, ...hallEmps];
      if (allEmps.length === 0) return;

      const rows = allEmps.map(emp => {
        const empEntries = allEntries.filter(e => e.employee_id === emp.id);
        const workDays = empEntries.filter(e => e.shift_type !== 'off').length;
        const offDays  = empEntries.filter(e => e.shift_type === 'off').length;
        return { emp, workDays, offDays };
      });

      summarySection.innerHTML = `
        <h3 style="margin-bottom:12px;">월 근무일수 요약 (${year}년 ${month}월)</h3>
        <div class="card" style="padding:0;">
          <table class="data-table">
            <thead>
              <tr><th>이름</th><th>역할</th><th style="text-align:center;">근무일</th><th style="text-align:center;">휴무일</th></tr>
            </thead>
            <tbody>
              ${rows.map(({ emp, workDays, offDays }) => `
                <tr>
                  <td>${emp.name}</td>
                  <td style="font-size:12px;color:var(--gray);">${emp.role.startsWith('kitchen') ? '주방' : '홀'} ${emp.employment_type === 'fulltime' ? '정직원' : '파트'}</td>
                  <td style="text-align:center;font-weight:700;">${workDays}일</td>
                  <td style="text-align:center;color:var(--gray);">${offDays}일</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    }).catch(() => {});

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

  const OFF_PER_WEEK = 2; // 1주에 2일 휴무
  const N = emps.length;
  const pfx = `${year}-${String(month).padStart(2,'0')}`;

  // 달력 주(일~토) 단위로 분리
  const weeks = [];
  let currentWeek = [];
  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(d);
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 6 || d === daysInMonth) { weeks.push([...currentWeek]); currentWeek = []; }
  }

  // 월간 목표 = 주별 합산
  const monthlyTarget = weeks.reduce((sum, w) =>
    sum + Math.round(w.length * OFF_PER_WEEK / 7), 0);

  function weeklyOffs(empId, weekDays) {
    return weekDays.filter(d => {
      const ds = `${pfx}-${String(d).padStart(2,'0')}`;
      return approvedOffDates.get(empId)?.has(ds) || autoOff.get(empId).has(ds);
    }).length;
  }

  function monthlyOffs(empId) {
    let n = autoOff.get(empId).size;
    approvedOffDates.get(empId)?.forEach(d => { if (d.startsWith(pfx)) n++; });
    return n;
  }

  function alreadyOff(dateStr) {
    return emps.filter(e =>
      approvedOffDates.get(e.id)?.has(dateStr) || autoOff.get(e.id).has(dateStr)
    ).length;
  }

  function canOff(empId, dateStr) {
    if (approvedOffDates.get(empId)?.has(dateStr)) return false;
    if (autoOff.get(empId).has(dateStr)) return false;
    // 정직원 최소 1명 출근 보장
    if (fullTimeIds.size > 0 && fullTimeIds.has(empId)) {
      const offFt = emps.filter(e =>
        fullTimeIds.has(e.id) &&
        (approvedOffDates.get(e.id)?.has(dateStr) || autoOff.get(e.id).has(dateStr))
      ).length;
      if (offFt + 1 >= fullTimeIds.size) return false;
    }
    return true;
  }

  // Phase 1: 주 단위 배정 — 매주 직원별 2일 휴무 확보
  weeks.forEach((week, weekIdx) => {
    const weekTarget = Math.round(week.length * OFF_PER_WEEK / 7); // 전체주=2, 짧은 부분주=1
    // 주마다 시작 직원을 순환하여 공평하게
    const rotated = [...emps.slice(weekIdx % N), ...emps.slice(0, weekIdx % N)];

    rotated.forEach(emp => {
      const alreadyThisWeek = weeklyOffs(emp.id, week);
      const needed = Math.max(0, weekTarget - alreadyThisWeek);
      let assigned = 0;

      // 평일 우선 → 주말 순서로 시도 (공휴일 포함 주말은 나중에)
      const sorted = [...week].sort((a, b) => {
        const aW = isHolidayOrWeekend(year, month, a) ? 1 : 0;
        const bW = isHolidayOrWeekend(year, month, b) ? 1 : 0;
        return aW - bW;
      });

      for (const d of sorted) {
        if (assigned >= needed) break;
        const dateStr = `${pfx}-${String(d).padStart(2,'0')}`;
        const isWeekend = isHolidayOrWeekend(year, month, d);
        const maxOff = N - (isWeekend ? weekendMin : weekdayMin);
        if (!canOff(emp.id, dateStr)) continue;
        if (alreadyOff(dateStr) >= maxOff) continue;
        autoOff.get(emp.id).add(dateStr);
        assigned++;
      }
    });
  });

  // Phase 2: 월간 목표 미달 직원 보충 (주 배정에서 못 채운 경우)
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${pfx}-${String(day).padStart(2,'0')}`;
    const isWeekend = isHolidayOrWeekend(year, month, day);
    const maxOff = N - (isWeekend ? weekendMin : weekdayMin);
    const available = maxOff - alreadyOff(dateStr);
    if (available <= 0) continue;

    const eligible = emps
      .filter(e => canOff(e.id, dateStr) && monthlyOffs(e.id) < monthlyTarget)
      .sort((a, b) => monthlyOffs(a.id) - monthlyOffs(b.id));

    eligible.slice(0, available).forEach(e => autoOff.get(e.id).add(dateStr));
  }

  // Phase 3: 연속 근무 5일 초과 방지 — 강제 휴무 삽입
  const MAX_CONSECUTIVE = 5;
  for (const emp of emps) {
    let streak = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${pfx}-${String(day).padStart(2,'0')}`;
      const isEmpOff = approvedOffDates.get(emp.id)?.has(dateStr) || autoOff.get(emp.id).has(dateStr);
      if (isEmpOff) { streak = 0; continue; }
      streak++;
      if (streak <= MAX_CONSECUTIVE) continue;

      const isWeekend = isHolidayOrWeekend(year, month, day);
      const maxOff = N - (isWeekend ? weekendMin : weekdayMin);
      if (alreadyOff(dateStr) >= maxOff) continue;
      if (!canOff(emp.id, dateStr)) continue;
      autoOff.get(emp.id).add(dateStr);
      streak = 0;
    }
  }

  return autoOff;
}

// ── 전체 자동 배정 ────────────────────────────────────────
async function autoAssignShifts({ schedule, kitchenEmps, hallEmps, openCapableEmps, approvedOffDates, conditions, year, month, branchId }) {
  const daysInMonth = new Date(year, month, 0).getDate();

  const kitchenWeekdayMin = conditions.find(c => c.zone === 'kitchen' && c.day_type === 'weekday')?.min_total || 3;
  const kitchenWeekendMin = conditions.find(c => c.zone === 'kitchen' && c.day_type === 'weekend')?.min_total || 4;
  const hallWeekdayMin    = conditions.find(c => c.zone === 'hall'    && c.day_type === 'weekday')?.min_total || 2;
  const hallWeekendMin    = conditions.find(c => c.zone === 'hall'    && c.day_type === 'weekend')?.min_total || 3;

  const hallFullTimeIds = new Set(hallEmps.filter(e => e.employment_type === 'fulltime').map(e => e.id));

  const kitchenAutoOff = assignZoneOff(kitchenEmps, approvedOffDates, daysInMonth, year, month, kitchenWeekdayMin, kitchenWeekendMin);
  const hallAutoOff    = assignZoneOff(hallEmps,    approvedOffDates, daysInMonth, year, month, hallWeekdayMin,    hallWeekendMin, hallFullTimeIds);

  // ── 초과 인원 강제 휴무 + 연차 자동 배정 ──────────────────
  // 최소 인원 = 최대 근무 인원. 초과분은 off, 연차 있으면 연차로 처리.
  const annualStats = await getAnnualLeaveStats(branchId, year);
  const alRemainingMap     = new Map(annualStats.map(s => [s.emp.id, s.remaining]));
  const alAssignedThisRun  = new Map([...kitchenEmps, ...hallEmps].map(e => [e.id, 0]));
  const annualLeaveToCreate = [];

  const zones = [
    { zoneEmps: kitchenEmps, zoneAutoOff: kitchenAutoOff, wdMin: kitchenWeekdayMin, weMin: kitchenWeekendMin, ftIds: new Set() },
    { zoneEmps: hallEmps,    zoneAutoOff: hallAutoOff,    wdMin: hallWeekdayMin,    weMin: hallWeekendMin,    ftIds: hallFullTimeIds },
  ];

  for (const { zoneEmps, zoneAutoOff, wdMin, weMin, ftIds } of zones) {
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr  = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isWeekend = isHolidayOrWeekend(year, month, day);
      const maxWork  = isWeekend ? weMin : wdMin;

      const working = zoneEmps.filter(e =>
        !approvedOffDates.get(e.id)?.has(dateStr) &&
        !zoneAutoOff.get(e.id)?.has(dateStr)
      );
      const excess = working.length - maxWork;
      if (excess <= 0) continue;

      // 연차 잔여 있는 직원 우선, 그다음 파트타이머, 마지막으로 off가 적은 순
      const candidates = [...working].sort((a, b) => {
        const aAL = (alRemainingMap.get(a.id) || 0) - (alAssignedThisRun.get(a.id) || 0) > 0;
        const bAL = (alRemainingMap.get(b.id) || 0) - (alAssignedThisRun.get(b.id) || 0) > 0;
        if (aAL !== bAL) return bAL - aAL;
        const aFt = ftIds.has(a.id) ? 1 : 0;
        const bFt = ftIds.has(b.id) ? 1 : 0;
        if (aFt !== bFt) return aFt - bFt;
        return (zoneAutoOff.get(a.id)?.size || 0) - (zoneAutoOff.get(b.id)?.size || 0);
      });

      const forcedOff = new Set();
      let forced = 0;
      for (const emp of candidates) {
        if (forced >= excess) break;
        if (ftIds.has(emp.id)) {
          const remainFt = working.filter(e =>
            ftIds.has(e.id) && e.id !== emp.id && !forcedOff.has(e.id)
          ).length;
          if (remainFt === 0) continue;
        }
        zoneAutoOff.get(emp.id).add(dateStr);
        forcedOff.add(emp.id);
        forced++;

        // 연차 잔여 있으면 연차로 기록
        const alLeft = (alRemainingMap.get(emp.id) || 0) - (alAssignedThisRun.get(emp.id) || 0);
        if (alLeft > 0 && !approvedOffDates.get(emp.id)?.has(dateStr)) {
          annualLeaveToCreate.push({ employeeId: emp.id, date: dateStr });
          alAssignedThisRun.set(emp.id, (alAssignedThisRun.get(emp.id) || 0) + 1);
        }
      }
    }
  }

  // 연차 요청 일괄 생성 (중복은 조용히 무시)
  await Promise.all(
    annualLeaveToCreate.map(({ employeeId, date }) =>
      createDayOffRequest({ employeeId, date, type: 'annual', status: 'override_approved' }).catch(() => {})
    )
  );

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
