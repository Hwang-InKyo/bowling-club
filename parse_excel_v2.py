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
    return n if n and n != '0' and n != 'nan' else None

def safe_int(v):
    try:
        if v is None or (isinstance(v, float) and math.isnan(v)): return 0
        return int(v)
    except: return 0

def is_team_marker(val):
    if not val or not isinstance(val, str): return False
    v = val.replace(' ','')
    return '팀전' in v

def parse_teams_bunghae(df, start_row):
    """Parse team section for 번개 (4 games). Teams in pairs: left=col1, right=col8"""
    teams = []
    r = start_row + 1  # skip "팀 전" row
    
    while r < len(df):
        left_team = []
        right_team = []
        
        # Read team members until sum row (no name in col1)
        while r < len(df):
            left_name = clean_name(str(df.iloc[r, 1])) if pd.notna(df.iloc[r, 1]) else None
            right_name = clean_name(str(df.iloc[r, 8])) if len(df.columns) > 8 and pd.notna(df.iloc[r, 8]) else None
            
            if not left_name and not right_name:
                # sum row or blank - end of this pair
                r += 1
                break
            
            if left_name:
                left_team.append(left_name)
            if right_name:
                right_team.append(right_name)
            r += 1
        
        if left_team:
            teams.append(left_team)
        if right_team:
            teams.append(right_team)
        
        # Skip blank rows between pairs
        while r < len(df):
            val = str(df.iloc[r, 1]) if pd.notna(df.iloc[r, 1]) else ''
            if clean_name(val):
                break
            # Check if we hit the second copy of the data sheet
            val0 = str(df.iloc[r, 0]) if pd.notna(df.iloc[r, 0]) else ''
            if '아르케' in val0 or '모임' in val0:
                return teams
            r += 1
            if r >= len(df):
                return teams
        
        # Check if this is still team data or new section
        val0 = str(df.iloc[r, 0]) if r < len(df) and pd.notna(df.iloc[r, 0]) else ''
        if '아르케' in val0 or val0.strip().isdigit():
            break
    
    return teams

def parse_teams_jungmo(df, start_row):
    """Parse team section for 정모 (3 games). Teams in pairs: left=col1, right=col7"""
    teams = []
    r = start_row + 1
    
    while r < len(df):
        left_team = []
        right_team = []
        
        while r < len(df):
            left_name = clean_name(str(df.iloc[r, 1])) if pd.notna(df.iloc[r, 1]) else None
            right_name = clean_name(str(df.iloc[r, 7])) if len(df.columns) > 7 and pd.notna(df.iloc[r, 7]) else None
            
            if not left_name and not right_name:
                r += 1
                break
            
            if left_name:
                left_team.append(left_name)
            if right_name:
                right_team.append(right_name)
            r += 1
        
        if left_team:
            teams.append(left_team)
        if right_team:
            teams.append(right_team)
        
        while r < len(df):
            val = str(df.iloc[r, 1]) if pd.notna(df.iloc[r, 1]) else ''
            if clean_name(val):
                break
            val0 = str(df.iloc[r, 0]) if pd.notna(df.iloc[r, 0]) else ''
            if '아르케' in val0 or '모임' in val0:
                return teams
            r += 1
            if r >= len(df):
                return teams
        
        val0 = str(df.iloc[r, 0]) if r < len(df) and pd.notna(df.iloc[r, 0]) else ''
        if '아르케' in val0 or val0.strip().isdigit():
            break
    
    return teams

# Build a baseScore lookup from scores
def build_base_lookup(scores):
    return {s['name']: s['baseScore'] for s in scores}

sessions = []

# === 벙개 ===
dfs1 = pd.read_excel('2026년 정기 번개 점수 (1).xlsx', sheet_name=None, header=None)
for sn in ['01회번개','02회번개','03회번개','04회번개','05회번개','06회번개','07회번개']:
    if sn not in dfs1: continue
    df = dfs1[sn]
    rnd = int(sn[:2])
    
    # Date
    date_val = df.iloc[0, 13] if len(df.columns) > 13 else df.iloc[1, 13] if len(df.columns) > 13 else None
    if pd.isna(date_val):
        date_val = df.iloc[1, 13] if len(df.columns) > 13 else None
    try: date_str = excel_date(float(date_val))
    except: date_str = None
    
    # Scores
    scores = []
    team_row = None
    for r in range(2, len(df)):
        raw = df.iloc[r, 1]
        name = clean_name(str(raw)) if pd.notna(raw) else None
        
        if name and is_team_marker(str(raw).replace(' ','')):
            team_row = r
            break
        if not name: continue
        
        g = [safe_int(df.iloc[r, c]) for c in [2,3,4,5]]
        if all(x == 0 for x in g): continue
        bs = safe_int(df.iloc[r, 8])
        scores.append({'name': name, 'games': g, 'baseScore': bs})
    
    # Teams
    teams_raw = []
    if team_row is not None:
        teams_raw = parse_teams_bunghae(df, team_row)
    
    base_lookup = build_base_lookup(scores)
    teams = []
    name_to_team = {}
    for i, members in enumerate(teams_raw):
        team_name = f'{i+1}팀'
        team_members = []
        for m in members:
            team_members.append({'name': m, 'baseScore': base_lookup.get(m, 0)})
            name_to_team[m] = team_name
        total_base = sum(tm['baseScore'] for tm in team_members)
        teams.append({'name': team_name, 'members': team_members, 'totalBase': total_base})
    
    # Assign team to each score
    for s in scores:
        s['team'] = name_to_team.get(s['name'], '')
    
    team_size = max(len(t) for t in teams_raw) if teams_raw else 0
    
    session_data = {
        'type': '벙개', 'typeRound': rnd, 'date': date_str,
        'numGames': 4, 'teamSize': team_size, 'teams': teams, 'scores': scores
    }
    if rnd % 2 == 0:
        session_data['scoreType'] = 'totalpin'
    sessions.append(session_data)
    print(f'벙개 {rnd:02d}: {date_str}, {len(scores)} players, {len(teams)} teams (size {team_size})')
    for t in teams:
        print(f'  {t["name"]}: {[m["name"] for m in t["members"]]}')

# === 정모 ===
dfs2 = pd.read_excel('2026년 정기 정모 점수.xlsx', sheet_name=None, header=None)
for sn_base in ['01회정모 ','01회정모','02회정모','03회정모','04회정모','05회정모','06회정모','07회정모']:
    if sn_base not in dfs2: continue
    df = dfs2[sn_base]
    rnd = int(sn_base.strip()[:2])
    
    # Date
    date_val = df.iloc[0, 11] if len(df.columns) > 11 else df.iloc[1, 11] if len(df.columns) > 11 else None
    if pd.isna(date_val):
        date_val = df.iloc[1, 11] if len(df.columns) > 11 else None
    try: date_str = excel_date(float(date_val))
    except: date_str = None
    
    # Scores - find team marker row
    scores = []
    team_row = None
    for r in range(2, len(df)):
        raw = df.iloc[r, 1]
        name = clean_name(str(raw)) if pd.notna(raw) else None
        
        # Check for team or award section markers
        if name and is_team_marker(str(raw).replace(' ','')):
            team_row = r
            break
        raw_str = str(raw).replace(' ','') if pd.notna(raw) else ''
        if '시상' in raw_str or '벌금' in raw_str:
            # Awards section - find team section after
            for r2 in range(r+1, len(df)):
                raw2 = df.iloc[r2, 1]
                if pd.notna(raw2) and is_team_marker(str(raw2).replace(' ','')):
                    team_row = r2
                    break
            break
        if not name: continue
        
        g = [safe_int(df.iloc[r, c]) for c in [2,3,4]]
        if all(x == 0 for x in g): continue
        bs = safe_int(df.iloc[r, 7])
        scores.append({'name': name, 'games': g, 'baseScore': bs})
    
    # Teams
    teams_raw = []
    if team_row is not None:
        teams_raw = parse_teams_jungmo(df, team_row)
    
    base_lookup = build_base_lookup(scores)
    teams = []
    name_to_team = {}
    for i, members in enumerate(teams_raw):
        team_name = f'{i+1}팀'
        team_members = []
        for m in members:
            team_members.append({'name': m, 'baseScore': base_lookup.get(m, 0)})
            name_to_team[m] = team_name
        total_base = sum(tm['baseScore'] for tm in team_members)
        teams.append({'name': team_name, 'members': team_members, 'totalBase': total_base})
    
    # Assign team to each score
    for s in scores:
        s['team'] = name_to_team.get(s['name'], '')
    
    team_size = max(len(t) for t in teams_raw) if teams_raw else 0
    
    sessions.append({
        'type': '정모', 'typeRound': rnd, 'date': date_str,
        'numGames': 3, 'teamSize': team_size, 'teams': teams, 'scores': scores
    })
    print(f'정모 {rnd:02d}: {date_str}, {len(scores)} players, {len(teams)} teams (size {team_size})')
    for t in teams:
        print(f'  {t["name"]}: {[m["name"] for m in t["members"]]}')

# Sort by date
sessions.sort(key=lambda s: s['date'] or '')

# Assign round numbers
for i, s in enumerate(sessions):
    s['round'] = i + 1

print()
print('=== Final sessions sorted by date ===')
for s in sessions:
    print(f"Round {s['round']:2d}: {s['date']} {s['type']} {s['typeRound']:02d}회 - {len(s['scores'])} players, {len(s['teams'])} teams")

# Save
with open('import_data.json', 'w', encoding='utf-8') as f:
    json.dump({'sessions': sessions}, f, ensure_ascii=False, indent=2)
print()
print('Saved to import_data.json')
