#!/usr/bin/env python3
"""엑셀 연차관리 파일 → Supabase annual_leave_ledger 마이그레이션 (1회 실행)"""
import json, ssl, urllib.request, urllib.parse, openpyxl

SUPABASE_URL = 'https://dvmgcmlotytyuebnutoz.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2bWdjbWxvdHl0eXVlYm51dG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NDk3MDgsImV4cCI6MjA5NTEyNTcwOH0.sqMVG0nnWhVipFqIcYFIaTjZSzxUR8vLSxwQ6W8jfZI'
HEADERS = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def api_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}{path}', headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'})
    with urllib.request.urlopen(req, context=ctx) as r:
        return json.loads(r.read())

def api_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f'{SUPABASE_URL}{path}', data=data, method='POST', headers=HEADERS)
    with urllib.request.urlopen(req, context=ctx) as r:
        return r.status

def api_patch(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f'{SUPABASE_URL}{path}', data=data, method='PATCH', headers=HEADERS)
    with urllib.request.urlopen(req, context=ctx) as r:
        return r.status

def api_delete(path):
    req = urllib.request.Request(f'{SUPABASE_URL}{path}', method='DELETE', headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'})
    with urllib.request.urlopen(req, context=ctx) as r:
        return r.status

def parse_sheet(ws):
    rows = list(ws.iter_rows(min_row=1, max_row=60, values_only=True))
    name, hire_date = None, None
    log = []
    for r in rows:
        if r[1] == '성명':
            name = r[2]
            hire_date = r[7].strftime('%Y-%m-%d') if r[7] and hasattr(r[7], 'strftime') else None
        if r[1] and hasattr(r[1], 'year'):
            d = r[1].strftime('%Y-%m-%d')
            if r[4]:
                log.append({'date': d, 'type': 'accrual', 'days': float(r[4])})
            if r[6]:
                log.append({'date': d, 'type': 'usage',   'days': float(r[6])})
    return name, hire_date, log

# 1. 모든 직원 조회
employees = api_get('/rest/v1/employees?select=id,name&active=eq.true')
emp_map = {e['name']: e for e in employees}
print(f'직원 {len(employees)}명 조회')

# 2. 기존 ledger 전체 삭제 (재실행 안전)
try:
    status = api_delete('/rest/v1/annual_leave_ledger?created_at=gte.2000-01-01')
    print(f'기존 ledger 삭제: {status}')
except Exception as e:
    print(f'기존 ledger 삭제 실패 (비어있거나 테이블 없음): {e}')

# 3. 엑셀 파일 파싱 및 삽입
FILES = [
    '/Users/jeongwoo/Downloads/2026 연차관리 하남.xlsx',
    '/Users/jeongwoo/Downloads/2026 연차관리 분당.xlsx',
]

total = 0
for filepath in FILES:
    try:
        wb = openpyxl.load_workbook(filepath)
    except FileNotFoundError:
        print(f'파일 없음: {filepath}')
        continue
    label = '하남' if '하남' in filepath else '분당'
    print(f'\n=== {label} ===')
    for sheet in wb.sheetnames:
        name, hire_date, log = parse_sheet(wb[sheet])
        if not name:
            continue
        if name not in emp_map:
            print(f'  ⚠  직원 없음: {name}')
            continue
        emp_id = emp_map[name]['id']

        # hire_date 업데이트
        if hire_date:
            api_patch(f'/rest/v1/employees?id=eq.{emp_id}', {'hire_date': hire_date})

        # ledger 삽입
        if log:
            entries = [{'employee_id': emp_id, **e} for e in log]
            api_post('/rest/v1/annual_leave_ledger', entries)
            total += len(entries)
            acc = sum(e['days'] for e in log if e['type'] == 'accrual')
            use = sum(e['days'] for e in log if e['type'] == 'usage')
            print(f'  {name}: {len(log)}건 (발생:{acc} 사용:{use} 잔여:{acc-use})')
        else:
            print(f'  {name}: 이력 없음 (입사일만 설정)')

print(f'\n완료: 총 {total}건 삽입')
