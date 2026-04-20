import warnings; warnings.filterwarnings('ignore')
import pandas as pd, json, math
from datetime import datetime, timedelta

def excel_date(serial):
    if serial and not math.isnan(serial) and serial > 40000:
        return (datetime(1899,12,30) + timedelta(days=int(serial))).strftime('%Y-%m-%d')
    return None

def clean_name(n):
    if not isinstance(n, str): return None
    n = n.replace(' ','').strip()
    return n if n else None

def safe_int(v):
    try:
        if v is None or (isinstance(v, float) and math.isnan(v)): return 0
        return int(v)
    except: return 0

def is_team_row(name):
    if not name: return False
    return '팀' in name or '전' in name

sessions = []

# === 벙개 ===
dfs1 = pd.read_excel('2026년 정기 번개 점수 (1).xlsx', sheet_name=None)
for sn in ['01회번개','02회번개','03회번개','04회번개','05회번개','06회번개','07회번개']:
    if sn not in dfs1: continue
    df = dfs1[sn]
    rnd = int(sn[:2])
    date_val = df.iloc[0, 13] if len(df.columns) > 13 else None
    try: date_str = excel_date(float(date_val))
    except: date_str = None
    
    scores = []
    for r in range(2, len(df)):
        raw = df.iloc[r, 1]
        name = clean_name(str(raw)) if not (isinstance(raw, float) and math.isnan(raw)) else None
        if name and is_team_row(name): break
        if not name or name == '0': continue
        g = [safe_int(df.iloc[r, c]) for c in [2,3,4,5]]
        if all(x == 0 for x in g): continue
        bs = safe_int(df.iloc[r, 8])
        scores.append({'name': name, 'games': g, 'baseScore': bs})
    
    sessions.append({'type': '벙개', 'typeRound': rnd, 'date': date_str, 'numGames': 4, 'scores': scores})
    print(f'벙개 {rnd:02d}: {date_str}, {len(scores)} players')

# === 정모 ===
dfs2 = pd.read_excel('2026년 정기 정모 점수.xlsx', sheet_name=None)
for sn_base in ['01회정모 ','01회정모','02회정모','03회정모','04회정모','05회정모','06회정모','07회정모']:
    if sn_base not in dfs2: continue
    df = dfs2[sn_base]
    rnd = int(sn_base.strip()[:2])
    date_val = df.iloc[0, 11] if len(df.columns) > 11 else None
    try: date_str = excel_date(float(date_val))
    except: date_str = None
    
    scores = []
    for r in range(2, len(df)):
        raw = df.iloc[r, 1]
        name = clean_name(str(raw)) if not (isinstance(raw, float) and math.isnan(raw)) else None
        if name and is_team_row(name): break
        if not name or name == '0': continue
        g = [safe_int(df.iloc[r, c]) for c in [2,3,4]]
        if all(x == 0 for x in g): continue
        bs = safe_int(df.iloc[r, 7])
        scores.append({'name': name, 'games': g, 'baseScore': bs})
    
    sessions.append({'type': '정모', 'typeRound': rnd, 'date': date_str, 'numGames': 3, 'scores': scores})
    print(f'정모 {rnd:02d}: {date_str}, {len(scores)} players')

# Sort by date
sessions.sort(key=lambda s: s['date'] or '')

# Assign round numbers
for i, s in enumerate(sessions):
    s['round'] = i + 1

print()
print('=== Final sessions sorted by date ===')
for s in sessions:
    print(f"Round {s['round']:2d}: {s['date']} {s['type']} {s['typeRound']:02d}회 - {len(s['scores'])} players")

# Save
with open('import_data.json', 'w', encoding='utf-8') as f:
    json.dump({'sessions': sessions}, f, ensure_ascii=False, indent=2)
print()
print('Saved to import_data.json')
