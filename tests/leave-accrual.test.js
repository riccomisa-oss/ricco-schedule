const {
  addYears, addMonths, anniversaryDays, expectedAccruals,
} = require('../js/leave-accrual.js');

describe('날짜 헬퍼', () => {
  test('addYears/addMonths 일 클램프', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28'); // 윤년→평년
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2025-11-15', 3)).toBe('2026-02-15');
    expect(addYears('2023-07-01', 3)).toBe('2026-07-01');
  });
});

describe('가산휴가 anniversaryDays', () => {
  test('연차별 일수', () => {
    expect(anniversaryDays(1)).toBe(15);
    expect(anniversaryDays(2)).toBe(15);
    expect(anniversaryDays(3)).toBe(16);
    expect(anniversaryDays(4)).toBe(16);
    expect(anniversaryDays(5)).toBe(17);
    expect(anniversaryDays(7)).toBe(18);
    expect(anniversaryDays(21)).toBe(25); // 상한
    expect(anniversaryDays(30)).toBe(25);
  });
});

describe('expectedAccruals (가산 반영)', () => {
  test('1년 미만은 월 1일 11개, 주년은 가산', () => {
    const e = expectedAccruals('2023-07-01', '2026-12-31');
    const monthly = e.filter(x => x.kind === 'monthly');
    const anniv = e.filter(x => x.kind === 'anniversary');
    expect(monthly).toHaveLength(11);
    expect(monthly.every(x => x.days === 1)).toBe(true);
    expect(anniv.map(a => a.days)).toEqual([15, 15, 16]); // 1·2·3주년 (3주년 가산)
    expect(anniv.map(a => a.date)).toEqual(['2024-07-01', '2025-07-01', '2026-07-01']);
  });
  test('asOf 이후 미래분은 제외', () => {
    const e = expectedAccruals('2026-03-16', '2026-06-18');
    // 4월·5월·6월 월차만 (3개), 주년 없음
    expect(e.map(x => x.date)).toEqual(['2026-04-16', '2026-05-16', '2026-06-16']);
  });
  test('입사일 없으면 빈 배열', () => {
    expect(expectedAccruals(null, '2026-06-18')).toEqual([]);
  });
});
