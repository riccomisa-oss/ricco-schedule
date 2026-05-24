async function renderRequestTab(employee, branchId) {
  const el = document.getElementById('emp-request');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  async function render() {
    const [allEmployees, conditions, myRequests] = await Promise.all([
      getEmployees(branchId),
      getConditions(branchId),
      getEmployeeDayOffRequests(employee.id, year, month),
    ]);

    const allRequests = await getDayOffRequests(branchId, year, month);
    const approvedAll = allRequests.filter(r => ['approved', 'override_approved'].includes(r.status));

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h2>휴무 신청</h2>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="prev-month-emp">◀</button>
          <span style="font-weight:600;">${year}년 ${month}월</span>
          <button class="btn btn-ghost btn-sm" id="next-month-emp">▶</button>
        </div>
      </div>

      <div id="request-result" style="margin-bottom:12px;"></div>

      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-bottom:12px;">휴무 신청</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <div class="form-group" style="margin:0;flex:1;min-width:140px;">
            <label>날짜</label>
            <input type="date" id="req-date"
              min="${year}-${String(month).padStart(2,'0')}-01"
              max="${new Date(year, month, 0).toISOString().split('T')[0]}" />
          </div>
          <div class="form-group" style="margin:0;flex:1;min-width:140px;">
            <label>유형</label>
            <select id="req-type">
              <option value="normal">정상 휴무</option>
              <option value="annual">연차</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" id="submit-req-btn" style="width:100%;margin-top:12px;">신청</button>
      </div>

      <div class="card" style="padding:0;">
        <table class="data-table">
          <thead><tr><th>날짜</th><th>유형</th><th>신청 시각</th><th>결과</th><th>사유</th></tr></thead>
          <tbody>
            ${myRequests.length === 0
              ? '<tr><td colspan="5" style="text-align:center;color:var(--gray);">신청 내역이 없습니다.</td></tr>'
              : myRequests.map(r => `
                <tr>
                  <td>${r.date}</td>
                  <td>${r.type === 'normal' ? '정상 휴무' : '연차'}</td>
                  <td style="font-size:12px;color:var(--gray);">${new Date(r.requested_at).toLocaleString('ko-KR')}</td>
                  <td><span class="badge badge-${['approved','override_approved'].includes(r.status) ? 'approved' : 'rejected'}">
                    ${['approved','override_approved'].includes(r.status) ? '승인' : '거절'}
                  </span></td>
                  <td style="font-size:12px;color:var(--gray);">${r.rejection_reason || '-'}</td>
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('prev-month-emp').addEventListener('click', () => {
      ({ year, month } = prevMonth(year, month)); render();
    });
    document.getElementById('next-month-emp').addEventListener('click', () => {
      ({ year, month } = nextMonth(year, month)); render();
    });

    document.getElementById('submit-req-btn').addEventListener('click', async () => {
      const date = document.getElementById('req-date').value;
      const type = document.getElementById('req-type').value;
      if (!date) return;

      const result = validateDayOffRequest({
        employee,
        date,
        type,
        allEmployees,
        approvedRequests: approvedAll,
        conditions,
      });

      const status = result.approved ? 'approved' : 'rejected';
      await createDayOffRequest({
        employeeId: employee.id,
        date,
        type,
        status,
        rejectionReason: result.reason,
      });

      const msgEl = document.getElementById('request-result');
      if (result.approved) {
        msgEl.innerHTML = '<div class="alert alert-success">✅ 휴무가 승인되었습니다.</div>';
      } else {
        msgEl.innerHTML = `<div class="alert alert-error">❌ 휴무 신청이 거절되었습니다.<br><small>${result.reason}</small></div>`;
      }
      render();
    });
  }

  await render();
}
