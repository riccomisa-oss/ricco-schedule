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

      const annualStats = employee.hire_date ? await getAnnualLeaveStats(branchId, year) : [];
      const myStat = annualStats.find(s => s.emp.id === employee.id);

      const myEntries = entries.filter(e => e.employee_id === employee.id);
      const myEntryMap = new Map(myEntries.map(e => [e.date, e]));

      // 날짜별 출근 직원 목록 (off 제외) + 시프트 정보 포함
      const workersByDate = new Map();
      entries
        .filter(e => e.shift_type !== 'off')
        .forEach(e => {
          if (!workersByDate.has(e.date)) workersByDate.set(e.date, []);
          workersByDate.get(e.date).push({
            name: e.employees?.name || '?',
            role: e.employees?.role || '',
            shift: e.shift_type,
          });
        });

      // ── 오늘 출근 인원 (이번달만 표시) ─────────────────────
      const isThisMonth = year === now.getFullYear() && month === now.getMonth() + 1;
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      let todaySection = '';
      if (isThisMonth) {
        const todayWorkers = workersByDate.get(todayStr) || [];
        const myTodayEntry = myEntryMap.get(todayStr);
        const isMyDayOff = myTodayEntry?.shift_type === 'off';

        const kitchen = todayWorkers.filter(w => w.role.startsWith('kitchen')).map(w => w.name);
        const hall    = todayWorkers.filter(w => w.role.startsWith('hall')).map(w => w.name);

        if (isMyDayOff) {
          todaySection = `
            <div class="card" style="margin-bottom:16px;background:#FFF9F9;border-left:3px solid var(--red);padding:14px 16px;">
              <div style="font-weight:600;margin-bottom:6px;">오늘 — 휴무 🌿</div>
              ${kitchen.length ? `<div style="font-size:13px;color:var(--gray);">주방: ${kitchen.join(', ')}</div>` : ''}
              ${hall.length    ? `<div style="font-size:13px;color:var(--gray);">홀: ${hall.join(', ')}</div>` : ''}
            </div>`;
        } else if (todayWorkers.length > 0) {
          todaySection = `
            <div class="card" style="margin-bottom:16px;background:#F1F8E9;border-left:3px solid var(--olive);padding:14px 16px;">
              <div style="font-weight:600;margin-bottom:6px;">오늘 출근 인원</div>
              ${kitchen.length ? `<div style="font-size:13px;">주방: ${kitchen.join(', ')}</div>` : ''}
              ${hall.length    ? `<div style="font-size:13px;">홀: ${hall.join(', ')}</div>` : ''}
            </div>`;
        }
      }

      function renderCell(date) {
        const myEntry = myEntryMap.get(date);
        const workers = workersByDate.get(date) || [];
        let html = '';

        if (!myEntry) return html;

        if (myEntry.shift_type === 'off') {
          html += `<div style="margin:2px 0 3px;padding:3px 0;background:#fce4ec;border-radius:4px;text-align:center;">
            <span style="font-size:12px;font-weight:700;color:#c62828;">휴무</span>
          </div>`;
        } else if (myEntry.shift_type === 'open') {
          html += `<div style="margin:2px 0 3px;padding:3px 0;background:#e8f5e9;border-radius:4px;text-align:center;">
            <span style="font-size:12px;font-weight:700;color:#2e7d32;">오픈</span>
          </div>`;
          const others = workers.filter(w => w.name !== employee.name);
          if (others.length > 0) {
            html += `<div style="font-size:11px;color:var(--gray);line-height:1.7;">${others.map(w => w.name).join(' · ')}</div>`;
          }
        } else if (myEntry.shift_type === 'hall_fixed') {
          html += `<div style="margin:2px 0 3px;padding:3px 0;background:#f3e5f5;border-radius:4px;text-align:center;">
            <span style="font-size:12px;font-weight:700;color:#6a1b9a;">홀</span>
          </div>`;
          const opener = workers.find(w => w.shift === 'open');
          if (opener) {
            html += `<div style="font-size:11px;color:var(--gray);">오픈 ${opener.name}</div>`;
          }
        } else {
          // close: 마감 표기 없이 오프너 이름만
          const opener = workers.find(w => w.shift === 'open');
          if (opener) {
            html += `<div style="font-size:11px;color:var(--gray);margin-top:2px;">오픈 ${opener.name}</div>`;
          }
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
        ${myStat ? `
        <div style="display:flex;align-items:center;gap:8px;background:#f1f8e9;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;">
          🌿 연차 잔여 <strong style="color:var(--olive);font-size:15px;margin:0 3px;">${myStat.remaining}일</strong>
          <span style="color:var(--gray);">(총 ${myStat.total}일 중 ${myStat.used}일 사용)</span>
        </div>` : ''}
        ${todaySection}
        <div style="overflow-x:auto;">${buildCalendarHTML(year, month, renderCell)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;margin-top:12px;">
          <span style="background:#e8f5e9;color:#2e7d32;border-radius:3px;padding:2px 8px;font-weight:600;">오픈</span>
          <span style="background:#f3e5f5;color:#6a1b9a;border-radius:3px;padding:2px 8px;font-weight:600;">홀</span>
          <span style="background:#fce4ec;color:#c62828;border-radius:3px;padding:2px 8px;font-weight:600;">휴무</span>
        </div>
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
