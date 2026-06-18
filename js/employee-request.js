function isRequestPeriodOpen() {
  const now = new Date();
  const day = now.getDate();
  const hour = now.getHours();
  // 매월 15일 00:00 ~ 20일 23:00 (15~19일 종일, 20일은 23시 정각에 마감)
  return (day >= 15 && day <= 19) || (day === 20 && hour < 23);
}

function getNextPeriodLabel() {
  const now = new Date();
  const d = now.getDate();
  const h = now.getHours();
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-indexed
  if (d > 20 || (d === 20 && h >= 23)) {
    m++;
    if (m > 11) { m = 0; y++; }
  }
  const fmt = (date) => date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${fmt(new Date(y, m, 15, 0, 0))} ~ ${fmt(new Date(y, m, 20, 23, 0))}`;
}

async function renderRequestTab(employee, branchId) {
  const el = document.getElementById('emp-request');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const now = new Date();
  // 신청 기간(15일 00시~20일 23시)에는 다음달로 기본 설정
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  if (isRequestPeriodOpen()) {
    ({ year, month } = nextMonth(year, month));
  }
  // 신청 받는 대상 달(다음 달) 고정 — 다른 미래 달로 넘겨 선점 신청하는 것 방지
  const targetY = year, targetM = month;

  async function render() {
    const now2 = new Date();
    const [allEmployees, conditions, myRequests, annualStats, pendingAnnualDays] = await Promise.all([
      getEmployees(branchId),
      getConditions(branchId),
      getEmployeeDayOffRequests(employee.id, year, month),
      getAnnualLeaveStats(branchId, year),
      getEmployeePendingAnnualDays(employee.id),
    ]);

    const allRequests = await getDayOffRequests(branchId, year, month);
    const approvedAll = allRequests.filter(r => ['approved', 'override_approved'].includes(r.status));

    // 연차 잔여일 (전기간 잔여 − 전기간 pending 연차 일수 = 지금 새로 더 쓸 수 있는 양)
    const myStat = annualStats.find(s => s.emp.id === employee.id);
    const rawRemaining = myStat ? myStat.remaining : 0;
    const effRemaining = effectiveAnnualRemaining(rawRemaining, pendingAnnualDays);
    // 이번 달 기제출 비거절(휴무+연차) 일수 합 — 월 합산 캡의 baseline
    const monthBaseline = sumDays(activeRequests(myRequests));

    const isCurrentMonth = year === now2.getFullYear() && month === now2.getMonth() + 1;
    const isPastMonth = year < now2.getFullYear() || (year === now2.getFullYear() && month < now2.getMonth() + 1);
    // 신청 폼은 '대상 달'에서만 노출 (다른 달은 조회만)
    const onTarget = isRequestPeriodOpen() && year === targetY && month === targetM;

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

      ${onTarget ? `
      <div class="card" style="margin-bottom:16px;padding:20px;">

        ${employee.hire_date != null ? `
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <button id="type-normal" class="btn btn-primary" style="flex:1;padding:10px 0;font-size:14px;font-weight:700;">휴무 요청</button>
          <button id="type-annual" class="btn btn-ghost" style="flex:1;padding:10px 0;font-size:14px;font-weight:600;${effRemaining < 0.5 ? 'opacity:0.4;cursor:not-allowed;' : ''}" ${effRemaining < 0.5 ? 'disabled title="잔여 연차가 없습니다"' : ''}>연차 사용${effRemaining < 0.5 ? ' (잔여 0)' : ''}</button>
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
          <div>연차 잔여 <strong id="annual-remaining-num" style="color:var(--olive);font-size:15px;">${effRemaining}일</strong>
          <span style="color:var(--gray);margin-left:4px;">(총 ${myStat.total}일 중 ${myStat.used}일 사용${pendingAnnualDays > 0 ? `, 대기 ${pendingAnnualDays}일` : ''})</span>
          <span id="annual-picked-hint" style="color:var(--olive);margin-left:6px;font-weight:600;"></span></div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:8px;">
            <span style="color:var(--gray);">사용 단위:</span>
            <button type="button" id="amt-full" class="btn btn-primary btn-sm" style="padding:3px 10px;">종일(1일)</button>
            <button type="button" id="amt-half" class="btn btn-ghost btn-sm" style="padding:3px 10px;">반차(0.5일)</button>
          </div>
        </div>` : ''}

        <div id="calendar-section" style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;color:var(--gray);letter-spacing:0.03em;display:block;margin-bottom:10px;">날짜 선택 <span style="font-weight:500;">— 휴무는 빨강, 연차는 초록</span></label>
          ${(() => {
            // 비거절 기제출(휴무+연차) → 재선택 불가, 유형별로 색 표시
            const myActiveByDate = new Map(activeRequests(myRequests).map(r => [r.date, r.type]));
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
              const existingType = myActiveByDate.get(ds);
              const isBlocked = existingType != null;
              const hasOff = othersOff.has(ds);
              const baseColor = (isSun || isHol) ? '#c62828' : isSat ? '#1565c0' : 'var(--dark)';
              const blockBg = existingType === 'annual' ? 'var(--olive)' : existingType === 'normal' ? 'var(--red)' : 'transparent';
              const textColor = isBlocked ? '#fff' : baseColor;
              cells += `<button data-date="${ds}" onclick="pickDate('${ds}')" ${isBlocked ? 'disabled' : ''}
                title="${isBlocked ? (existingType === 'annual' ? '신청한 연차' : '신청한 휴무') : ''}"
                style="border:none;background:${isBlocked ? blockBg : 'transparent'};color:${textColor};border-radius:50%;padding:0;width:100%;aspect-ratio:1;font-size:13px;font-weight:${isBlocked ? '700' : '500'};cursor:${isBlocked?'default':'pointer'};${isBlocked?'opacity:0.85;':''}position:relative;">
                ${d}${hasOff && !isBlocked ? '<span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:3px;height:3px;border-radius:50%;background:var(--red);display:block;"></span>' : ''}
              </button>`;
            }
            return `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">${dowHdr}${cells}</div>`;
          })()}
          <input type="hidden" id="req-date" value="" />
          <div id="selected-date-label" style="margin-top:12px;font-size:14px;font-weight:600;color:var(--dark);min-height:20px;text-align:center;"></div>
          <div id="date-off-info" style="font-size:12px;min-height:16px;margin-top:8px;color:var(--gray);text-align:center;"></div>
        </div>

        <button class="btn btn-primary" onclick="submitDayOffRequest()" style="width:100%;padding:14px;font-size:15px;border-radius:8px;font-weight:700;letter-spacing:0.02em;">신청하기</button>
      </div>
      ` : isRequestPeriodOpen() ? `
      <div class="card" style="margin-bottom:16px;text-align:center;padding:28px 16px;">
        <div style="font-size:28px;margin-bottom:10px;">📅</div>
        <div style="font-weight:600;margin-bottom:6px;">${targetM}월 신청만 받는 중입니다</div>
        <div style="font-size:13px;color:var(--gray);">상단 날짜를 ${targetY}년 ${targetM}월로 맞춰 신청해 주세요.</div>
      </div>
      ` : `
      <div class="card" style="margin-bottom:16px;text-align:center;padding:28px 16px;">
        <div style="font-size:28px;margin-bottom:10px;">🔒</div>
        <div style="font-weight:600;margin-bottom:6px;">현재 신청 기간이 아닙니다</div>
        <div style="font-size:13px;color:var(--gray);">매월 15일 00:00 ~ 20일 23:00</div>
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
              const canCancel  = r.status === 'pending'; // 대기 건만 직원 자가 취소 (승인 후 변경은 관리자만)
              const badge = isPending
                ? '<span class="badge" style="background:var(--light);color:var(--gray);">대기 중</span>'
                : isApproved
                  ? '<span class="badge badge-approved">승인</span>'
                  : '<span class="badge badge-rejected">거절</span>';
              const [, m, d] = r.date.split('-');
              const dateLabel = `${Number(m)}월 ${Number(d)}일`;
              const typeLabel = r.type === 'normal' ? '휴무 요청' : (Number(r.days) === 0.5 ? '연차 반차' : '연차 사용');
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
                    ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--light);font-size:12px;color:var(--red);">거절 사유: ${esc(r.rejection_reason)}</div>`
                    : ''}
                </div>`;
            }).join('')
        }
      </div>
    `;

    window.cancelRequest = async (id, type, date) => {
      const [, cm, cd] = date.split('-');
      const what = type === 'annual' ? '연차' : '휴무';
      if (!confirm(`${Number(cm)}월 ${Number(cd)}일 ${what} 신청을 취소할까요?`)) return;
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

    if (onTarget) {
      // 날짜 → {유형, 일수} 매핑. 휴무·연차(종일/반차)를 한 캘린더에서 함께 고른다.
      const selected = new Map();
      let amountDays = 1; // 연차 사용 단위: 1(종일) | 0.5(반차)
      const btnNormal = document.getElementById('type-normal');
      const btnAnnual = document.getElementById('type-annual');
      const reqTypeEl = document.getElementById('req-type');
      const annualInfo = document.getElementById('annual-info');
      const btnFull = document.getElementById('amt-full');
      const btnHalf = document.getElementById('amt-half');

      const currentMode = () => (reqTypeEl ? reqTypeEl.value : 'normal');
      const selectedList = () => [...selected.entries()].map(([date, v]) => ({ date, type: v.type, days: v.days }));

      function cellBg(v) {
        if (v.type === 'normal') return 'var(--red)';
        return v.days === 0.5 ? '#aed581' : 'var(--olive)'; // 반차는 옅은 초록
      }
      function paintCell(ds) {
        const btn = document.querySelector(`[data-date="${ds}"]`);
        if (!btn || btn.disabled) return;
        const v = selected.get(ds);
        if (v) {
          if (!btn._origColor) btn._origColor = btn.style.color;
          btn.style.background = cellBg(v);
          btn.style.color = '#fff';
          btn.style.fontWeight = '700';
        } else {
          btn.style.background = 'transparent';
          btn.style.color = btn._origColor || '';
          btn.style.fontWeight = '500';
        }
      }

      function refreshSelectionUI() {
        // submit가 읽을 직렬화: "날짜:유형:일수"
        const entries = [...selected.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const reqDate = document.getElementById('req-date');
        if (reqDate) reqDate.value = entries.map(([d, v]) => `${d}:${v.type}:${v.days}`).join(',');

        const counts = selectionDays(entries.map(([date, v]) => ({ type: v.type, days: v.days })));
        const lbl = document.getElementById('selected-date-label');
        if (lbl) {
          if (entries.length === 0) {
            lbl.textContent = '';
          } else {
            const parts = entries.map(([ds, v]) => {
              const [, m, d] = ds.split('-');
              const dow = ['일','월','화','수','목','금','토'][new Date(ds).getDay()];
              const tag = v.type === 'annual' ? (v.days === 0.5 ? '🌿반차 ' : '🌿') : '';
              return `${tag}${Number(m)}월 ${Number(d)}일(${dow})`;
            });
            lbl.innerHTML = parts.join(' · ') +
              `<br><span style="font-size:12px;color:var(--gray);font-weight:500;">합계 ${monthBaseline + counts.total}/${MAX_MONTHLY_OFFS}일${counts.annual ? ` · 연차 ${counts.annual}일` : ''}</span>`;
          }
        }
        const hint = document.getElementById('annual-picked-hint');
        if (hint) hint.textContent = counts.annual ? `→ 신청 후 잔여 ${Math.max(0, effRemaining - counts.annual)}일` : '';

        const infoEl = document.getElementById('date-off-info');
        if (infoEl) {
          const names = new Set();
          selected.forEach((_v, ds) => {
            approvedAll
              .filter(r => r.date === ds && r.employee_id !== employee.id)
              .forEach(r => names.add(r.employees?.name || allEmployees.find(emp => emp.id === r.employee_id)?.name || '?'));
          });
          infoEl.textContent = names.size ? `선택한 날 이미 휴무: ${[...names].join(', ')}` : '';
        }
      }

      window.pickDate = (ds) => {
        const mode = currentMode();
        const addDays = mode === 'annual' ? amountDays : 1;
        const resultEl = document.getElementById('request-result');
        const prev = selected.get(ds); // undefined | {type, days}

        if (prev && prev.type === mode && prev.days === addDays) {
          selected.delete(ds);              // 같은 유형·단위 재클릭 → 해제
          paintCell(ds); refreshSelectionUI();
          if (resultEl) resultEl.innerHTML = '';
          return;
        }

        if (prev) selected.delete(ds);      // 유형/단위 변경 — 후보 상태에서 캡 재검증
        const check = canAddSelection({ mode, addDays, baseline: monthBaseline, selected: selectedList(), effRemaining });
        if (!check.ok) {
          if (prev) selected.set(ds, prev); // 실패 → 원상복구
          paintCell(ds); refreshSelectionUI();
          if (resultEl) resultEl.innerHTML = `<div class="alert alert-error">${check.reason}</div>`;
          return;
        }
        selected.set(ds, { type: mode, days: addDays });
        paintCell(ds); refreshSelectionUI();
        if (resultEl) resultEl.innerHTML = '';
      };

      function setType(type) {
        if (reqTypeEl) reqTypeEl.value = type;
        if (btnNormal && btnAnnual) {
          const isAnnual = type === 'annual';
          btnNormal.className = isAnnual ? 'btn btn-ghost' : 'btn btn-primary';
          btnNormal.style.cssText = 'flex:1;padding:10px 0;font-size:14px;font-weight:700;';
          btnAnnual.className = isAnnual ? 'btn btn-primary' : 'btn btn-ghost';
          btnAnnual.style.cssText = `flex:1;padding:10px 0;font-size:14px;font-weight:700;${effRemaining < 0.5 ? 'opacity:0.4;cursor:not-allowed;' : ''}`;
        }
        if (annualInfo) annualInfo.style.display = type === 'annual' ? 'block' : 'none';
      }

      function setAmount(d) {
        amountDays = d;
        if (btnFull) { btnFull.className = d === 1 ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'; btnFull.style.padding = '3px 10px'; }
        if (btnHalf) { btnHalf.className = d === 0.5 ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'; btnHalf.style.padding = '3px 10px'; }
      }

      if (btnNormal) btnNormal.addEventListener('click', () => setType('normal'));
      if (btnAnnual && !btnAnnual.disabled) btnAnnual.addEventListener('click', () => setType('annual'));
      if (btnFull) btnFull.addEventListener('click', () => setAmount(1));
      if (btnHalf) btnHalf.addEventListener('click', () => setAmount(0.5));
    }

    document.getElementById('prev-month-emp').addEventListener('click', () => {
      if (isCurrentMonth) return;
      ({ year, month } = prevMonth(year, month)); render();
    });
    document.getElementById('next-month-emp').addEventListener('click', () => {
      ({ year, month } = nextMonth(year, month)); render();
    });

    if (!isRequestPeriodOpen()) return;

    window.submitDayOffRequest = async () => {
      const resultEl = document.getElementById('request-result');
      try {
        const raw = (document.getElementById('req-date').value || '').trim();
        const picks = raw
          ? raw.split(',').filter(Boolean).map(p => {
              const [date, type, days] = p.split(':');
              return { date, type: type === 'annual' ? 'annual' : 'normal', days: Number(days) || 1 };
            })
          : [];

        // 대상 달(다음 달) 외 신청 차단 — 다른 미래 달 선점 방지
        const targetYM = `${targetY}-${String(targetM).padStart(2, '0')}`;
        if (picks.some(p => p.date.slice(0, 7) !== targetYM)) {
          if (resultEl) resultEl.innerHTML = `<div class="alert alert-error">❌ ${targetM}월 신청만 가능합니다.</div>`;
          return;
        }

        // 월 합산 3일 + 잔여 연차 최종 검증 (R1/R2)
        const check = validateSubmission({ baseline: monthBaseline, selected: picks, effRemaining });
        if (!check.ok) {
          if (resultEl) resultEl.innerHTML = `<div class="alert alert-error">❌ ${check.reason}</div>`;
          return;
        }

        // 같은 날 중복(이미 신청한 비거절 날짜) 재검증 (R3)
        const blockedDates = new Set(activeRequests(myRequests).map(r => r.date));
        const dup = picks.find(p => blockedDates.has(p.date));
        if (dup) {
          const [, m, d] = dup.date.split('-');
          if (resultEl) resultEl.innerHTML = `<div class="alert alert-error">❌ ${Number(m)}월 ${Number(d)}일은 이미 신청한 날짜예요.</div>`;
          return;
        }

        const results = await Promise.allSettled(picks.map(p => createDayOffRequest({
          employeeId: employee.id,
          date: p.date,
          type: p.type,
          days: p.days,
          status: 'pending',
          rejectionReason: null,
        })));
        const failed = results.filter(r => r.status === 'rejected').length;
        const okN = results.length - failed;
        if (failed > 0) {
          if (resultEl) resultEl.innerHTML = `<div class="alert alert-error">⚠️ ${okN}일 신청됨, ${failed}일 실패. 잠시 후 다시 시도해주세요.</div>`;
        } else {
          const normalDays = sumDays(picks.filter(p => p.type === 'normal'));
          const annualDays = sumDays(picks.filter(p => p.type === 'annual'));
          const summary = [normalDays ? `휴무 ${normalDays}일` : '', annualDays ? `연차 ${annualDays}일` : ''].filter(Boolean).join(' · ');
          if (resultEl) resultEl.innerHTML = `<div class="alert alert-success">✅ ${summary} 신청이 접수되었습니다. 관리자 확인 후 결정됩니다.</div>`;
        }
        render();
      } catch (err) {
        if (resultEl) resultEl.innerHTML = `<div class="alert alert-error">❌ 오류가 발생했어요: ${err?.message || err}</div>`;
      }
    };
  }

  await render();
}
