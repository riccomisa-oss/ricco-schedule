// HTML 텍스트 이스케이프 — innerHTML에 들어가는 사용자/DB 문자열은 반드시 esc() 통과.
// (RLS allow-all + anon 키 공개이므로 직원 이름 등에 스크립트가 심길 수 있어 저장형 XSS 방어)
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 한국 공휴일 (토·일 외 공휴일/대체공휴일 포함) ──────────
const KOREAN_HOLIDAYS = {
  2025: new Set([
    '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30',
    '2025-03-01', '2025-05-05', '2025-05-06', '2025-06-06',
    '2025-08-15', '2025-10-03', '2025-10-05', '2025-10-06',
    '2025-10-07', '2025-10-08', '2025-10-09', '2025-12-25',
  ]),
  2026: new Set([
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18',
    '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24',
    '2026-05-25', '2026-06-06', '2026-08-15', '2026-08-17',
    '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28',
    '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
  ]),
  2027: new Set([
    '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
    '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06',
    '2027-08-15', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16',
    '2027-10-03', '2027-10-04', '2027-10-09', '2027-12-25',
  ]),
};

function isHolidayOrWeekend(year, month, day) {
  const dow = new Date(year, month - 1, day).getDay();
  if (dow === 0 || dow === 6) return true;
  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return KOREAN_HOLIDAYS[year]?.has(dateStr) ?? false;
}

function buildCalendarHTML(year, month, renderCell, renderOtherCell) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();

  const { year: pY, month: pM } = prevMonth(year, month);
  const daysInPrevMonth = new Date(pY, pM, 0).getDate();
  const { year: nY, month: nM } = nextMonth(year, month);

  let html = '<table class="calendar"><thead><tr>';
  ['일', '월', '화', '수', '목', '금', '토'].forEach(d => {
    html += `<th>${d}</th>`;
  });
  html += '</tr></thead><tbody><tr>';

  for (let i = 0; i < firstDay; i++) {
    const prevDay = daysInPrevMonth - firstDay + 1 + i;
    const dateStr = `${pY}-${String(pM).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;
    html += renderOtherCell ? renderOtherCell(dateStr, prevDay) : '<td class="other-month"></td>';
  }

  let col = firstDay;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isWeekendDay = isHolidayOrWeekend(year, month, day);
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day;

    let cls = '';
    if (isWeekendDay) cls += ' weekend';
    if (isToday) cls += ' today';

    html += `<td class="${cls}" data-date="${date}">`;
    html += `<div class="date-num">${day}</div>`;
    html += renderCell ? renderCell(date) : '';
    html += '</td>';

    col++;
    if (col % 7 === 0 && day < daysInMonth) html += '</tr><tr>';
  }

  const remaining = (7 - (col % 7)) % 7;
  for (let i = 0; i < remaining; i++) {
    const nextDay = i + 1;
    const dateStr = `${nY}-${String(nM).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
    html += renderOtherCell ? renderOtherCell(dateStr, nextDay) : '<td class="other-month"></td>';
  }

  html += '</tr></tbody></table>';
  return html;
}

function prevMonth(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
