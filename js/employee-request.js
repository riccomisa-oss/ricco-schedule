async function renderRequestTab(employee, branchId) {
  const el = document.getElementById('emp-request');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  async function render() {
    const [allEmployees, conditions, myRequests, annualStats] = await Promise.all([
      getEmployees(branchId),
      getConditions(branchId),
      getEmployeeDayOffRequests(employee.id, year, month),
      getAnnualLeaveStats(branchId, year),
    ]);

    const allRequests = await getDayOffRequests(branchId, year, month);
    const approvedAll = allRequests.filter(r => ['approved', 'override_approved'].includes(r.status));

    // 연차 잔여일
    const myStat = annualStats.find(s => s.emp.id === employee.id);
    const annualBadge = myStat
      ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--gray);">
           연차 잔여 <strong style="color:var(--olive);font-size:16px;">${myStat.remaining}일</strong>
           <span style="font-size:11px;">(총 ${myStat.total}일 중 ${myStat.used}일 사용)</span>
         </div>`
      : '';

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h2>휴무 신청</h2>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="prev-month-emp">◀</button>
          <span style="font-weight:600;">${year}년 ${month}월</span>
          <button class="btn btn-ghost btn-sm" id="next-month-emp">▶</button>
        </div>
      </div>

      ${annualBadge ? `<div class="card" style="margin-bottom:12px;padding:12px 16px;">${annualBadge}</div>` : ''}

      <div id="request-result" style="margin-bottom:12px;"></div>

      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-bottom:12px;">휴무 신청</h3>
        <div class="form-group" style="margin:0 0 4px 0;">
          <label>날짜</label>
          <input type="date" id="req-date"
            min="${year}-${String(month).padStart(2,'0')}-01"
            max="${new Date(year, month, 0).toISOString().split('T')[0]}"
            style="width:100%;box-sizing:border-box;" />
        </div>
        <div id="date-off-info" style="font-size:12px;color:var(--gray);min-height:18px;margin-bottom:8px;"></div>
        <div class="form-group" style="margin:0 0 12px 0;">
          <label>유형</label>
          <select id="req-type" style="width:100%;box-sizing:border-box;">
            <option value="normal">정상 휴무</option>
            ${employee.annual_leave_total != null ? '<option value="annual">연차 휴무</option>' : ''}
          </select>
        </div>
        <button class="btn btn-primary" id="submit-req-btn" style="width:100%;">신청</button>
      </div>

      <div class="card" style="padding:0;">
        <table class="data-table">
          <thead><tr><th>날짜</th><th>유형</th><th>신청 시각</th><th>결과</th><th></th></tr></thead>
          <tbody>
            ${myRequests.length === 0
              ? '<tr><td colspan="5" style="text-align:center;color:var(--gray);">신청 내역이 없습니다.</td></tr>'
              : myRequests.map(r => {
                  const isApproved = ['approved', 'override_approved'].includes(r.status);
                  const canCancel  = !['override_approved', 'override_rejected'].includes(r.status);
                  return `
                    <tr>
                      <td>${r.date}</td>
                      <td>${r.type === 'normal' ? '정상 휴무' : '연차 휴무'}</td>
                      <td style="font-size:12px;color:var(--gray);">${new Date(r.requested_at).toLocaleString('ko-KR')}</td>
                      <td><span class="badge badge-${isApproved ? 'approved' : 'rejected'}">
                        ${isApproved ? '승인' : '거절'}
                      </span></td>
                      <td>${canCancel
                        ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="cancelRequest('${r.id}')">취소</button>`
                        : ''}</td>
                    </tr>`;
                }).join('')
            }
          </tbody>
        </table>
      </div>
    `;

    window.cancelRequest = async (id) => {
      if (!confirm('휴무 신청을 취소하시겠습니까?')) return;
      try {
        await deleteDayOffRequest(id);
        render();
      } catch (err) {
        alert('취소 실패: ' + (err?.message || err));
      }
    };

    document.getElementById('req-date').addEventListener('change', (e) => {
      const selectedDate = e.target.value;
      const infoEl = document.getElementById('date-off-info');
      if (!selectedDate || !infoEl) return;
      const offNames = approvedAll
        .filter(r => r.date === selectedDate && r.employee_id !== employee.id)
        .map(r => r.employees?.name || allEmployees.find(emp => emp.id === r.employee_id)?.name || '?');
      infoEl.textContent = offNames.length
        ? `이 날 이미 휴무: ${offNames.join(', ')}`
        : '';
    });

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
