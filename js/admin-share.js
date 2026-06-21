async function renderShareTab(branchId) {
  const el = document.getElementById('share');
  const branches = await getBranches();
  const branch = branches.find(b => b.id === branchId);

  const baseUrl = window.location.origin;
  const employeeUrl = `${baseUrl}/employee?branch=${branchId}`;

  el.innerHTML = `
    <h2 style="margin-bottom:16px;">공유 링크</h2>
    <div class="card">
      <h3 style="margin-bottom:8px;">${esc(branch?.name || '')} — 직원용 링크</h3>
      <p style="font-size:13px;color:var(--gray);margin-bottom:12px;">
        이 링크를 직원들에게 공유하면 휴무 신청과 스케줄 확인을 할 수 있습니다.
      </p>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" value="${employeeUrl}" readonly
          style="flex:1;padding:10px;border:1px solid var(--light);border-radius:6px;background:var(--cream);font-size:13px;" />
        <button class="btn btn-primary" id="copy-link-btn">복사</button>
      </div>
      <p id="copy-msg" style="font-size:13px;color:var(--olive);margin-top:8px;"></p>
    </div>
    <div class="card" style="margin-top:16px;">
      <h3 style="margin-bottom:8px;">카카오톡 공유 문구</h3>
      <textarea readonly rows="5"
        style="width:100%;border:1px solid var(--light);border-radius:6px;padding:12px;font-size:13px;background:var(--cream);resize:none;"
      >[리꼬 피자 ${esc(branch?.name || '')}]
휴무 신청 및 스케줄 확인 링크입니다.
아래 링크에 접속 후 본인 이름을 선택해 주세요.

${employeeUrl}</textarea>
    </div>
  `;

  document.getElementById('copy-link-btn').addEventListener('click', async () => {
    const ok = await copyToClipboard(employeeUrl);
    const msg = document.getElementById('copy-msg');
    msg.style.color = ok ? 'var(--olive)' : 'var(--red)';
    msg.textContent = ok
      ? '링크가 복사되었습니다!'
      : '복사 실패 — 위 링크를 길게 눌러 직접 복사해 주세요.';
    setTimeout(() => { msg.textContent = ''; msg.style.color = 'var(--olive)'; }, 2500);
  });
}
