// 연차 발생 규칙 — 입사일 기준 월차(1년 미만) + 주년 연차(가산휴가 반영).
// 정책: 미사용 연차는 소멸하지 않고 이월(직원과 계약). 잔여 = 평생 발생 − 사용(db.js).
// 이 모듈은 "언제 며칠이 발생하는가"만 계산(순수 함수). 브라우저/jest 공용.

function _pad(n) { return String(n).padStart(2, '0'); }
function _ymd(y, m, d) {
  const dim = new Date(y, m, 0).getDate(); // 일 클램프(말일 초과 방지)
  return `${y}-${_pad(m)}-${_pad(Math.min(d, dim))}`;
}
function _parse(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
function addYears(s, n) { const { y, m, d } = _parse(s); return _ymd(y + n, m, d); }
function addMonths(s, n) {
  const { y, m, d } = _parse(s);
  const tot = (m - 1) + n;
  return _ymd(y + Math.floor(tot / 12), (tot % 12) + 1, d);
}

// 입사 N주년 부여일수: 15 + 가산(3년차부터 2년마다 1일, 최대 25)
//  N=1·2 → 15, 3·4 → 16, 5·6 → 17 … 21+ → 25
function anniversaryDays(yearN) {
  return Math.min(15 + Math.max(0, Math.floor((yearN - 1) / 2)), 25);
}

// 입사일~asOf 동안 발생해야 할 항목(만근 가정). 가산휴가 반영.
//  - 1~11개월차: 매월 1일
//  - 1주년 이후: 주년마다 anniversaryDays(N)
function expectedAccruals(hireDate, asOf) {
  if (!hireDate) return [];
  const out = [];
  for (let m = 1; m <= 11; m++) {
    const date = addMonths(hireDate, m);
    if (date > asOf) break;
    out.push({ date, days: 1, kind: 'monthly', note: `입사 ${m}개월차` });
  }
  for (let y = 1; y <= 30; y++) {
    const date = addYears(hireDate, y);
    if (date > asOf) break;
    out.push({ date, days: anniversaryDays(y), kind: 'anniversary', note: `입사 ${y}년차 연차` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

if (typeof module !== 'undefined') {
  module.exports = { addYears, addMonths, anniversaryDays, expectedAccruals };
}
