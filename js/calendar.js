function buildCalendarHTML(year, month, renderCell) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();

  let html = '<table class="calendar"><thead><tr>';
  ['일', '월', '화', '수', '목', '금', '토'].forEach(d => {
    html += `<th>${d}</th>`;
  });
  html += '</tr></thead><tbody><tr>';

  for (let i = 0; i < firstDay; i++) html += '<td class="other-month"></td>';

  let col = firstDay;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = (firstDay + day - 1) % 7;
    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day;

    let cls = '';
    if (isWeekendDay) cls += ' weekend';
    if (isToday) cls += ' today';

    html += `<td class="${cls}" data-date="${date}">`;
    html += `<div class="date-num">${day}</div>`;
    html += renderCell ? renderCell(date, dayOfWeek) : '';
    html += '</td>';

    col++;
    if (col % 7 === 0 && day < daysInMonth) html += '</tr><tr>';
  }

  const remaining = (7 - (col % 7)) % 7;
  for (let i = 0; i < remaining; i++) html += '<td class="other-month"></td>';

  html += '</tr></tbody></table>';
  return html;
}

function prevMonth(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
