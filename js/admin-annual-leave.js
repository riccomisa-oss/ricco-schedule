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
  const _today     = new Date(); // 로컬(KST) 기준 — toISOString은 UTC라 자정~오전9시 하루 밀림
  const today      = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, '0')}-${String(_today.getDate()).padStart(2, '0')}`;
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
    const annualCount = yearRequests
      .filter(r => r.employee_id === emp.id && r.type === 'annual')
      .reduce((s, r) => s + (Number(r.days) || 1), 0); // 반차는 0.5로 합산
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
              <tr><th>직원</th><th>입사일</th><th>발생</th><th>사용</th><th>잔여</th><th>발생 처리(밀린 것)</th><th></th></tr>
            </thead>
            <tbody>
              ${withHire.map(e => {
                const s = statsMap.get(e.id) || { total: 0, used: 0, remaining: 0, accrualDates: new Set() };
                const color = s.remaining < 0 ? 'badge-rejected' : s.remaining > 0 ? 'badge-approved' : '';
                // 오늘까지 발생해야 하는데 ledger에 아직 없는 항목(과거 포함). 만근 달만 클릭, 결근 달은 안 누르면 됨.
                const pending = expectedAccruals(e.hire_date, today).filter(p => !s.accrualDates.has(p.date));
                return `
                  <tr>
                    <td><strong>${esc(e.name)}</strong></td>
                    <td style="font-size:12px;color:var(--gray);">${e.hire_date}</td>
                    <td>${s.total}일</td>
                    <td>${s.used}일</td>
                    <td><span class="badge ${color}">${s.remaining}일</span></td>
                    <td style="font-size:12px;line-height:1.9;">
                      ${pending.length === 0
                        ? '<span style="color:var(--gray);">최신</span>'
                        : pending.map(p => `<button class="btn btn-ghost btn-sm" style="color:var(--olive);padding:2px 6px;margin:1px 0;" onclick="addAccrual('${e.id}','${p.date}',${p.days},'${p.kind === 'monthly' ? '월차' : p.note}')">${p.kind === 'monthly' ? `${Number(p.date.slice(5, 7))}월 만근 +1` : `${p.note} +${p.days}`}</button>`).join('<br>')}
                    </td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-ghost btn-sm" onclick="openLedger('${e.id}')">이력</button>
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
                  <td><strong>${esc(s.emp.name)}</strong></td>
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
                  <td style="font-size:12px;color:var(--gray);">${esc(e.note || '—')}</td>
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

  window.openLedger = async (empId) => {
    const emp = employees.find(x => x.id === empId);
    currentEmpId = empId;
    document.getElementById('ledger-title').textContent = `${emp?.name || ''} — 연차 이력`;
    await refreshLedger();
    document.getElementById('ledger-modal').classList.add('open');
  };

  // 발생 처리(월차/주년 공용). 날짜·일수·메모는 expectedAccruals가 만든 안전한 값.
  window.addAccrual = async (empId, date, days, note) => {
    const emp = employees.find(x => x.id === empId);
    if (!confirm(`${emp?.name || ''} — ${date} ${note} +${days}일 발생 처리할까요?`)) return;
    // 멱등: 같은 날 발생이 이미 있으면 중단 (더블클릭/재클릭 이중 가산 방지)
    const ledger = await getAnnualLedger(empId);
    if (ledger.find(e => e.type === 'accrual' && e.date === date)) {
      alert('이미 처리된 발생입니다.');
      renderAnnualLeaveTab(branchId);
      return;
    }
    await addLedgerEntry({ employeeId: empId, date, type: 'accrual', days: Number(days), note });
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

}
