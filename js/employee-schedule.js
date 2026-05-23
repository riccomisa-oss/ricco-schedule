async function renderEmployeeScheduleTab(employee, branchId) {
  const el = document.getElementById('emp-schedule');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  async function render() {
    const { data: schedule } = await window.supabase
      .from('schedules')
      .select('*')
      .eq('branch_id', branchId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    if (!schedule || !schedule.published_at) {
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2>스케줄 확인</h2>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn btn-ghost btn-sm" id="prev-month-es">◀</button>
            <span style="font-weight:600;">${year}년 ${month}월</span>
            <button class="btn btn-ghost btn-sm" id="next-month-es">▶</button>
          </div>
        </div>
        <div class="card" style="text-align:center;padding:40px;color:var(--gray);">
          아직 스케줄이 발행되지 않았습니다.
        </div>`;
      document.getElementById('prev-month-es').addEventListener('click', () => {
        ({ year, month } = prevMonth(year, month)); render();
      });
      document.getElementById('next-month-es').addEventListener('click', () => {
        ({ year, month } = nextMonth(year, month)); render();
      });
      return;
    }

    const entries = await getScheduleEntries(schedule.id);
    const myEntries = entries.filter(e => e.employee_id === employee.id);
    const myEntryMap = new Map(myEntries.map(e => [e.date, e]));

    function renderCell(date) {
      const entry = myEntryMap.get(date);
      if (!entry) return '';
      return {
        open:       '<span class="shift-chip open">오픈 09:30~20:30</span>',
        close:      '<span class="shift-chip close">마감 10:30~21:30</span>',
        hall_fixed: '<span class="shift-chip close">홀 10:30~21:30</span>',
        off:        '<span class="shift-chip off">휴무</span>',
      }[entry.shift_type] || '';
    }

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h2>내 스케줄</h2>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="prev-month-es">◀</button>
          <span style="font-weight:600;">${year}년 ${month}월</span>
          <button class="btn btn-ghost btn-sm" id="next-month-es">▶</button>
        </div>
      </div>
      <div style="overflow-x:auto;">${buildCalendarHTML(year, month, renderCell)}</div>
    `;

    document.getElementById('prev-month-es').addEventListener('click', () => {
      ({ year, month } = prevMonth(year, month)); render();
    });
    document.getElementById('next-month-es').addEventListener('click', () => {
      ({ year, month } = nextMonth(year, month)); render();
    });
  }

  await render();
}
