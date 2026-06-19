// KOREAN_HOLIDAYS, isHolidayOrWeekend → calendar.js로 이전

async function renderScheduleTab(branchId) {
  const el = document.getElementById('schedule');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let viewMode = 'edit';

  async function render() {
    const { year: pY, month: pM } = prevMonth(year, month);
    const { year: nY, month: nM } = nextMonth(year, month);

    const [employees, conditions] = await Promise.all([
      getEmployees(branchId),
      getConditions(branchId),
    ]);
    const schedule = await getOrCreateSchedule(branchId, year, month);
    const [entries, requests, prevSched, nextSched] = await Promise.all([
      getScheduleEntries(schedule.id),
      getDayOffRequests(branchId, year, month),
      getScheduleIfExists(branchId, pY, pM),
      getScheduleIfExists(branchId, nY, nM),
    ]);

    const [prevEntries, nextEntries, prevRequests, nextRequests] = await Promise.all([
      prevSched ? getScheduleEntries(prevSched.id) : Promise.resolve([]),
      nextSched ? getScheduleEntries(nextSched.id) : Promise.resolve([]),
      getDayOffRequests(branchId, pY, pM),
      getDayOffRequests(branchId, nY, nM),
    ]);

    const adjEntryMap = new Map();
    [...prevEntries, ...nextEntries].forEach(e => {
      adjEntryMap.set(`${e.employee_id}_${e.date}`, e);
    });

    const adjApprovedOffDates = new Map();
    [...prevRequests, ...nextRequests]
      .filter(r => ['approved', 'override_approved'].includes(r.status) && !(r.type === 'annual' && Number(r.days) === 0.5))
      .forEach(r => {
        if (!adjApprovedOffDates.has(r.employee_id)) adjApprovedOffDates.set(r.employee_id, new Set());
        adjApprovedOffDates.get(r.employee_id).add(r.date);
      });

    const approvedOffDates = new Map();
    requests
      .filter(r => ['approved', 'override_approved'].includes(r.status) && !(r.type === 'annual' && Number(r.days) === 0.5))
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
      const firstDow = new Date(year, month - 1, 1).getDay();
      const lastDow  = new Date(year, month - 1, daysInMonth).getDay();
      const daysInPrevMonth = new Date(pY, pM, 0).getDate();

      // 이전·다음 월 경계 날짜 포함한 전체 표시 날짜 목록
      const allDays = [];
      for (let i = firstDow - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i;
        const dateStr = `${pY}-${String(pM).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        allDays.push({ dateStr, d, dow: new Date(pY, pM - 1, d).getDay(), isAdjacent: true });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${pfx}-${String(d).padStart(2,'0')}`;
        allDays.push({ dateStr, d, dow: new Date(year, month - 1, d).getDay(), isAdjacent: false });
      }
      if (lastDow !== 6) {
        for (let d = 1; d <= 6 - lastDow; d++) {
          const dateStr = `${nY}-${String(nM).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          allDays.push({ dateStr, d, dow: new Date(nY, nM - 1, d).getDay(), isAdjacent: true });
        }
      }

      // 일요일 기준 주 분리
      const weeks = [];
      let week = [];
      for (const dayObj of allDays) {
        if (dayObj.dow === 0 && week.length) { weeks.push(week); week = []; }
        week.push(dayObj);
      }
      if (week.length) weeks.push(week);

      function shiftCell(emp, dateStr, isAdjacent) {
        const em = isAdjacent ? adjEntryMap : entryMap;
        const ao = isAdjacent ? adjApprovedOffDates : approvedOffDates;
        const dim = isAdjacent ? 'opacity:0.45;' : '';
        const entry = em.get(`${emp.id}_${dateStr}`);
        const shift = entry?.shift_type;
        if (shift) {
          const s = SHIFT_COLORS[shift] || {};
          return `<td style="background:${s.bg};text-align:center;padding:6px 2px;${dim}">
            <span style="font-size:13px;color:${s.color};font-weight:700;">${s.label}</span></td>`;
        }
        if (ao.get(emp.id)?.has(dateStr)) {
          return `<td style="background:#fff3e0;text-align:center;padding:6px 2px;${dim}">
            <span style="font-size:12px;color:#e65100;font-weight:600;">휴신청</span></td>`;
        }
        return `<td style="text-align:center;color:#ddd;${dim}">—</td>`;
      }

      // 직원별 월간 주말·공휴일 휴무 총계 (당월 기준)
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

      let weekNum = 0;
      const weekCards = weeks.map((days) => {
        weekNum++;
        const first = days[0], last = days[days.length - 1];
        const fmtDay = ({ d, dow, dateStr }) =>
          `${parseInt(dateStr.split('-')[1])}/${d}(${DAY_NAMES[dow]})`;
        const range = `${fmtDay(first)} ~ ${fmtDay(last)}`;

        const thCells = days.map(({ dateStr, d, dow, isAdjacent }) => {
          const [y2] = dateStr.split('-').map(Number);
          const isHoliday = KOREAN_HOLIDAYS[y2]?.has(dateStr);
          const color = (dow === 0 || isHoliday) ? '#c62828' : dow === 6 ? '#1565c0' : '#fff';
          return `<th style="min-width:52px;text-align:center;padding:6px 4px;${isAdjacent ? 'opacity:0.45;' : ''}">
            <div style="font-size:11px;font-weight:400;opacity:.85;">${DAY_NAMES[dow]}</div>
            <div style="font-size:17px;font-weight:700;color:${color};">${d}</div>
          </th>`;
        }).join('');

        function empRow(emp, borderTop) {
          const isHall = emp.role.startsWith('hall');
          const cells = days.map(({ dateStr, isAdjacent }) => shiftCell(emp, dateStr, isAdjacent)).join('');
          const wkOff = monthlyWeekendOff.get(emp.id) || 0;
          const wkOffLabel = emp.employment_type === 'fulltime'
            ? `<div style="font-size:10px;color:#1565c0;margin-top:2px;">주말휴 ${wkOff}일</div>`
            : '';
          return `<tr style="${borderTop ? 'border-top:2px solid var(--olive);' : ''}border-bottom:1px solid var(--light);">
            <td style="white-space:nowrap;padding:6px 10px;border-right:2px solid var(--light);background:var(--white);position:sticky;left:0;z-index:1;">
              <div style="font-size:10px;color:var(--gray);">${isHall ? '홀' : '주방'}</div>
              <div style="font-size:13px;font-weight:600;">${esc(emp.name)}</div>
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
              <span style="font-size:15px;font-weight:700;">${weekNum}주차</span>
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
          cellHtml += `<div class="shift-chip off" style="font-size:10px;">${esc(emp.name)} 휴</div>`;
          return;
        }
        if (isHall) {
          cellHtml += `
            <select class="shift-select" data-emp="${emp.id}" data-date="${date}"
              style="font-size:10px;width:100%;margin:1px 0;border:1px solid var(--light);border-radius:3px;padding:1px;">
              <option value="">— ${esc(emp.name)}</option>
              <option value="hall_fixed" ${currentShift==='hall_fixed'?'selected':''}>홀 고정</option>
              <option value="off" ${currentShift==='off'?'selected':''}>휴무</option>
            </select>`;
        } else {
          const openMark = emp.open_capable ? ' ★' : '';
          cellHtml += `
            <select class="shift-select" data-emp="${emp.id}" data-date="${date}"
              style="font-size:10px;width:100%;margin:1px 0;border:1px solid var(--light);border-radius:3px;padding:1px;${currentShift==='open'?'background:#e8f5e9;':''}">
              <option value="">— ${esc(emp.name)}${openMark}</option>
              <option value="open"  ${currentShift==='open' ?'selected':''}>오픈</option>
              <option value="close" ${currentShift==='close'?'selected':''}>마감</option>
              <option value="off"   ${currentShift==='off'  ?'selected':''}>휴무</option>
            </select>`;
        }
      });
      return cellHtml;
    }

    function renderOtherCell(dateStr, dayNum) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const isWeekendDay = isHolidayOrWeekend(y, m, d);
      let tdClass = 'other-month';
      if (isWeekendDay) tdClass += ' weekend';

      let html = `<td class="${tdClass}" data-date="${dateStr}" style="opacity:0.45;">`;
      html += `<div class="date-num">${dayNum}</div>`;
      allEmps.forEach(emp => {
        const isOff = adjApprovedOffDates.get(emp.id)?.has(dateStr);
        const entry = adjEntryMap.get(`${emp.id}_${dateStr}`);
        const shift = entry?.shift_type;
        if (isOff || shift === 'off') {
          html += `<div class="shift-chip off" style="font-size:10px;">${esc(emp.name)} 휴</div>`;
        } else if (shift) {
          const s = SHIFT_COLORS[shift] || {};
          html += `<div style="font-size:10px;background:${s.bg};color:${s.color};border-radius:3px;padding:1px 3px;margin:1px 0;">${esc(emp.name)} ${s.label}</div>`;
        }
      });
      html += '</td>';
      return html;
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
             <div style="overflow-x:auto;">${buildCalendarHTML(year, month, renderCell, renderOtherCell)}</div>`
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
              ${allEmps.filter(e => e.hire_date != null).map(e => `<option value="${e.id}">${esc(e.name)} (${e.role.startsWith('kitchen') ? '주방' : '홀'})</option>`).join('')}
            </select>
            ${allEmps.filter(e => e.hire_date != null).length === 0
              ? '<p style="color:var(--gray);font-size:12px;margin-top:4px;">연차 설정된 직원이 없습니다.</p>'
              : ''}
          </div>
          <div id="al-remaining" style="font-size:12px;margin-bottom:8px;min-height:18px;"></div>
          <div class="form-group">
            <label>날짜</label>
            <input type="date" id="al-date"
              min="${year}-${String(month).padStart(2,'0')}-01"
              max="${year}-${String(month).padStart(2,'0')}-${String(new Date(year, month, 0).getDate()).padStart(2,'0')}" />
          </div>
          <div class="form-group">
            <label>단위</label>
            <select id="al-days">
              <option value="1">종일 (1일)</option>
              <option value="0.5">반차 (0.5일)</option>
            </select>
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
        const useDays = Number(document.getElementById('al-days').value) || 1;
        if (!date) return alert('날짜를 선택하세요.');

        const already = requests.find(r => r.employee_id === empId && r.date === date
          && ['pending','approved','override_approved'].includes(r.status));
        if (already) return alert('해당 날짜에 이미 신청/승인된 휴무·연차가 있습니다.');

        const stat = alStatsMap.get(empId);
        if (stat && stat.remaining < useDays) {
          if (!confirm('연차 잔여가 부족합니다. 그래도 입력하시겠습니까?')) return;
        }

        try {
          await createDayOffRequest({ employeeId: empId, date, type: 'annual', status: 'override_approved', days: useDays });
          await deleteLedgerUsageByDate(empId, date); // 멱등: 같은 날 잔재 제거 후 정확한 일수 1건
          await addLedgerEntry({ employeeId: empId, date, type: 'usage', days: useDays, note: useDays === 0.5 ? '연차 반차(관리자 입력)' : '연차 사용(관리자 입력)' });
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
                  <td>${esc(emp.name)}</td>
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
                  <td>${esc(emp.name)}</td>
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

  await render().catch(err => {
    document.getElementById('schedule').innerHTML =
      `<div class="card" style="color:var(--red);padding:20px;">스케줄 로드 오류: ${err?.message || err}</div>`;
    console.error('renderScheduleTab error:', err);
  });
}

// ── 구역별 휴무 자동 분배 ─────────────────────────────────
function assignZoneOff(emps, approvedOffDates, daysInMonth, year, month, weekdayMin, weekendMin, fullTimeIds = new Set(), maxConsecutive = 4) {
  if (emps.length === 0) return new Map();

  const autoOff = new Map();
  emps.forEach(e => autoOff.set(e.id, new Set()));

  const OFF_PER_WEEK = 2; // 1주에 2일 휴무 (공평·휴식용 목표; 하드 제약은 연속근무 ≤ maxConsecutive)
  const N = emps.length;
  const pfx = `${year}-${String(month).padStart(2,'0')}`;
  const dsOf = d => `${pfx}-${String(d).padStart(2,'0')}`;
  const isWE = d => isHolidayOrWeekend(year, month, d);

  const monthlyTarget = Math.round(daysInMonth * OFF_PER_WEEK / 7); // ~8-9일/월

  const isOff = (id, d) => approvedOffDates.get(id)?.has(dsOf(d)) || autoOff.get(id).has(dsOf(d));
  const maxOffFor = d => N - (isWE(d) ? weekendMin : weekdayMin);
  const alreadyOff = dateStr => emps.filter(e =>
    approvedOffDates.get(e.id)?.has(dateStr) || autoOff.get(e.id).has(dateStr)).length;

  function canOff(empId, d) {
    if (isOff(empId, d)) return false;
    // 정직원 최소 1명 출근 보장
    if (fullTimeIds.size > 0 && fullTimeIds.has(empId)) {
      const offFt = emps.filter(e => fullTimeIds.has(e.id) && isOff(e.id, d)).length;
      if (offFt + 1 >= fullTimeIds.size) return false;
    }
    return true;
  }
  // d 직전까지의 연속 근무 일수 (휴무를 만나면 끊김)
  function streakBefore(empId, d) {
    let s = 0;
    for (let k = d - 1; k >= 1; k--) { if (isOff(empId, k)) break; s++; }
    return s;
  }
  function monthlyOffs(empId) {
    let n = autoOff.get(empId).size;
    approvedOffDates.get(empId)?.forEach(x => { if (x.startsWith(pfx)) n++; });
    return n;
  }

  // 하루씩 전진하며 "가장 지친 사람부터" 휴무 배정.
  //  (1) 필수: 오늘 일하면 연속이 max 초과 → 반드시 쉼 (자리 있으면)
  //  (2) 선제: 연속 max-1 도달자를, 특히 '내일이 주말(자리 적음)'이면 평일인 오늘 미리 쉼
  //      → 주말 병목 전에 분산. 단 월 목표 초과는 금지.
  for (let day = 1; day <= daysInMonth; day++) {
    let slots = maxOffFor(day) - alreadyOff(dsOf(day));
    if (slots <= 0) continue;

    const cand = emps
      .filter(e => canOff(e.id, day))
      .map(e => ({ id: e.id, st: streakBefore(e.id, day), mo: monthlyOffs(e.id) }));

    // (1) 필수 휴무 — 연속 큰 사람 우선
    const must = cand.filter(c => c.st >= maxConsecutive).sort((a, b) => b.st - a.st);
    for (const c of must) {
      if (slots <= 0) break;
      autoOff.get(c.id).add(dsOf(day));
      slots--;
    }
    if (slots <= 0) continue;

    // (2) 선제 휴무 — 연속 max-1 도달자 중 월 목표 미달자
    const tomWE = day < daysInMonth ? isWE(day + 1) : false;
    const opt = cand
      .filter(c => c.st === maxConsecutive - 1 && !autoOff.get(c.id).has(dsOf(day)) && monthlyOffs(c.id) < monthlyTarget)
      .sort((a, b) => (a.mo - b.mo) || (b.st - a.st));
    // 내일이 주말이면(병목 임박) 적극 선제, 아니면 자리 절반까지만 선제 분산
    // (절반 캡이 최적: 너무 일찍 다 쉬면 나중 필수휴무 자리가 고갈됨)
    const cap = tomWE ? slots : Math.ceil(slots / 2);
    let used = 0;
    for (const c of opt) {
      if (used >= cap) break;
      autoOff.get(c.id).add(dsOf(day));
      used++;
    }
  }

  // 안전망: 그래도 남은 연속 초과 구간을 look-back으로 끊는다 (용량 한계만 잔존)
  for (const emp of emps) {
    let lastOff = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      if (isOff(emp.id, day)) { lastOff = day; continue; }
      if (day - lastOff <= maxConsecutive) continue;
      let placed = false;
      for (let x = day; x > lastOff; x--) {
        if (alreadyOff(dsOf(x)) >= maxOffFor(x)) continue;
        if (!canOff(emp.id, x)) continue;
        autoOff.get(emp.id).add(dsOf(x));
        lastOff = x;
        placed = true;
        break;
      }
      if (!placed) lastOff = day;
    }
  }

  return autoOff;
}

// ── 전체 자동 배정 ────────────────────────────────────────
async function autoAssignShifts({ schedule, kitchenEmps, hallEmps, openCapableEmps, approvedOffDates, conditions, year, month, branchId }) {
  const daysInMonth = new Date(year, month, 0).getDate();

  const kitchenWeekdayMin  = conditions.find(c => c.zone === 'kitchen' && c.day_type === 'weekday')?.min_total || 3;
  const kitchenWeekendMin  = conditions.find(c => c.zone === 'kitchen' && c.day_type === 'weekend')?.min_total || 4;
  const hallWeekdayMin     = conditions.find(c => c.zone === 'hall'    && c.day_type === 'weekday')?.min_total || 2;
  const hallWeekendMin     = conditions.find(c => c.zone === 'hall'    && c.day_type === 'weekend')?.min_total || 3;
  const maxConsecutive     = conditions.find(c => c.max_consecutive_days != null)?.max_consecutive_days ?? 4;

  const hallFull = hallEmps.filter(e => e.employment_type === 'fulltime');
  const hallAlba = hallEmps.filter(e => e.employment_type === 'parttime');
  const hc = dt => conditions.find(c => c.zone === 'hall' && c.day_type === dt) || {};
  const hallFtWdMin = hc('weekday').min_fulltime ?? 0;
  const hallFtWeMin = hc('weekend').min_fulltime ?? 0;
  const hallPtWdMin = hc('weekday').min_parttime ?? 0;
  const hallPtWeMin = hc('weekend').min_parttime ?? 0;

  const kitchenAutoOff = assignZoneOff(kitchenEmps, approvedOffDates, daysInMonth, year, month, kitchenWeekdayMin, kitchenWeekendMin, new Set(), maxConsecutive);
  // 홀 정직원만 휴무 분배(정직원 최소 인원 보장). 알바는 휴무 대상이 아니라 '그날 필요 수만큼 근무'.
  const hallFullAutoOff = assignZoneOff(hallFull, approvedOffDates, daysInMonth, year, month, Math.max(1, hallFtWdMin), Math.max(1, hallFtWeMin), new Set(), maxConsecutive);

  // ── 주방 초과 인원 강제 휴무 (홀은 정직원 고정 + 알바 필요수 배정이라 제외) ──
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const maxWork = isHolidayOrWeekend(year, month, day) ? kitchenWeekendMin : kitchenWeekdayMin;
    const working = kitchenEmps.filter(e =>
      !approvedOffDates.get(e.id)?.has(dateStr) && !kitchenAutoOff.get(e.id)?.has(dateStr));
    const excess = working.length - maxWork;
    if (excess <= 0) continue;
    const candidates = [...working].sort((a, b) =>
      (kitchenAutoOff.get(a.id)?.size || 0) - (kitchenAutoOff.get(b.id)?.size || 0));
    let forced = 0;
    for (const emp of candidates) {
      if (forced >= excess) break;
      kitchenAutoOff.get(emp.id).add(dateStr);
      forced++;
    }
  }

  // ── 홀 알바: 그날 필요 수 = max(알바최소, 총원최소 − 근무 정직원). 나머지 슬롯은 안 부름(off) ──
  const albaWork = new Map();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const we = isHolidayOrWeekend(year, month, day);
    const workFull = hallFull.filter(e =>
      !approvedOffDates.get(e.id)?.has(dateStr) && !hallFullAutoOff.get(e.id)?.has(dateStr)).length;
    const totMin = we ? hallWeekendMin : hallWeekdayMin;
    const ptMin  = we ? hallPtWeMin    : hallPtWdMin;
    let need = Math.max(ptMin, totMin - workFull);
    need = Math.max(0, Math.min(need, hallAlba.length));
    const set = new Set();
    if (hallAlba.length) {
      const start = day % hallAlba.length; // 슬롯 순환(공평)
      for (let i = 0; i < need; i++) set.add(hallAlba[(start + i) % hallAlba.length].id);
    }
    albaWork.set(dateStr, set);
  }

  function isOff(emp, dateStr) {
    if (emp.role && emp.role.startsWith('kitchen')) {
      return !!(approvedOffDates.get(emp.id)?.has(dateStr) || kitchenAutoOff.get(emp.id)?.has(dateStr));
    }
    if (emp.employment_type === 'fulltime') { // 홀 정직원
      return !!(approvedOffDates.get(emp.id)?.has(dateStr) || hallFullAutoOff.get(emp.id)?.has(dateStr));
    }
    return !(albaWork.get(dateStr)?.has(emp.id)); // 홀 알바: 근무 집합에 없으면 off(=안 부름)
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
