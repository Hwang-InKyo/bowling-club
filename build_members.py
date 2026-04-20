import json

# Load import_data.json
with open('import_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Collect all unique players with their latest baseScore and first appearance date
players = {}
for ses in sorted(data['sessions'], key=lambda s: s['date']):
    for sc in ses['scores']:
        name = sc['name']
        if name not in players:
            players[name] = {'firstDate': ses['date'], 'baseScore': sc['baseScore'], 'lastDate': ses['date']}
        else:
            players[name]['baseScore'] = sc['baseScore']  # update to latest
            players[name]['lastDate'] = ses['date']

# Load existing members for gender info
with open('members_import.json', 'r', encoding='utf-8') as f:
    existing = json.load(f)
gender_map = {m['name']: m['gender'] for m in existing['members']}

print(f"import_data players: {len(players)}")
print(f"existing members: {len(existing['members'])}")

# Find players in import_data not in existing
new_names = set(players.keys()) - set(gender_map.keys())
if new_names:
    print(f"New players (no gender info): {sorted(new_names)}")

# Find existing members not in import_data
missing = set(gender_map.keys()) - set(players.keys())
if missing:
    print(f"Existing members not in scores: {sorted(missing)}")

# Build new member list
members = []
for name, info in sorted(players.items(), key=lambda x: -x[1]['baseScore']):
    members.append({
        'name': name,
        'baseScore': info['baseScore'],
        'joinDate': info['firstDate'],
        'gender': gender_map.get(name, 'M')
    })

# Also include existing members not in score data
for m in existing['members']:
    if m['name'] not in players:
        members.append(m)

print(f"\nTotal members: {len(members)}")
for m in members:
    tag = ' (NEW)' if m['name'] in new_names else (' (NO SCORES)' if m['name'] in missing else '')
    print(f"  {m['name']:6s} BS={m['baseScore']:3d} join={m['joinDate']} {m['gender']}{tag}")

# Save
with open('members_import.json', 'w', encoding='utf-8') as f:
    json.dump({'members': members}, f, ensure_ascii=False, indent=2)
print("\nSaved to members_import.json")
