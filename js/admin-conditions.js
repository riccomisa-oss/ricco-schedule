async function renderConditionsTab(branchId) {
  const el = document.getElementById('conditions');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const conditions = await getConditions(branchId);
  const byKey = {};
  conditions.forEach(c => { byKey[`${c.day_type}_${c.zone}`] = c; });

  function row(label, dayType, zone, field, value) {
    const condId = byKey[`${dayType}_${zone}`]?.id || '';
    return `
      <tr>
        <td>${label}</td>
        <td><input type="number" value="${value}" min="0"
          style="width:70px;padding:6px;border:1px solid var(--light);border-radius:4px;"
          data-cond-id="${condId}" data-field="${field}" /></td>
      </tr>`;
  }

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2>근무 조건 설정</h2>
      <button class="btn btn-primary" id="save-cond-btn">저장</button>
    </div>
    <p id="cond-msg"></p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card">
        <h3 style="margin-bottom:12px;">주방 — 평일</h3>
        <table class="data-table">
          ${row('최소 총 인원',    'weekday','kitchen','min_total',          byKey['weekday_kitchen']?.min_total          ?? 3)}
          ${row('피자 가능 최소', 'weekday','kitchen','min_pizza_capable',  byKey['weekday_kitchen']?.min_pizza_capable  ?? 1)}
          ${row('파스타 가능 최소','weekday','kitchen','min_pasta_capable', byKey['weekday_kitchen']?.min_pasta_capable  ?? 1)}
          ${row('오픈 시프트 최소','weekday','kitchen','min_open_shift',    byKey['weekday_kitchen']?.min_open_shift     ?? 1)}
        </table>
      </div>
      <div class="card">
        <h3 style="margin-bottom:12px;">주방 — 주말</h3>
        <table class="data-table">
          ${row('최소 총 인원',    'weekend','kitchen','min_total',          byKey['weekend_kitchen']?.min_total          ?? 4)}
          ${row('피자 가능 최소', 'weekend','kitchen','min_pizza_capable',  byKey['weekend_kitchen']?.min_pizza_capable  ?? 1)}
          ${row('파스타 가능 최소','weekend','kitchen','min_pasta_capable', byKey['weekend_kitchen']?.min_pasta_capable  ?? 1)}
          ${row('오픈 시프트 최소','weekend','kitchen','min_open_shift',    byKey['weekend_kitchen']?.min_open_shift     ?? 1)}
        </table>
      </div>
      <div class="card">
        <h3 style="margin-bottom:12px;">홀 — 평일</h3>
        <table class="data-table">
          ${row('최소 총 인원', 'weekday','hall','min_total',    byKey['weekday_hall']?.min_total    ?? 2)}
          ${row('정직원 최소',  'weekday','hall','min_fulltime', byKey['weekday_hall']?.min_fulltime ?? 1)}
        </table>
      </div>
      <div class="card">
        <h3 style="margin-bottom:12px;">홀 — 주말</h3>
        <table class="data-table">
          ${row('최소 총 인원', 'weekend','hall','min_total',    byKey['weekend_hall']?.min_total    ?? 3)}
          ${row('정직원 최소',  'weekend','hall','min_fulltime', byKey['weekend_hall']?.min_fulltime ?? 1)}
        </table>
      </div>
      <div class="card" style="grid-column:1/-1;">
        <h3 style="margin-bottom:12px;">공통 한도 (모든 직원)</h3>
        <table class="data-table">
          ${row('주말 휴무 월 최대',   'weekday','kitchen','max_weekend_offs',     byKey['weekday_kitchen']?.max_weekend_offs     ?? 2)}
          ${row('연속 근무 최대 일수', 'weekday','kitchen','max_consecutive_days', byKey['weekday_kitchen']?.max_consecutive_days ?? 4)}
        </table>
        <p style="font-size:12px;color:var(--gray);margin-top:8px;">※ 공통 한도 변경 시 모든 구역 조건에 동일하게 적용됩니다.</p>
      </div>
    </div>
  `;

  document.getElementById('save-cond-btn').addEventListener('click', async () => {
    const inputs = el.querySelectorAll('input[data-cond-id]');
    const updates = {};
    inputs.forEach(input => {
      const condId = input.dataset.condId;
      if (!condId) return;
      if (!updates[condId]) updates[condId] = {};
      updates[condId][input.dataset.field] = parseInt(input.value) || 0;
    });

    const commonFields = ['max_weekend_offs', 'max_consecutive_days'];
    const commonValues = {};
    commonFields.forEach(f => {
      const inp = el.querySelector(`input[data-field="${f}"]`);
      if (inp) commonValues[f] = parseInt(inp.value) || 0;
    });
    conditions.forEach(c => {
      if (!updates[c.id]) updates[c.id] = {};
      Object.assign(updates[c.id], commonValues);
    });

    await Promise.all(Object.entries(updates).map(([id, fields]) => updateCondition(id, fields)));
    document.getElementById('cond-msg').innerHTML = '<div class="alert alert-success">조건이 저장되었습니다.</div>';
    setTimeout(() => { document.getElementById('cond-msg').innerHTML = ''; }, 2000);
  });
}
