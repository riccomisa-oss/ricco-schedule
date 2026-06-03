function getNextAccrualInfo(hireDate, today) {
  const all = computeExpectedAccruals(hireDate, '2035-01-01');
  const upcoming = all.filter(e => e.date >= today);
  return {
    nextMonthly: upcoming.find(e => e.days === 1)  || null,
    nextAnniv:   upcoming.find(e => e.days === 15) || null,
  };
}

function computeExpectedAccruals(hireDate, asOf) {
  const [hy, hm, hd] = hireDate.split('-').map(Number);
  const until = asOf || new Date().toISOString().split('T')[0];
  const entries = [];

  const pad = n => String(n).padStart(2, '0');
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const toDateStr = (y, m, d) => `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;

  // 입사 1~11개월: 매월 1일 (만근 시 발생 — 수동 또는 발생 업데이트로 추가)
  for (let m = 1; m <= 11; m++) {
    const totalM = hm - 1 + m;
    const y = hy + Math.floor(totalM / 12);
    const mo = (totalM % 12) + 1;
    const dateStr = toDateStr(y, mo, hd);
    if (dateStr > until) break;
    entries.push({ date: dateStr, type: 'accrual', days: 1, note: `입사 ${m}개월차` });
  }

  // 입사 1, 2, 3… 주년: 15일
  for (let y = 1; y <= 10; y++) {
    const dateStr = toDateStr(hy + y, hm, hd);
    if (dateStr > until) break;
    entries.push({ date: dateStr, type: 'accrual', days: 15, note: `입사 ${y}년차 연차` });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

async function renderAnnualLeaveTab(branchId) {
  const el = document.getElementById('annual-leave');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const currentYear = new Date().getFullYear();
  const [employees, stats, yearRequests] = await Promise.all([
    getEmployees(branchId),
    getAnnualLeaveStats(branchId, currentYear),
    getYearDayOffRequests(branchId, currentYear),
  ]);

  const withHire   = employees.filter(e => e.hire_date);
  const statsMap   = new Map(stats.map(s => [s.emp.id, s]));
  const today      = new Date().toISOString().split('T')[0];
  const fulltime   = employees.filter(e => e.employment_type !== 'parttime');
  const months     = Array.from({length: 12}, (_, i) => i + 1);
  const empMonthStats = fulltime.map(emp => {
    const normalCounts = months.map(m => {
      const ms = String(m).padStart(2, '0');
      return yearRequests.filter(r =>
        r.employee_id === emp.id && r.type === 'normal' &&
        r.date.startsWith(`${currentYear}-${ms}`)
      ).length;
    });
    const annualCount = yearRequests.filter(r => r.employee_id === emp.id && r.type === 'annual').length;
    return { emp, normalCounts, annualCount, total: normalCounts.reduce((a,b)=>a+b,0) + annualCount };
  });
  let currentEmpId = null;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2>연차 관리</h2>
    </div>

    ${withHire.length === 0
      ? '<div class="card" style="text-align:center;color:var(--gray);padding:40px;">입사일이 설정된 직원이 없습니다.<br>직원 관리 탭에서 입사일을 설정하세요.</div>'
      : `<div class="card" style="padding:0;">
          <table class="data-table">
            <thead>
              <tr><th>직원</th><th>입사일</th><th>발생</th><th>사용</th><th>잔여</th><th>다음 발생일</th><th></th></tr>
            </thead>
            <tbody>
              ${withHire.map(e => {
                const s = statsMap.get(e.id) || { total: 0, used: 0, remaining: 0, accrualDates: new Set() };
                const color = s.remaining < 0 ? 'badge-rejected' : s.remaining > 0 ? 'badge-approved' : '';
                const { nextMonthly, nextAnniv } = getNextAccrualInfo(e.hire_date, today);
                const monthlyPending = nextMonthly && !s.accrualDates.has(nextMonthly.date);
                const monthLabel = nextMonthly ? nextMonthly.date.slice(5, 7).replace(/^0/, '') + '월' : '';
                return `
                  <tr>
                    <td><strong>${e.name}</strong></td>
                    <td style="font-size:12px;color:var(--gray);">${e.hire_date}</td>
                    <td>${s.total}일</td>
                    <td>${s.used}일</td>
                    <td><span class="badge ${color}">${s.remaining}일</span></td>
                    <td style="font-size:12px;line-height:1.8;">
                      ${nextMonthly ? `<div style="color:var(--gray);">월차 ${nextMonthly.date}</div>` : ''}
                      ${nextAnniv   ? `<div style="color:var(--olive);">${nextAnniv.note} ${nextAnniv.date}</div>` : ''}
                    </td>
                    <td style="white-space:nowrap;">
                      ${monthlyPending ? `<button class="btn btn-ghost btn-sm" style="color:var(--olive);" onclick="runMonthlyAccrual('${e.id}','${e.name}','${nextMonthly.date}','${monthLabel}')">${monthLabel} 만근</button>` : ''}
                      <button class="btn btn-ghost btn-sm" onclick="openLedger('${e.id}','${e.name}')">이력</button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`
    }

    <div style="margin-top:24px;">
      <h3 style="font-size:14px;font-weight:600;color:var(--gray);margin-bottom:10px;">${currentYear}년 월별 휴무 현황</h3>
      <div class="card" style="padding:0;overflow-x:auto;">
        <table class="data-table" style="min-width:600px;">
          <thead>
            <tr>
              <th>직원</th>
              ${months.map(m => `<th style="text-align:center;min-width:32px;">${m}월</th>`).join('')}
              <th style="text-align:center;">연차</th>
              <th style="text-align:center;">계</th>
            </tr>
          </thead>
          <tbody>
            ${empMonthStats.length === 0
              ? '<tr><td colspan="15" style="text-align:center;color:var(--gray);">데이터 없음</td></tr>'
              : empMonthStats.map(s => `
                <tr>
                  <td><strong>${s.emp.name}</strong></td>
                  ${s.normalCounts.map(c => `<td style="text-align:center;color:${c>0?'var(--dark)':'#ddd'};">${c>0?c:'·'}</td>`).join('')}
                  <td style="text-align:center;">${s.annualCount > 0 ? `<span class="badge badge-approved">${s.annualCount}</span>` : '·'}</td>
                  <td style="text-align:center;font-weight:700;">${s.total > 0 ? s.total : '·'}</td>
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="modal-overlay" id="ledger-modal">
      <div class="modal" style="max-width:580px;">
        <h2 id="ledger-title">연차 이력</h2>
        <div id="ledger-body"></div>
        <div style="border-top:1px solid var(--light);padding-top:14px;margin-top:14px;">
          <p style="font-size:13px;font-weight:600;margin-bottom:8px;">수동 항목 추가</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <input type="date" id="add-date" style="flex:1;min-width:130px;" />
            <select id="add-type" style="flex:1;min-width:90px;">
              <option value="accrual">발생</option>
              <option value="usage">사용</option>
            </select>
            <input type="number" id="add-days" min="0.5" step="0.5" placeholder="일수" style="width:80px;" />
            <input type="text" id="add-note" placeholder="메모 (선택)" style="flex:2;min-width:120px;" />
            <button class="btn btn-primary btn-sm" id="add-ledger-btn">추가</button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="close-ledger-btn">닫기</button>
        </div>
      </div>
    </div>
  `;

  async function refreshLedger() {
    const entries = await getAnnualLedger(currentEmpId);
    const accrued = entries.filter(e => e.type === 'accrual').reduce((s, e) => s + Number(e.days), 0);
    const used    = entries.filter(e => e.type === 'usage').reduce((s, e) => s + Number(e.days), 0);
    document.getElementById('ledger-body').innerHTML = `
      <div style="display:flex;gap:16px;margin-bottom:12px;font-size:13px;">
        <span>발생 <strong>${accrued}일</strong></span>
        <span>사용 <strong>${used}일</strong></span>
        <span>잔여 <strong style="color:${accrued-used<0?'var(--red)':'var(--olive)'}">${accrued - used}일</strong></span>
      </div>
      <div style="max-height:280px;overflow-y:auto;">
        <table class="data-table">
          <thead><tr><th>날짜</th><th>유형</th><th>일수</th><th>메모</th><th></th></tr></thead>
          <tbody>
            ${entries.length === 0
              ? '<tr><td colspan="5" style="text-align:center;color:var(--gray);">이력 없음</td></tr>'
              : entries.map(e => `
                <tr>
                  <td style="font-size:12px;">${e.date}</td>
                  <td><span class="badge ${e.type==='accrual'?'badge-approved':'badge-rejected'}">${e.type==='accrual'?'발생':'사용'}</span></td>
                  <td>${e.days}일</td>
                  <td style="font-size:12px;color:var(--gray);">${e.note || '—'}</td>
                  <td><button class="btn btn-ghost btn-sm" style="color:var(--red);" data-del-id="${e.id}">삭제</button></td>
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
    `;
    document.querySelectorAll('[data-del-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('삭제하시겠습니까?')) return;
        await deleteLedgerEntry(btn.dataset.delId);
        await refreshLedger();
        renderAnnualLeaveTab(branchId);
      });
    });
  }

  window.openLedger = async (empId, empName) => {
    currentEmpId = empId;
    document.getElementById('ledger-title').textContent = `${empName} — 연차 이력`;
    await refreshLedger();
    document.getElementById('ledger-modal').classList.add('open');
  };

  window.runMonthlyAccrual = async (empId, empName, date, monthLabel) => {
    if (!confirm(`${empName} ${monthLabel} 만근 처리 — ${date} +1일 추가하시겠습니까?`)) return;
    await addLedgerEntry({ employeeId: empId, date, type: 'accrual', days: 1, note: '월차' });
    renderAnnualLeaveTab(branchId);
  };

  document.getElementById('close-ledger-btn').addEventListener('click', () => {
    document.getElementById('ledger-modal').classList.remove('open');
  });

  document.getElementById('add-ledger-btn').addEventListener('click', async () => {
    const date  = document.getElementById('add-date').value;
    const type  = document.getElementById('add-type').value;
    const days  = parseFloat(document.getElementById('add-days').value);
    const note  = document.getElementById('add-note').value.trim() || null;
    if (!date || isNaN(days) || days <= 0) return alert('날짜와 일수를 입력하세요.');
    await addLedgerEntry({ employeeId: currentEmpId, date, type, days, note });
    await refreshLedger();
    renderAnnualLeaveTab(branchId);
  });

  window.runAutoAccrual = async (empId, empName, hireDate) => {
    const today    = new Date().toISOString().split('T')[0];
    const expected = computeExpectedAccruals(hireDate, today);
    const existing = await getAnnualLedger(empId);
    // 이미 발생 항목이 있는 날짜는 건너뜀 (note 무관, 날짜 기준)
    const existingDates = new Set(
      existing.filter(e => e.type === 'accrual').map(e => e.date)
    );
    const toAdd = expected.filter(e => !existingDates.has(e.date));
    if (toAdd.length === 0) {
      return alert(`${empName}: 추가할 발생 항목이 없습니다.`);
    }
    for (const e of toAdd) {
      await addLedgerEntry({ employeeId: empId, date: e.date, type: 'accrual', days: e.days, note: e.note });
    }
    alert(`${empName}: ${toAdd.length}건 발생 추가됨`);
    renderAnnualLeaveTab(branchId);
  };
}
