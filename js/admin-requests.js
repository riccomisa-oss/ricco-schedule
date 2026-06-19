function buildOffCalendar(year, month, requests, employees) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const approved = requests.filter(r =>
    ['approved', 'override_approved'].includes(r.status)
  );
  const offMap = new Map();
  approved.forEach(r => {
    if (!offMap.has(r.date)) offMap.set(r.date, []);
    const emp = r.employees || employees.find(e => e.id === r.employee_id);
    offMap.get(r.date).push({ name: emp?.name || '?', annual: r.type === 'annual', half: r.type === 'annual' && Number(r.days) === 0.5 });
  });

  const dowHdr = ['일','월','화','수','목','금','토'].map((d, i) =>
    `<th style="text-align:center;padding:6px 2px;font-size:11px;font-weight:600;color:${i===0?'#c62828':i===6?'#1565c0':'var(--gray)'};">${d}</th>`
  ).join('');

  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push('<td style="border:1px solid var(--light);"></td>');
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const names = offMap.get(ds) || [];
    const dow = new Date(year, month - 1, d).getDay();
    const dateColor = dow === 0 ? '#c62828' : dow === 6 ? '#1565c0' : 'var(--dark)';
    const crowded = names.length >= 2;
    cells.push(`<td style="border:1px solid var(--light);vertical-align:top;padding:4px;height:52px;${crowded?'background:#fff3e0;':''}">
      <div style="font-size:11px;font-weight:600;color:${dateColor};">${d}</div>
      ${names.map(n => `<div style="font-size:10px;background:${crowded?'#ffcc80':'var(--light)'};border-radius:3px;padding:1px 3px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n.annual ? (n.half ? '🌿½' : '🌿') : ''}${esc(n.name)}</div>`).join('')}
    </td>`);
  }
  while (cells.length < totalCells) cells.push('<td style="border:1px solid var(--light);"></td>');

  let rows = '';
  for (let i = 0; i < cells.length; i += 7) rows += `<tr>${cells.slice(i, i+7).join('')}</tr>`;

  return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;"><thead><tr>${dowHdr}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

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

    // 신청 마감 후 배너 (매월 20일 23시 이후, 다음달 요청 대기건 있을 때)
    const nowCheck = new Date();
    const afterDeadline = nowCheck.getDate() > 20 || (nowCheck.getDate() === 20 && nowCheck.getHours() >= 23);
    let notifYear = nowCheck.getFullYear(), notifMonth = nowCheck.getMonth() + 2;
    if (notifMonth > 12) { notifMonth = 1; notifYear++; }
    const pendingCount = requests.filter(r => r.status === 'pending').length;
    const closedBanner = afterDeadline && year === notifYear && month === notifMonth && pendingCount > 0
      ? `<div class="alert alert-info" style="margin-bottom:16px;">📋 이번 달 휴무 신청 마감됨 — 대기 중 <strong>${pendingCount}건</strong>을 검토해 주세요.</div>`
      : '';

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

      ${closedBanner}

      ${warnings.length ? `
        <div class="alert alert-info" style="margin-bottom:16px;">
          ⚠️ 연속 근무 경고: ${warnings.map(w => `<strong>${esc(w.name)}</strong> (${w.dates})`).join(', ')}
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
                      <td>${esc(emp?.name || '-')}</td>
                      <td>${r.date}</td>
                      <td>${r.type === 'normal' ? '휴무 요청' : (Number(r.days) === 0.5 ? '연차 반차' : '연차 사용')}</td>
                      <td style="font-size:12px;color:var(--gray);">${new Date(r.requested_at).toLocaleString('ko-KR')}</td>
                      <td><span class="badge ${badgeMap[r.status] || ''}" style="${badgeStyle}">${labelMap[r.status] || r.status}</span></td>
                      <td style="font-size:12px;color:var(--gray);">${esc(r.rejection_reason || '-')}</td>
                      <td style="white-space:nowrap;">
                        ${isPending ? `
                          <button class="btn btn-sm btn-primary" onclick="doApprove('${r.id}','${r.type}','${r.employee_id}','${r.date}')">승인</button>
                          <button class="btn btn-sm btn-ghost" style="color:var(--red);" onclick="doReject('${r.id}')">거절</button>
                        ` : ''}
                        ${canOverrideApprove ? `<button class="btn btn-ghost btn-sm" style="color:var(--olive);" onclick="doOverride('${r.id}','override_approved','${r.type}','${r.employee_id}','${r.date}')">승인으로</button>` : ''}
                        ${canOverrideReject  ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);"   onclick="doOverride('${r.id}','override_rejected','${r.type}','${r.employee_id}','${r.date}')">취소</button>` : ''}
                        <button class="btn btn-ghost btn-sm" style="color:var(--gray);" onclick="doDelete('${r.id}','${r.type}','${r.employee_id}','${r.date}')">🗑</button>
                      </td>
                    </tr>`;
                }).join('')
            }
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top:16px;padding:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--gray);margin-bottom:10px;">월별 휴무 현황 (승인)</div>
        ${buildOffCalendar(year, month, requests, employees)}
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
      // 구역 최소 인원/스킬 타당성 — 승인 시 그날 스케줄이 펑크나는지 차단
      const emp = employees.find(e => e.id === employeeId);
      const selfIsHalf = type === 'annual' && Number((requests.find(r => r.id === id) || {}).days) === 0.5;
      const feas = offFeasibility(emp, date, employees, requests, conditions, scheduledOffDates, selfIsHalf);
      if (!feas.ok) {
        const [, m, d] = date.split('-');
        if (!confirm(`⚠️ ${Number(m)}월 ${Number(d)}일 ${emp?.name || ''} 휴무를 승인하면 그날 최소 인원이 깨집니다:\n· ${feas.problems.join('\n· ')}\n\n이 날은 스케줄을 정상적으로 짤 수 없습니다. 그래도 승인하시겠습니까?`)) return;
      }
      if (type === 'annual') {
        const useDays = Number((requests.find(r => r.id === id) || {}).days) || 1;
        const stats = await getAnnualLeaveStats(branchId, year);
        const st = stats.find(s => s.emp.id === employeeId);
        if (st && st.remaining < useDays) {
          const [, m, d] = date.split('-');
          if (!confirm(`⚠️ ${st.emp?.name || ''} 연차 잔여 ${st.remaining}일.\n${Number(m)}월 ${Number(d)}일 연차 ${useDays}일을 승인하면 마이너스가 됩니다. 계속할까요?`)) return;
        }
      }
      await resolveDayOffRequest(id, 'approved');
      if (type === 'annual') {
        const useDays = Number((requests.find(r => r.id === id) || {}).days) || 1;
        await deleteLedgerUsageByDate(employeeId, date); // 멱등: 잔재 제거 후 정확한 일수 1건
        await addLedgerEntry({ employeeId, date, type: 'usage', days: useDays, note: useDays === 0.5 ? '연차 반차' : '연차 사용' });
      }
      render();
    };

    window.doReject = async (id) => {
      const reason = prompt('거절 사유를 입력하세요 (선택 사항)');
      if (reason === null) return;
      await resolveDayOffRequest(id, 'rejected', reason.trim() || null);
      render();
    };

    window.doOverride = async (id, newStatus, type, employeeId, date) => {
      // 거절 연차를 '승인으로' 되돌릴 때도 잔여 음수 경고 (doApprove와 동일 가드)
      const useDays = Number((requests.find(r => r.id === id) || {}).days) || 1;
      if (newStatus === 'override_approved') {
        // 구역 최소 인원/스킬 타당성 — 승인으로 되돌릴 때도 그날 펑크 차단
        const emp = employees.find(e => e.id === employeeId);
        const selfIsHalf = type === 'annual' && useDays === 0.5;
        const feas = offFeasibility(emp, date, employees, requests, conditions, scheduledOffDates, selfIsHalf);
        if (!feas.ok) {
          const [, m, d] = date.split('-');
          if (!confirm(`⚠️ ${Number(m)}월 ${Number(d)}일 ${emp?.name || ''} 휴무를 승인하면 그날 최소 인원이 깨집니다:\n· ${feas.problems.join('\n· ')}\n\n그래도 승인할까요?`)) return;
        }
      }
      if (type === 'annual' && newStatus === 'override_approved') {
        const stats = await getAnnualLeaveStats(branchId, year);
        const st = stats.find(s => s.emp.id === employeeId);
        if (st && st.remaining < useDays) {
          const [, m, d] = date.split('-');
          if (!confirm(`⚠️ ${st.emp?.name || ''} 연차 잔여 ${st.remaining}일.\n${Number(m)}월 ${Number(d)}일 연차 ${useDays}일을 승인하면 마이너스가 됩니다. 계속할까요?`)) return;
        }
      }
      await overrideDayOffRequest(id, newStatus);
      if (type === 'annual') {
        if (newStatus === 'override_rejected') {
          await deleteLedgerUsageByDate(employeeId, date);
        } else if (newStatus === 'override_approved') {
          await deleteLedgerUsageByDate(employeeId, date); // 멱등
          await addLedgerEntry({ employeeId, date, type: 'usage', days: useDays, note: useDays === 0.5 ? '연차 반차' : '연차 사용' });
        }
      }
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

// 승인 타당성 검사: 이 직원의 휴무를 그날 승인하면 구역 최소 인원/스킬이 깨지는가?
//  - 보장 인력은 '정직원'. 알바는 현장 호출(무제한)이라 홀 총원은 안 막고, 홀은 min_fulltime만 검사.
//  - 주방은 전원 정직 → 총원·피자·파스타·오픈 가능 인원을 모두 검사.
//  - 승인된 휴무(approved/override_approved) + 이미 배정된 휴무(schedule)까지 합산해 그날 '쉬는' 사람을 센다.
function offFeasibility(emp, date, employees, requests, conditions, scheduledOffDates = new Map(), selfIsHalf = false) {
  if (!emp || !emp.role || !date) return { ok: true, problems: [] };
  const zone = emp.role.startsWith('kitchen') ? 'kitchen' : emp.role.startsWith('hall') ? 'hall' : null;
  if (!zone) return { ok: true, problems: [] };

  const [yy, mm, dd] = date.split('-').map(Number);
  const weekend = typeof isHolidayOrWeekend === 'function' && isHolidayOrWeekend(yy, mm, dd);
  const cond = (conditions || []).find(c => c.zone === zone && c.day_type === (weekend ? 'weekend' : 'weekday'));
  if (!cond) return { ok: true, problems: [] };

  // 그날 이 구역에서 '쉬는' 직원 id. 반차(annual·0.5일)는 그날 절반 근무 → 엔진/연속근무경고와
  // 동일하게 '쉬는 사람'에서 제외한다(거짓 차단 방지). 승인 대상 본인이 반차면 emp.id도 안 넣음.
  const isHalf = r => r.type === 'annual' && Number(r.days) === 0.5;
  const offIds = new Set();
  if (!selfIsHalf) offIds.add(emp.id);
  (requests || []).forEach(r => {
    if (r.date === date && ['approved', 'override_approved'].includes(r.status) && !isHalf(r)) offIds.add(r.employee_id);
  });
  scheduledOffDates.forEach((set, eid) => { if (set.has(date)) offIds.add(eid); });

  const zoneEmps = (employees || []).filter(e => e.role && e.role.startsWith(zone) && e.active !== false);
  const working = zoneEmps.filter(e => !offIds.has(e.id));
  const workFull = working.filter(e => e.employment_type === 'fulltime');
  const cnt = pred => working.filter(pred).length;

  const problems = [];
  if (zone === 'hall') {
    const need = cond.min_fulltime ?? 0;
    if (workFull.length < need) problems.push(`홀 정직원 ${workFull.length}명 < 최소 ${need}명`);
  } else { // kitchen
    if (working.length < (cond.min_total ?? 0)) problems.push(`주방 총원 ${working.length}명 < 최소 ${cond.min_total}명`);
    if (cnt(e => e.pizza_capable)  < (cond.min_pizza_capable ?? 0)) problems.push(`피자 가능 ${cnt(e => e.pizza_capable)}명 < 최소 ${cond.min_pizza_capable}명`);
    if (cnt(e => e.pasta_capable)  < (cond.min_pasta_capable ?? 0)) problems.push(`파스타 가능 ${cnt(e => e.pasta_capable)}명 < 최소 ${cond.min_pasta_capable}명`);
    if (cnt(e => e.open_capable)   < (cond.min_open_shift ?? 0))    problems.push(`오픈 가능 ${cnt(e => e.open_capable)}명 < 최소 ${cond.min_open_shift}명`);
  }
  return { ok: problems.length === 0, problems, weekend };
}

function getConsecutiveWarnings(employees, requests, year, month, conditions, scheduledOffDates = new Map()) {
  const maxConsecutive = conditions[0]?.max_consecutive_days || 5;
  const daysInMonth = new Date(year, month, 0).getDate();
  const warnings = [];

  employees.forEach(emp => {
    const offDates = new Set([
      ...requests
        .filter(r => r.employee_id === emp.id && ['approved', 'override_approved'].includes(r.status) && !(r.type === 'annual' && Number(r.days) === 0.5))
        .map(r => r.date),
      ...(scheduledOffDates.get(emp.id) || []),
    ]);

    let streak = 0;
    let maxStreak = 0;
    let streakStart = null;
    let longestStart = null;
    let longestEnd = null;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (!offDates.has(date)) {
        if (streak === 0) streakStart = date;
        streak++;
        if (streak > maxStreak) { maxStreak = streak; longestStart = streakStart; longestEnd = date; }
      } else {
        streak = 0;
        streakStart = null;
      }
    }

    if (maxStreak > maxConsecutive) {
      warnings.push({ name: emp.name, dates: `${longestStart}~${longestEnd}` });
    }
  });

  return warnings;
}
