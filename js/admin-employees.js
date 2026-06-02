async function renderEmployeesTab(branchId) {
  const el = document.getElementById('employees');
  el.innerHTML = '<p style="color:var(--gray)">불러오는 중...</p>';

  const employees = await getEmployees(branchId);

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2>직원 목록 (${employees.length}명)</h2>
      <button class="btn btn-primary" id="add-emp-btn">+ 직원 추가</button>
    </div>
    <div class="card" style="padding:0;">
      <table class="data-table">
        <thead>
          <tr><th>이름</th><th>역할</th><th>고용형태</th><th>능력</th><th>오픈 가능</th><th>입사일</th><th>연차</th><th></th></tr>
        </thead>
        <tbody>
          ${employees.map(e => `
            <tr>
              <td>${e.name}</td>
              <td>${ROLE_LABELS[e.role]}</td>
              <td>${e.employment_type === 'fulltime' ? '정직원' : '파트타임'}</td>
              <td>
                ${e.pizza_capable  ? '<span class="badge badge-approved">피자</span>' : ''}
                ${e.pasta_capable  ? '<span class="badge badge-approved">파스타</span>' : ''}
                ${!e.pizza_capable && !e.pasta_capable && e.role.startsWith('kitchen') ? '<span class="badge">보조</span>' : ''}
              </td>
              <td>
                ${e.role.startsWith('kitchen')
                  ? `<button class="btn btn-sm ${e.open_capable ? 'btn-primary' : 'btn-ghost'}"
                       onclick="toggleOpenCapable('${e.id}', ${e.open_capable})">
                       ${e.open_capable ? '✓ 가능' : '—'}
                     </button>`
                  : '<span style="color:var(--gray);font-size:12px;">홀</span>'}
              </td>
              <td style="font-size:12px;color:var(--gray);">${e.hire_date || '—'}</td>
              <td>
                ${e.annual_leave_total != null
                  ? `<span class="badge badge-approved">${e.annual_leave_total}일</span>`
                  : '<span style="color:var(--gray);font-size:12px;">—</span>'}
              </td>
              <td>
                <button class="btn btn-ghost btn-sm" onclick="openEditEmployee('${e.id}','${e.name}','${e.role}',${e.open_capable},${e.annual_leave_total ?? 'null'},'${e.hire_date || ''}')">수정</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="confirmDeactivate('${e.id}','${e.name}')">삭제</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="modal-overlay" id="emp-modal">
      <div class="modal">
        <h2 id="emp-modal-title">직원 추가</h2>
        <div class="form-group">
          <label>이름</label>
          <input type="text" id="emp-name" placeholder="홍길동" />
        </div>
        <div class="form-group">
          <label>역할</label>
          <select id="emp-role">
            ${Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="open-capable-group" style="display:none;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="emp-open-capable" style="width:16px;height:16px;" />
            오픈 시프트 가능 (09:30 출근)
          </label>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="emp-annual-leave-check" style="width:16px;height:16px;" />
            연차 사용 직원
          </label>
        </div>
        <div class="form-group" id="annual-leave-days-group" style="display:none;">
          <label>연차 일수 (연간 총 일수)</label>
          <input type="number" id="emp-annual-leave-total" min="1" max="25" placeholder="예: 15" style="width:120px;" />
        </div>
        <div class="form-group">
          <label>입사일</label>
          <input type="date" id="emp-hire-date" style="width:100%;box-sizing:border-box;" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="closeEmpModal()">취소</button>
          <button class="btn btn-primary" id="emp-save-btn">저장</button>
        </div>
      </div>
    </div>
  `;

  let editingId = null;

  function updateOpenCapableVisibility() {
    const role = document.getElementById('emp-role').value;
    document.getElementById('open-capable-group').style.display =
      role.startsWith('kitchen') ? 'block' : 'none';
  }

  function updateAnnualLeaveVisibility() {
    const checked = document.getElementById('emp-annual-leave-check').checked;
    document.getElementById('annual-leave-days-group').style.display = checked ? 'block' : 'none';
  }

  document.getElementById('emp-role').addEventListener('change', updateOpenCapableVisibility);
  document.getElementById('emp-annual-leave-check').addEventListener('change', updateAnnualLeaveVisibility);

  document.getElementById('add-emp-btn').addEventListener('click', () => {
    editingId = null;
    document.getElementById('emp-modal-title').textContent = '직원 추가';
    document.getElementById('emp-name').value = '';
    document.getElementById('emp-role').value = 'kitchen_full';
    document.getElementById('emp-open-capable').checked = false;
    document.getElementById('emp-annual-leave-check').checked = false;
    document.getElementById('emp-annual-leave-total').value = '';
    document.getElementById('emp-hire-date').value = '';
    updateOpenCapableVisibility();
    updateAnnualLeaveVisibility();
    document.getElementById('emp-modal').classList.add('open');
  });

  document.getElementById('emp-save-btn').addEventListener('click', async () => {
    const name = document.getElementById('emp-name').value.trim();
    const role = document.getElementById('emp-role').value;
    const openCapable = role.startsWith('kitchen')
      ? document.getElementById('emp-open-capable').checked
      : false;
    const annualLeaveCheck = document.getElementById('emp-annual-leave-check').checked;
    const annualLeaveTotalRaw = document.getElementById('emp-annual-leave-total').value;
    const annualLeaveTotal = annualLeaveCheck && annualLeaveTotalRaw
      ? parseInt(annualLeaveTotalRaw, 10)
      : null;
    const hireDate = document.getElementById('emp-hire-date').value || null;

    if (!name) return alert('이름을 입력하세요.');
    if (annualLeaveCheck && !annualLeaveTotalRaw) return alert('연차 일수를 입력하세요.');

    try {
      if (editingId) {
        await updateEmployee(editingId, { name, role, openCapable, annualLeaveTotal, hireDate });
      } else {
        await createEmployee({ branchId, name, role, openCapable, annualLeaveTotal, hireDate });
      }
      closeEmpModal();
      renderEmployeesTab(branchId);
    } catch (err) {
      const msg = err?.message || JSON.stringify(err);
      if (msg.includes('annual_leave_total') || msg.includes('column')) {
        alert('저장 실패: Supabase SQL Editor에서 아래 쿼리를 실행해주세요.\n\nALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_leave_total integer;');
      } else {
        alert('저장 실패: ' + msg);
      }
    }
  });

  window.openEditEmployee = (id, name, role, openCapable, annualLeaveTotal, hireDate) => {
    editingId = id;
    document.getElementById('emp-modal-title').textContent = '직원 수정';
    document.getElementById('emp-name').value = name;
    document.getElementById('emp-role').value = role;
    document.getElementById('emp-open-capable').checked = !!openCapable;
    const hasAnnual = annualLeaveTotal != null && annualLeaveTotal !== 'null';
    document.getElementById('emp-annual-leave-check').checked = hasAnnual;
    document.getElementById('emp-annual-leave-total').value = hasAnnual ? annualLeaveTotal : '';
    document.getElementById('emp-hire-date').value = hireDate || '';
    updateOpenCapableVisibility();
    updateAnnualLeaveVisibility();
    document.getElementById('emp-modal').classList.add('open');
  };

  window.closeEmpModal = () => {
    document.getElementById('emp-modal').classList.remove('open');
  };

  window.toggleOpenCapable = async (id, current) => {
    await db.from('employees').update({ open_capable: !current }).eq('id', id);
    renderEmployeesTab(branchId);
  };

  window.confirmDeactivate = async (id, name) => {
    if (confirm(`"${name}"을(를) 삭제하시겠습니까?`)) {
      await deactivateEmployee(id);
      renderEmployeesTab(branchId);
    }
  };
}
