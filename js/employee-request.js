function isRequestPeriodOpen() {
  return true; // 테스트용 — 실제 배포 전 원래 조건으로 복원
  // const now = new Date();
  // const day = now.getDate();
  // const hour = now.getHours();
  // return (day === 15 && hour >= 9) || (day === 16 && hour < 9);
}

function getNextPeriodLabel() {
  const now = new Date();
  const d = now.getDate();
  const h = now.getHours();
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-indexed
  if (d > 16 || (d === 16 && h >= 9)) {
    m++;
    if (m > 11) { m = 0; y++; }
  }
  const fmt = (date) => date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${fmt(new Date(y, m, 15, 9, 0))} ~ ${fmt(new Date(y, m, 16, 9, 0))}`;
}

async function renderRequestTab(employee, branchId) {
  const el = document.getElementById('emp-request');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  // 신청 기간(15일 09시~16일 09시)에는 다음달로 기본 설정
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  if (isRequestPeriodOpen()) {
    ({ year, month } = nextMonth(year, month));
  }

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

      ${isRequestPeriodOpen() ? `
      <div class="card" style="margin-bottom:16px;padding:20px;">

        ${employee.hire_date != null ? `
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <button id="type-normal" class="btn btn-primary" style="flex:1;padding:10px 0;font-size:14px;font-weight:700;">휴무 요청</button>
          <button id="type-annual" class="btn btn-ghost" style="flex:1;padding:10px 0;font-size:14px;font-weight:600;">연차 사용</button>
        </div>
        <input type="hidden" id="req-type" value="normal" />
        ` : `
        <div style="margin-bottom:16px;">
          <button class="btn btn-primary" style="padding:10px 24px;font-size:14px;font-weight:700;pointer-events:none;">휴무 요청</button>
        </div>
        <input type="hidden" id="req-type" value="normal" />
        `}

        ${myStat ? `
        <div id="annual-info" style="display:none;background:#f1f8e9;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;">
          연차 잔여 <strong style="color:var(--olive);font-size:15px;">${myStat.remaining}일</strong>
          <span style="color:var(--gray);margin-left:4px;">(총 ${myStat.total}일 중 ${myStat.used}일 사용)</span>
        </div>` : ''}

        <div style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;color:var(--gray);letter-spacing:0.03em;display:block;margin-bottom:10px;">날짜 선택</label>
          ${(() => {
            const blocked = new Set(
              myRequests.filter(r => !['rejected','override_rejected'].includes(r.status)).map(r => r.date)
            );
            const othersOff = new Set(approvedAll.map(r => r.date));
            const firstDow = new Date(year, month - 1, 1).getDay();
            const daysInMonth = new Date(year, month, 0).getDate();
            const dowHdr = ['일','월','화','수','목','금','토'].map((d, i) =>
              `<div style="text-align:center;font-size:11px;font-weight:600;color:${i===0?'#c62828':i===6?'#1565c0':'var(--gray)'};padding:4px 0;">${d}</div>`
            ).join('');
            let cells = '';
            for (let i = 0; i < firstDow; i++) cells += '<div></div>';
            for (let d = 1; d <= daysInMonth; d++) {
              const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              const dow = new Date(year, month - 1, d).getDay();
              const isSun = dow === 0, isSat = dow === 6;
              const isHol = isHolidayOrWeekend(year, month, d) && !isSun && !isSat;
              const isBlocked = blocked.has(ds);
              const hasOff = othersOff.has(ds);
              const textColor = isBlocked ? '#ccc' : (isSun || isHol) ? '#c62828' : isSat ? '#1565c0' : 'var(--dark)';
              cells += `<button data-date="${ds}" onclick="pickDate('${ds}')" ${isBlocked ? 'disabled' : ''}
                style="border:none;background:transparent;color:${textColor};border-radius:50%;padding:0;width:100%;aspect-ratio:1;font-size:13px;font-weight:500;cursor:${isBlocked?'not-allowed':'pointer'};${isBlocked?'opacity:0.3;':''}position:relative;">
                ${d}${hasOff && !isBlocked ? '<span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:3px;height:3px;border-radius:50%;background:var(--red);display:block;"></span>' : ''}
              </button>`;
            }
            return `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">${dowHdr}${cells}</div>`;
          })()}
          <input type="hidden" id="req-date" value="" />
          <div id="selected-date-label" style="margin-top:12px;font-size:14px;font-weight:600;color:var(--dark);min-height:20px;text-align:center;"></div>
        </div>
        <div id="date-off-info" style="font-size:12px;min-height:16px;margin-bottom:16px;padding-left:2px;color:var(--gray);text-align:center;"></div>

        <button class="btn btn-primary" id="submit-req-btn" style="width:100%;padding:14px;font-size:15px;border-radius:8px;font-weight:700;letter-spacing:0.02em;">신청하기</button>
      </div>
      ` : `
      <div class="card" style="margin-bottom:16px;text-align:center;padding:28px 16px;">
        <div style="font-size:28px;margin-bottom:10px;">🔒</div>
        <div style="font-weight:600;margin-bottom:6px;">현재 신청 기간이 아닙니다</div>
        <div style="font-size:13px;color:var(--gray);">매월 15일 09:00 ~ 16일 09:00</div>
        <div style="font-size:12px;color:var(--gray);margin-top:6px;">다음 신청 기간: ${getNextPeriodLabel()}</div>
      </div>
      `}

      <div>
        <div style="font-size:13px;font-weight:600;color:var(--gray);margin-bottom:10px;">신청 내역</div>
        ${myRequests.length === 0
          ? '<div class="card" style="text-align:center;color:var(--gray);padding:24px;font-size:14px;">신청 내역이 없습니다.</div>'
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
              const [y, m, d] = r.date.split('-');
              const dateLabel = `${Number(m)}월 ${Number(d)}일`;
              const typeLabel = r.type === 'normal' ? '휴무 요청' : '연차 사용';
              return `
                <div class="card" style="margin-bottom:10px;padding:14px 16px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                      <div style="font-weight:700;font-size:16px;">${dateLabel}</div>
                      <div style="font-size:13px;color:var(--gray);margin-top:3px;">${typeLabel}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                      ${badge}
                      ${canCancel
                        ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="cancelRequest('${r.id}','${r.type}','${r.date}')">취소</button>`
                        : ''}
                    </div>
                  </div>
                  ${isRejected && r.rejection_reason
                    ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--light);font-size:12px;color:var(--red);">거절 사유: ${r.rejection_reason}</div>`
                    : ''}
                </div>`;
            }).join('')
        }
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

    if (isRequestPeriodOpen()) {
      window.pickDate = (dateStr) => {
        // 이전 선택 초기화
        document.querySelectorAll('[data-date]').forEach(btn => {
          if (btn.disabled) return;
          btn.style.background = 'transparent';
          btn.style.color = btn._origColor || '';
          btn.style.fontWeight = '500';
        });
        // 선택 표시
        const btn = document.querySelector(`[data-date="${dateStr}"]`);
        if (btn) {
          if (!btn._origColor) btn._origColor = btn.style.color;
          btn.style.background = 'var(--red)';
          btn.style.color = '#fff';
          btn.style.fontWeight = '700';
        }
        document.getElementById('req-date').value = dateStr;

        // 날짜 레이블
        const [y, m, d] = dateStr.split('-');
        const dow = ['일','월','화','수','목','금','토'][new Date(dateStr).getDay()];
        const lbl = document.getElementById('selected-date-label');
        if (lbl) lbl.textContent = `${Number(m)}월 ${Number(d)}일 (${dow})`;

        // 다른 직원 휴무 정보
        const infoEl = document.getElementById('date-off-info');
        if (!infoEl) return;
        const offNames = approvedAll
          .filter(r => r.date === dateStr && r.employee_id !== employee.id)
          .map(r => r.employees?.name || allEmployees.find(emp => emp.id === r.employee_id)?.name || '?');
        infoEl.textContent = offNames.length ? `이 날 이미 휴무: ${offNames.join(', ')}` : '';
      };

      // 토글 버튼 (연차 직원만)
      const btnNormal = document.getElementById('type-normal');
      const btnAnnual = document.getElementById('type-annual');
      const reqTypeEl = document.getElementById('req-type');
      const annualInfo = document.getElementById('annual-info');

      function setType(type) {
        reqTypeEl.value = type;
        if (btnNormal && btnAnnual) {
          const isAnnual = type === 'annual';
          btnNormal.className = isAnnual ? 'btn btn-ghost' : 'btn btn-primary';
          btnNormal.style.cssText = 'flex:1;padding:10px 0;font-size:14px;font-weight:700;';
          btnAnnual.className = isAnnual ? 'btn btn-primary' : 'btn btn-ghost';
          btnAnnual.style.cssText = 'flex:1;padding:10px 0;font-size:14px;font-weight:700;';
        }
        if (annualInfo) annualInfo.style.display = type === 'annual' ? 'block' : 'none';
      }

      if (btnNormal) btnNormal.addEventListener('click', () => setType('normal'));
      if (btnAnnual) btnAnnual.addEventListener('click', () => setType('annual'));
    }

    document.getElementById('prev-month-emp').addEventListener('click', () => {
      if (isCurrentMonth) return;
      ({ year, month } = prevMonth(year, month)); render();
    });
    document.getElementById('next-month-emp').addEventListener('click', () => {
      ({ year, month } = nextMonth(year, month)); render();
    });

    if (!isRequestPeriodOpen()) return;

    document.getElementById('submit-req-btn').addEventListener('click', async () => {
      const date = document.getElementById('req-date').value;
      const type = document.getElementById('req-type').value;
      if (!date) {
        document.getElementById('request-result').innerHTML =
          '<div class="alert alert-error">날짜를 선택해주세요.</div>';
        return;
      }

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
