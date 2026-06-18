# 연차 발생 모델 — 가산휴가 도입 (2026-06-18)

## 결정 (최종)
- (b) 근로기준법 발생 규칙으로 가되, **미사용 연차는 소멸시키지 않고 이월**한다 — 직원과 계약서로 합의됨(법정 최소보다 유리 + 계약 근거라 합법).
- 따라서 **잔여 = 평생 발생 − 사용** 유지(현행 `getAnnualLeaveStats` 그대로). 잔여 수치 변동 없음.
- 실제 추가되는 것은 **가산휴가 하나뿐**: 입사 N주년 부여일수 = `min(15 + floor((N-1)/2), 25)` (1·2년 15, 3·4년 16, 5·6년 17 … 최대 25).

## 영향
- 지금 잔여 변화 0 (3년 이상 근속자가 현재 없음). 권지수(2023-07-01)가 2026-07-01 3주년에 16일로 첫 적용 — **앞으로만**.
- 소멸/연차연도 버킷/FIFO/기준선 정리 전부 불필요(이월 정책이라).

## 변경
- `js/leave-accrual.js` (신규, 순수) — `anniversaryDays`(가산) + `expectedAccruals`(가산 반영) + 날짜 헬퍼.
- `tests/leave-accrual.test.js` — 가산·발생 규칙 테스트.
- `js/admin-annual-leave.js` — 로컬 `computeExpectedAccruals` 제거, leave-accrual.js의 `expectedAccruals` 사용. `getNextAccrualInfo`를 kind 기반으로. "다음 발생일"에 주년 일수(예: 16일) 표시. `runAutoAccrual`이 가산 반영분 추가.
- `admin.html` — `leave-accrual.js` 로드.

## 비범위
- 소멸/연차사용촉진/미사용수당 — 이월 정책이라 불필요(향후 정책 바뀌면 git 이력의 소멸 엔진 참고).
- 미사용 연차 누적에 따른 퇴사 시 수당 부담은 계약/운영상 수용.
