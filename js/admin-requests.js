async function renderRequestsTab(branchId) {
  const el = document.getElementById('requests');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  async function render() {
    const [requests, employees, conditions] = await Promise.all([
      getDayOffRequests(branchId, year, month),
      getEmployees(branchId),
      getConditions(branchId),
    ]);

    // 배정된 휴무(schedule_entries shift_type='off')도 연속근무 체크에 포함
    const schedule = await getScheduleIfExists(branchId, year, month);
    const entries = schedule ? await getScheduleEntries(schedule.id) : [];
    const scheduledOffDates = new Map();
    entries.filter(e => e.shift_type === 'off').forEach(e => {
      if (!scheduledOffDates.has(e.employee_id)) scheduledOffDates.set(e.employee_id, new Set());
      scheduledOffDates.get(e.employee_id).add(e.date);
    });

    const warnings = getConsecutiveWarnings(employees, requests, year, month, conditions, scheduledOffDates);

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2>휴무 요청 현황${requests.filter(r => r.status === 'pending').length > 0
          ? ` <span style="background:var(--red);color:#fff;border-radius:10px;font-size:12px;padding:1px 8px;vertical-align:middle;">${requests.filter(r => r.status === 'pending').length}</span>`
          : ''}</h2>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="prev-month-req">◀</button>
          <span style="font-weight:600;">${year}년 ${month}월</span>
          <button class="btn btn-ghost btn-sm" id="next-month-req">▶</button>
        </div>
      </div>

      ${warnings.length ? `
        <div class="alert alert-info" style="margin-bottom:16px;">
          ⚠️ 연속 근무 경고: ${warnings.map(w => `<strong>${w.name}</strong> (${w.dates})`).join(', ')}
        </div>` : ''}

      ${requests.some(r => r.type === 'annual') ? `
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
          <button class="btn btn-ghost btn-sm" id="delete-all-annual-btn" style="color:var(--red);border:1px solid var(--red);">
            이 달 연차 전체 삭제
          </button>
        </div>` : ''}

      <div class="card" style="padding:0;">
        <table class="data-table">
          <thead>
            <tr><th>직원</th><th>날짜</th><th>유형</th><th>신청 시각</th><th>상태</th><th>사유</th><th></th></tr>
          </thead>
          <tbody>
            ${requests.length === 0
              ? '<tr><td colspan="7" style="text-align:center;color:var(--gray);">신청 내역이 없습니다.</td></tr>'
              : requests.map(r => {
                  const emp = r.employees || employees.find(e => e.id === r.employee_id);
                  const badgeMap = { pending:'', approved:'badge-approved', rejected:'badge-rejected', override_approved:'badge-override', override_rejected:'badge-rejected' };
                  const labelMap = { pending:'대기 중', approved:'승인', rejected:'거절', override_approved:'관리자 승인', override_rejected:'관리자 거절' };
                  const badgeStyle = r.status === 'pending' ? 'background:var(--light);color:var(--gray);' : '';
                  const isPending  = r.status === 'pending';
                  const canOverrideApprove = r.status === 'rejected';
                  const canOverrideReject  = r.status === 'approved' || r.status === 'override_approved';
                  return `
                    <tr${isPending ? ' style="background:#fffbf0;"' : ''}>
                      <td>${emp?.name || '-'}</td>
                      <td>${r.date}</td>
                      <td>${r.type === 'normal' ? '정상 휴무' : '연차'}</td>
                      <td style="font-size:12px;color:var(--gray);">${new Date(r.requested_at).toLocaleString('ko-KR')}</td>
                      <td><span class="badge ${badgeMap[r.status] || ''}" style="${badgeStyle}">${labelMap[r.status] || r.status}</span></td>
                      <td style="font-size:12px;color:var(--gray);">${r.rejection_reason || '-'}</td>
                      <td style="white-space:nowrap;">
                        ${isPending ? `
                          <button class="btn btn-sm btn-primary" onclick="doApprove('${r.id}','${r.type}','${r.employee_id}','${r.date}')">승인</button>
                          <button class="btn btn-sm btn-ghost" style="color:var(--red);" onclick="doReject('${r.id}')">거절</button>
                        ` : ''}
                        ${canOverrideApprove ? `<button class="btn btn-ghost btn-sm" style="color:var(--olive);" onclick="doOverride('${r.id}','override_approved')">승인으로</button>` : ''}
                        ${canOverrideReject  ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);"   onclick="doOverride('${r.id}','override_rejected')">취소</button>` : ''}
                        <button class="btn btn-ghost btn-sm" style="color:var(--gray);" onclick="doDelete('${r.id}','${r.type}','${r.employee_id}','${r.date}')">🗑</button>
                      </td>
                    </tr>`;
                }).join('')
            }
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('prev-month-req').addEventListener('click', () => {
      ({ year, month } = prevMonth(year, month)); render();
    });
    document.getElementById('next-month-req').addEventListener('click', () => {
      ({ year, month } = nextMonth(year, month)); render();
    });

    const deleteAllBtn = document.getElementById('delete-all-annual-btn');
    if (deleteAllBtn) {
      deleteAllBtn.addEventListener('click', async () => {
        const annualReqs = requests.filter(r => r.type === 'annual');
        if (!confirm(`${year}년 ${month}월 연차 신청 ${annualReqs.length}건을 전체 삭제하시겠습니까?`)) return;
        await Promise.all(annualReqs.flatMap(r => [
          deleteDayOffRequest(r.id),
          deleteLedgerUsageByDate(r.employee_id, r.date),
        ]));
        render();
      });
    }

    window.doApprove = async (id, type, employeeId, date) => {
      await resolveDayOffRequest(id, 'approved');
      if (type === 'annual') {
        await addLedgerEntry({ employeeId, date, type: 'usage', days: 1, note: '연차 사용' });
      }
      render();
    };

    window.doReject = async (id) => {
      const reason = prompt('거절 사유를 입력하세요 (선택 사항)');
      if (reason === null) return;
      await resolveDayOffRequest(id, 'rejected', reason.trim() || null);
      render();
    };

    window.doOverride = async (id, newStatus) => {
      await overrideDayOffRequest(id, newStatus);
      render();
    };

    window.doDelete = async (id, type, employeeId, date) => {
      if (!confirm('이 신청을 삭제하시겠습니까?')) return;
      await deleteDayOffRequest(id);
      if (type === 'annual') await deleteLedgerUsageByDate(employeeId, date);
      render();
    };
  }

  await render();
}

function getConsecutiveWarnings(employees, requests, year, month, conditions, scheduledOffDates = new Map()) {
  const maxConsecutive = conditions[0]?.max_consecutive_days || 5;
  const daysInMonth = new Date(year, month, 0).getDate();
  const warnings = [];

  employees.forEach(emp => {
    const offDates = new Set([
      ...requests
        .filter(r => r.employee_id === emp.id && ['approved', 'override_approved'].includes(r.status))
        .map(r => r.date),
      ...(scheduledOffDates.get(emp.id) || []),
    ]);

    let streak = 0;
    let maxStreak = 0;
    let streakStart = null;
    let longestEnd = null;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (!offDates.has(date)) {
        if (streak === 0) streakStart = date;
        streak++;
        if (streak > maxStreak) { maxStreak = streak; longestEnd = date; }
      } else {
        streak = 0;
        streakStart = null;
      }
    }

    if (maxStreak > maxConsecutive) {
      warnings.push({ name: emp.name, dates: `${streakStart}~${longestEnd}` });
    }
  });

  return warnings;
}
