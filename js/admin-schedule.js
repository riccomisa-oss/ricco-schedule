async function renderScheduleTab(branchId) {
  const el = document.getElementById('schedule');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let viewMode = 'edit'; // 'edit' | 'preview'

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
      off:        { bg: '#fafafa', color: '#9e9e9e', label: '휴무' },
    };

    const DAY_NAMES = ['일','월','화','수','목','금','토'];

    function renderPreview() {
      const days = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        days.push({ d, dow: date.getDay() });
      }

      const headerCells = days.map(({ d, dow }) => {
        const isWeekend = dow === 0 || dow === 6;
        return `<th style="min-width:36px;text-align:center;font-size:11px;padding:4px 2px;
          color:${dow === 0 ? '#c62828' : dow === 6 ? '#1565c0' : 'inherit'};">
          ${d}<br><span style="font-weight:400;">${DAY_NAMES[dow]}</span>
        </th>`;
      }).join('');

      const rows = allEmps.map(emp => {
        const isHall = emp.role.startsWith('hall');
        const cells = days.map(({ d }) => {
          const date = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const isOff = approvedOffDates.get(emp.id)?.has(date);
          if (isOff) {
            return `<td style="text-align:center;padding:2px;"><span style="font-size:10px;background:#fff3e0;color:#e65100;border-radius:3px;padding:1px 3px;">휴</span></td>`;
          }
          const entry = entryMap.get(`${emp.id}_${date}`);
          const shift = entry?.shift_type;
          if (!shift) return `<td style="text-align:center;color:#ddd;font-size:10px;">—</td>`;
          const s = SHIFT_COLORS[shift] || {};
          return `<td style="text-align:center;padding:2px;">
            <span style="font-size:10px;background:${s.bg};color:${s.color};border-radius:3px;padding:1px 4px;font-weight:600;">${s.label}</span>
          </td>`;
        }).join('');

        const roleLabel = isHall ? '홀' : '주방';
        return `<tr>
          <td style="white-space:nowrap;padding:4px 8px;font-size:12px;border-right:2px solid var(--light);position:sticky;left:0;background:var(--white);z-index:1;">
            <span style="color:var(--gray);font-size:10px;">${roleLabel}</span><br>${emp.name}
          </td>
          ${cells}
        </tr>`;
      }).join('');

      return `
        <div style="overflow-x:auto;border:1px solid var(--light);border-radius:8px;">
          <table style="border-collapse:collapse;width:max-content;min-width:100%;">
            <thead>
              <tr style="background:var(--olive);color:var(--white);">
                <th style="min-width:64px;padding:6px 8px;text-align:left;position:sticky;left:0;background:var(--olive);z-index:2;">직원</th>
                ${headerCells}
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
        <div style="margin-top:10px;display:flex;gap:12px;font-size:12px;">
          ${Object.values(SHIFT_COLORS).map(s =>
            `<span style="background:${s.bg};color:${s.color};border-radius:3px;padding:2px 8px;font-weight:600;">${s.label}</span>`
          ).join('')}
          <span style="background:#fff3e0;color:#e65100;border-radius:3px;padding:2px 8px;">휴(신청)</span>
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
          ${viewMode==='edit' ? `<button class="btn btn-ghost" id="auto-assign-btn">★ 오픈 자동배정</button>` : ''}
          <button class="btn ${isPublished ? 'btn-ghost' : 'btn-primary'}" id="publish-btn">
            ${isPublished ? '발행 취소' : '직원에게 발행'}
          </button>
        </div>
      </div>
      <div id="schedule-body">
        ${viewMode === 'preview'
          ? renderPreview()
          : `<p style="font-size:12px;color:var(--gray);margin-bottom:12px;">
               ★ 표시 = 오픈 가능 직원 &nbsp;|&nbsp; 오픈 배정 시 연두색으로 표시됩니다
             </p>
             <div style="overflow-x:auto;">${buildCalendarHTML(year, month, renderCell)}</div>`
        }
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
          if (val === 'open') sel.style.background = '#e8f5e9';
          else sel.style.background = '';
        });
      });

      document.getElementById('auto-assign-btn').addEventListener('click', async () => {
        if (openCapableEmps.length === 0) {
          alert('오픈 가능 직원이 없습니다.\n직원 관리 탭에서 주방 직원의 "오픈 가능" 버튼을 설정해주세요.');
          return;
        }
        if (!confirm(`${year}년 ${month}월 오픈 시프트를 자동 배정할까요?\n(기존 배정이 덮어씌워집니다)`)) return;
        await autoAssignShifts({ schedule, kitchenEmps, hallEmps, openCapableEmps, approvedOffDates, year, month });
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
  }

  await render();
}

async function autoAssignShifts({ schedule, kitchenEmps, hallEmps, openCapableEmps, approvedOffDates, year, month }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const upserts = [];
  const openQueue = [...openCapableEmps];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    let openEmpId = null;
    for (let i = 0; i < openQueue.length; i++) {
      if (!approvedOffDates.get(openQueue[i].id)?.has(date)) {
        openEmpId = openQueue[i].id;
        const [emp] = openQueue.splice(i, 1);
        openQueue.push(emp);
        break;
      }
    }

    for (const emp of kitchenEmps) {
      if (approvedOffDates.get(emp.id)?.has(date)) continue;
      upserts.push({ scheduleId: schedule.id, employeeId: emp.id, date, shiftType: emp.id === openEmpId ? 'open' : 'close' });
    }

    for (const emp of hallEmps) {
      if (approvedOffDates.get(emp.id)?.has(date)) continue;
      upserts.push({ scheduleId: schedule.id, employeeId: emp.id, date, shiftType: 'hall_fixed' });
    }
  }

  await Promise.all(upserts.map(u => upsertScheduleEntry(u)));
}
