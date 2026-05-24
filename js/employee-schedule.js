async function renderEmployeeScheduleTab(employee, branchId) {
  const el = document.getElementById('emp-schedule');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  async function render() {
    try {
      const { data: schedule } = await db
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

      const myEntryMap = new Map(
        entries.filter(e => e.employee_id === employee.id).map(e => [e.date, e])
      );

      // 날짜별 출근 직원 이름 목록 (본인 제외, off 제외)
      const workersByDate = new Map();
      entries
        .filter(e => e.employee_id !== employee.id && e.shift_type !== 'off')
        .forEach(e => {
          if (!workersByDate.has(e.date)) workersByDate.set(e.date, []);
          workersByDate.get(e.date).push(e.employees?.name || '?');
        });

      function renderCell(date) {
        const myEntry = myEntryMap.get(date);
        const workers = workersByDate.get(date) || [];
        let html = '';

        if (myEntry?.shift_type === 'off') {
          html += '<span class="shift-chip off">휴무</span>';
        }

        if (workers.length > 0) {
          html += `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:2px;">
            ${workers.map(name => `<span style="font-size:10px;color:#555;background:#e8e8e4;border-radius:3px;padding:1px 5px;">${name}</span>`).join('')}
          </div>`;
        }

        return html;
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
    } catch (err) {
      el.innerHTML = `<p style="color:var(--red);padding:16px;">오류가 발생했습니다: ${err?.message || err}</p>`;
    }
  }

  await render();
}
