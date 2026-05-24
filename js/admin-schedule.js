async function renderScheduleTab(branchId) {
  const el = document.getElementById('schedule');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

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
          <button class="btn btn-ghost" id="auto-assign-btn" title="오픈 가능(★) 직원을 순환 배정합니다">
            ★ 오픈 자동배정
          </button>
          <button class="btn ${isPublished ? 'btn-ghost' : 'btn-primary'}" id="publish-btn">
            ${isPublished ? '발행 취소' : '직원에게 발행'}
          </button>
        </div>
      </div>
      <p style="font-size:12px;color:var(--gray);margin-bottom:12px;">
        ★ 표시 = 오픈 가능 직원 (직원 관리에서 설정)
        &nbsp;|&nbsp; 오픈 배정 시 연두색으로 표시됩니다
      </p>
      <div style="overflow-x:auto;">${buildCalendarHTML(year, month, renderCell)}</div>
    `;

    document.querySelectorAll('.shift-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const val = sel.value;
        if (!val) return;
        await upsertScheduleEntry({ scheduleId: schedule.id, employeeId: sel.dataset.emp, date: sel.dataset.date, shiftType: val });
        if (val === 'open') sel.style.background = '#e8f5e9';
        else sel.style.background = '';
      });
    });

    document.getElementById('prev-month-sched').addEventListener('click', () => {
      ({ year, month } = prevMonth(year, month)); render();
    });
    document.getElementById('next-month-sched').addEventListener('click', () => {
      ({ year, month } = nextMonth(year, month)); render();
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
  // 오픈 가능 직원 큐 — 순환 배정 (공평하게)
  const openQueue = [...openCapableEmps];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 오늘 오픈 담당자 결정: 큐 앞에서부터 휴무 아닌 사람
    let openEmpId = null;
    for (let i = 0; i < openQueue.length; i++) {
      if (!approvedOffDates.get(openQueue[i].id)?.has(date)) {
        openEmpId = openQueue[i].id;
        // 이 직원을 큐 맨 뒤로 → 공평한 순환
        const [emp] = openQueue.splice(i, 1);
        openQueue.push(emp);
        break;
      }
    }

    // 주방 배정: 오픈 담당 → 오픈, 나머지 → 마감 (휴무 제외)
    for (const emp of kitchenEmps) {
      if (approvedOffDates.get(emp.id)?.has(date)) continue;
      upserts.push({
        scheduleId: schedule.id,
        employeeId: emp.id,
        date,
        shiftType: emp.id === openEmpId ? 'open' : 'close',
      });
    }

    // 홀 배정: 모두 홀고정 (휴무 제외)
    for (const emp of hallEmps) {
      if (approvedOffDates.get(emp.id)?.has(date)) continue;
      upserts.push({
        scheduleId: schedule.id,
        employeeId: emp.id,
        date,
        shiftType: 'hall_fixed',
      });
    }
  }

  await Promise.all(upserts.map(u => upsertScheduleEntry(u)));
}
