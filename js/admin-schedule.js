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
          cellHtml += `
            <select class="shift-select" data-emp="${emp.id}" data-date="${date}"
              style="font-size:10px;width:100%;margin:1px 0;border:1px solid var(--light);border-radius:3px;padding:1px;">
              <option value="">— ${emp.name}</option>
              <option value="open"  ${currentShift==='open' ?'selected':''}>오픈</option>
              <option value="close" ${currentShift==='close'?'selected':''}>마감</option>
              <option value="off"   ${currentShift==='off'  ?'selected':''}>휴무</option>
            </select>`;
        }
      });
      return cellHtml;
    }

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h2>스케줄 편집</h2>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="prev-month-sched">◀</button>
          <span style="font-weight:600;">${year}년 ${month}월</span>
          <button class="btn btn-ghost btn-sm" id="next-month-sched">▶</button>
          <button class="btn ${isPublished ? 'btn-ghost' : 'btn-primary'}" id="publish-btn">
            ${isPublished ? '발행 취소' : '직원에게 발행'}
          </button>
        </div>
      </div>
      <div style="overflow-x:auto;">${buildCalendarHTML(year, month, renderCell)}</div>
    `;

    document.querySelectorAll('.shift-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const val = sel.value;
        if (!val) return;
        await upsertScheduleEntry({ scheduleId: schedule.id, employeeId: sel.dataset.emp, date: sel.dataset.date, shiftType: val });
      });
    });

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
