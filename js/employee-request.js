async function renderRequestTab(employee, branchId) {
  const el = document.getElementById('emp-request');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  async function render() {
    const now2 = new Date();
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

    const isCurrentMonth = year === now2.getFullYear() && month === now2.getMonth() + 1;
    const isPastMonth = year < now2.getFullYear() || (year === now2.getFullYear() && month < now2.getMonth() + 1);

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h2>휴무 신청</h2>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="prev-month-emp" ${isCurrentMonth ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>◀</button>
          <span style="font-weight:600;">${year}년 ${month}월</span>
          <button class="btn btn-ghost btn-sm" id="next-month-emp">▶</button>
        </div>
      </div>

      <div id="request-result" style="margin-bottom:12px;"></div>

      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-bottom:12px;">휴무 신청</h3>
        <div class="form-group" style="margin:0 0 4px 0;">
          <label>날짜</label>
          <input type="date" id="req-date"
            min="${(year > now2.getFullYear() || (year === now2.getFullYear() && month > now2.getMonth() + 1))
              ? `${year}-${String(month).padStart(2,'0')}-01`
              : `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-${String(now2.getDate()).padStart(2,'0')}`}"
            max="${new Date(year, month, 0).toISOString().split('T')[0]}"
            style="width:100%;box-sizing:border-box;" />
        </div>
        <div id="date-off-info" style="font-size:12px;min-height:18px;margin-bottom:8px;"></div>
        <div class="form-group" style="margin:0 0 8px 0;">
          <label>유형</label>
          <select id="req-type" style="width:100%;box-sizing:border-box;">
            <option value="normal">정상 휴무</option>
            ${employee.hire_date != null ? '<option value="annual">연차 휴무</option>' : ''}
          </select>
        </div>
        ${myStat ? `<div id="annual-info" style="font-size:12px;color:var(--gray);margin-bottom:12px;display:none;">
          연차 잔여 <strong style="color:var(--olive);">${myStat.remaining}일</strong>
          <span>(총 ${myStat.total}일 중 ${myStat.used}일 사용)</span>
        </div>` : ''}
        <button class="btn btn-primary" id="submit-req-btn" style="width:100%;">신청</button>
      </div>

      <div class="card" style="padding:0;">
        <table class="data-table">
          <thead><tr><th>날짜</th><th>유형</th><th>신청 시각</th><th>결과</th><th style="color:var(--gray);font-size:12px;">거절 사유</th><th></th></tr></thead>
          <tbody>
            ${myRequests.length === 0
              ? '<tr><td colspan="5" style="text-align:center;color:var(--gray);">신청 내역이 없습니다.</td></tr>'
              : myRequests.map(r => {
                  const isPending  = r.status === 'pending';
                  const isApproved = ['approved', 'override_approved'].includes(r.status);
                  const isRejected = ['rejected', 'override_rejected'].includes(r.status);
                  const canCancel  = !['override_approved', 'override_rejected'].includes(r.status);
                  const badge = isPending
                    ? '<span class="badge" style="background:var(--light);color:var(--gray);">대기 중</span>'
                    : isApproved
                      ? '<span class="badge badge-approved">승인</span>'
                      : '<span class="badge badge-rejected">거절</span>';
                  return `
                    <tr>
                      <td>${r.date}</td>
                      <td>${r.type === 'normal' ? '정상 휴무' : '연차 휴무'}</td>
                      <td style="font-size:12px;color:var(--gray);">${new Date(r.requested_at).toLocaleString('ko-KR')}</td>
                      <td>${badge}</td>
                      <td style="font-size:12px;color:var(--gray);">${isRejected && r.rejection_reason ? r.rejection_reason : ''}</td>
                      <td>${canCancel
                        ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="cancelRequest('${r.id}','${r.type}','${r.date}')">취소</button>`
                        : ''}</td>
                    </tr>`;
                }).join('')
            }
          </tbody>
        </table>
      </div>
    `;

    window.cancelRequest = async (id, type, date) => {
      if (!confirm('휴무 신청을 취소하시겠습니까?')) return;
      try {
        await deleteDayOffRequest(id);
        if (type === 'annual') {
          await deleteLedgerUsageByDate(employee.id, date);
        }
        render();
      } catch (err) {
        alert('취소 실패: ' + (err?.message || err));
      }
    };

    document.getElementById('req-date').addEventListener('change', (e) => {
      const selectedDate = e.target.value;
      const infoEl = document.getElementById('date-off-info');
      if (!selectedDate || !infoEl) return;

      const myExisting = myRequests.find(r =>
        r.date === selectedDate && !['rejected', 'override_rejected'].includes(r.status)
      );
      if (myExisting) {
        const label = ['approved', 'override_approved'].includes(myExisting.status) ? '승인됨' : '대기 중';
        infoEl.textContent = `이미 신청한 날짜입니다 (${label})`;
        infoEl.style.color = 'var(--red)';
        return;
      }

      const offNames = approvedAll
        .filter(r => r.date === selectedDate && r.employee_id !== employee.id)
        .map(r => r.employees?.name || allEmployees.find(emp => emp.id === r.employee_id)?.name || '?');
      infoEl.textContent = offNames.length ? `이 날 이미 휴무: ${offNames.join(', ')}` : '';
      infoEl.style.color = 'var(--gray)';
    });

    const reqTypeEl = document.getElementById('req-type');
    if (reqTypeEl) {
      reqTypeEl.addEventListener('change', () => {
        const annualInfo = document.getElementById('annual-info');
        if (annualInfo) annualInfo.style.display = reqTypeEl.value === 'annual' ? 'block' : 'none';
      });
    }

    document.getElementById('prev-month-emp').addEventListener('click', () => {
      if (isCurrentMonth) return;
      ({ year, month } = prevMonth(year, month)); render();
    });
    document.getElementById('next-month-emp').addEventListener('click', () => {
      ({ year, month } = nextMonth(year, month)); render();
    });

    document.getElementById('submit-req-btn').addEventListener('click', async () => {
      const date = document.getElementById('req-date').value;
      const type = document.getElementById('req-type').value;
      if (!date) return;

      // 중복 신청 방지
      const alreadyExists = myRequests.find(r =>
        r.date === date && !['rejected', 'override_rejected'].includes(r.status)
      );
      if (alreadyExists) {
        document.getElementById('request-result').innerHTML =
          `<div class="alert alert-error">❌ 해당 날짜에 이미 신청 내역이 있습니다.</div>`;
        return;
      }

      if (type === 'annual') {
        const myStat = annualStats.find(s => s.emp.id === employee.id);
        const remaining = myStat ? myStat.remaining : 0;
        if (remaining <= 0) {
          document.getElementById('request-result').innerHTML =
            `<div class="alert alert-error">❌ 잔여 연차가 없습니다. (현재 ${remaining}일)</div>`;
          return;
        }
      }

      await createDayOffRequest({
        employeeId: employee.id,
        date,
        type,
        status: 'pending',
        rejectionReason: null,
      });

      document.getElementById('request-result').innerHTML =
        '<div class="alert alert-success">✅ 신청이 접수되었습니다. 관리자 확인 후 결정됩니다.</div>';
      render();
    });
  }

  await render();
}
