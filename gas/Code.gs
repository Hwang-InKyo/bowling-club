/**
 * Google Apps Script - 아르케 존 볼링 클럽 API (세션 기반)
 *
 * [설치 방법]
 * 1. Google Sheets 새 스프레드시트 생성
 * 2. 시트 이름: "회원목록", "세션목록", "회비", "정산"
 *    - 회원목록 1행: 이름 | 기준에버 | 가입일
 *    - 세션목록 1행: 회차 | 날짜 | 게임수 | 팀인원 | 팀구성(JSON) | 점수(JSON)
 *    - 회비 1행: 연도 | 이름 | 1월~12월 | 연회비
 *    - 정산 1행: 키 | 데이터(JSON)
 * 3. 확장 프로그램 > Apps Script > 이 코드 붙여넣기
 * 4. SPREADSHEET_ID를 본인 스프레드시트 ID로 교체
 * 5. 배포 > 새 배포 > 웹 앱
 *    - 실행 사용자: 본인
 *    - 액세스: 모든 사용자
 * 6. 배포 URL을 웹앱 설정에 입력
 */

// ★ 본인 스프레드시트 ID로 교체
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

const SHEET_MEMBERS = '회원목록';
const SHEET_SESSIONS = '세션목록';
const SHEET_DUES = '회비';
const SHEET_SETTLEMENTS = '정산';
const SHEET_TOURNAMENTS = '토너먼트목록';

function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    switch (action) {
      case 'getMembers': return resp(getMembers(ss));
      case 'getSessions': return resp(getSessions(ss));
      case 'getDues': return resp(getDues(ss));
      case 'getSettlements': return resp(getSettlements(ss));
      case 'getTournaments': return resp(getTournaments(ss));
      default: return resp({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return resp({ error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    switch (data.action) {
      case 'addMember': return resp(addMember(ss, data.name, data.baseScore, data.gender));
      case 'removeMember': return resp(removeMember(ss, data.name));
      case 'updateMember': return resp(updateMember(ss, data.name, data.updates));
      case 'saveSession': return resp(saveSession(ss, data.session));
      case 'deleteSession': return resp(deleteSession(ss, data.round));
      case 'saveDues': return resp(saveDues(ss, data));
      case 'saveSettlements': return resp(saveSettlements(ss, data));
      case 'importData': return resp(importData(ss, data));
      case 'saveTournament': return resp(saveTournament(ss, data.tournament));
      case 'deleteTournament': return resp(deleteTournament(ss, data.id));
      default: return resp({ error: 'Unknown action: ' + data.action });
    }
  } catch (err) {
    return resp({ error: err.message });
  }
}

// ===== 회원 =====
function getMembers(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, ['이름', '기준에버', '가입일', '성별']);
  const data = sheet.getDataRange().getValues();
  const members = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      members.push({
        name: String(data[i][0]).trim(),
        baseScore: Number(data[i][1]) || 0,
        joinDate: fmtDate(data[i][2]),
        gender: String(data[i][3] || 'M').trim()
      });
    }
  }
  members.sort((a, b) => b.baseScore - a.baseScore || a.name.localeCompare(b.name, 'ko'));
  return { members };
}

function addMember(ss, name, baseScore, gender) {
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, ['이름', '기준에버', '가입일', '성별']);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === name) throw new Error('이미 존재하는 회원입니다.');
  }
  sheet.appendRow([name, baseScore || 0, new Date(), gender || 'M']);
  return getMembers(ss);
}

function removeMember(ss, name) {
  const sheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!sheet) return { members: [] };
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === name) { sheet.deleteRow(i + 1); break; }
  }
  return getMembers(ss);
}

function updateMember(ss, name, updates) {
  const sheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!sheet) return { members: [] };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === name) {
      if (updates.baseScore !== undefined) sheet.getRange(i + 1, 2).setValue(Number(updates.baseScore));
      break;
    }
  }
  return getMembers(ss);
}

// ===== 세션 =====
function getSessions(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_SESSIONS, ['회차', '날짜', '게임수', '팀인원', '팀구성', '점수', '점수유형']);
  const data = sheet.getDataRange().getValues();
  const sessions = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      try {
        const s = {
          round: Number(data[i][0]),
          date: fmtDate(data[i][1]),
          numGames: Number(data[i][2]),
          teamSize: Number(data[i][3]),
          teams: JSON.parse(data[i][4] || '[]'),
          scores: JSON.parse(data[i][5] || '[]')
        };
        if (data[i][6]) s.scoreType = String(data[i][6]).trim();
        sessions.push(s);
      } catch (e) { /* skip bad rows */ }
    }
  }
  sessions.sort((a, b) => b.round - a.round);
  return { sessions };
}

function saveSession(ss, session) {
  const sheet = getOrCreateSheet(ss, SHEET_SESSIONS, ['회차', '날짜', '게임수', '팀인원', '팀구성', '점수', '점수유형']);
  const data = sheet.getDataRange().getValues();
  const round = Number(session.round);
  const rowData = [
    round,
    session.date,
    session.numGames,
    session.teamSize,
    JSON.stringify(session.teams),
    JSON.stringify(session.scores),
    session.scoreType || ''
  ];

  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === round) {
      sheet.getRange(i + 1, 1, 1, 7).setValues([rowData]);
      return getSessions(ss);
    }
  }
  sheet.appendRow(rowData);
  return getSessions(ss);
}

function deleteSession(ss, round) {
  const sheet = ss.getSheetByName(SHEET_SESSIONS);
  if (!sheet) return { sessions: [] };
  const data = sheet.getDataRange().getValues();
  round = Number(round);
  for (let i = data.length - 1; i >= 1; i--) {
    if (Number(data[i][0]) === round) { sheet.deleteRow(i + 1); break; }
  }
  return getSessions(ss);
}

// ===== 회비 =====
function getDues(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_DUES, ['연도', '이름', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '연회비']);
  const data = sheet.getDataRange().getValues();
  const dues = {};
  for (let i = 1; i < data.length; i++) {
    const year = String(data[i][0]);
    const name = String(data[i][1]).trim();
    if (!year || !name) continue;
    if (!dues[year]) dues[year] = {};
    const months = {};
    for (let m = 1; m <= 12; m++) {
      if (data[i][m + 1]) months[m] = true;
    }
    const annual = !!data[i][14];
    dues[year][name] = { months, annual };
  }
  return { dues };
}

function saveDues(ss, data) {
  const sheet = getOrCreateSheet(ss, SHEET_DUES, ['연도', '이름', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '연회비']);
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  const dues = data.dues || {};
  const rows = [];
  Object.keys(dues).sort().forEach(year => {
    const yearData = dues[year];
    Object.keys(yearData).forEach(name => {
      const d = yearData[name];
      const row = [year, name];
      for (let m = 1; m <= 12; m++) {
        row.push(d.months && d.months[m] ? 1 : 0);
      }
      row.push(d.annual ? 1 : 0);
      rows.push(row);
    });
  });
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return getDues(ss);
}

// ===== 정산 =====
function getSettlements(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_SETTLEMENTS, ['키', '데이터']);
  const data = sheet.getDataRange().getValues();
  const settlements = {};
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    if (!key) continue;
    try {
      settlements[key] = JSON.parse(data[i][1]);
    } catch (e) { /* skip bad rows */ }
  }
  return { settlements };
}

function saveSettlements(ss, data) {
  const sheet = getOrCreateSheet(ss, SHEET_SETTLEMENTS, ['키', '데이터']);
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  const settlements = data.settlements || {};
  const rows = Object.keys(settlements).map(key => [key, JSON.stringify(settlements[key])]);
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  return getSettlements(ss);
}

// ===== 토너먼트 =====
function getTournaments(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_TOURNAMENTS, ['ID', '이름', '날짜', '데이터']);
  const data = sheet.getDataRange().getValues();
  const tournaments = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      try {
        const t = JSON.parse(data[i][3] || '{}');
        t.id = String(data[i][0]).trim();
        t.name = String(data[i][1]).trim();
        t.date = fmtDate(data[i][2]);
        tournaments.push(t);
      } catch (e) { /* skip bad rows */ }
    }
  }
  tournaments.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { tournaments };
}

function saveTournament(ss, tournament) {
  const sheet = getOrCreateSheet(ss, SHEET_TOURNAMENTS, ['ID', '이름', '날짜', '데이터']);
  const data = sheet.getDataRange().getValues();
  const id = tournament.id;
  const { id: _id, name: _name, date: _date, ...rest } = tournament;
  const rowData = [id, tournament.name, tournament.date, JSON.stringify(rest)];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === id) {
      sheet.getRange(i + 1, 1, 1, 4).setValues([rowData]);
      return getTournaments(ss);
    }
  }
  sheet.appendRow(rowData);
  return getTournaments(ss);
}

function deleteTournament(ss, id) {
  const sheet = ss.getSheetByName(SHEET_TOURNAMENTS);
  if (!sheet) return { tournaments: [] };
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === id) { sheet.deleteRow(i + 1); break; }
  }
  return getTournaments(ss);
}

// ===== 일괄 가져오기 =====
function importData(ss, data) {
  if (data.members && data.members.length > 0) {
    const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, ['이름', '기준에버', '가입일']);
    if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
    const rows = data.members.map(m => [m.name, m.baseScore || 0, m.joinDate || new Date()]);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  if (data.sessions && data.sessions.length > 0) {
    const sheet = getOrCreateSheet(ss, SHEET_SESSIONS, ['회차', '날짜', '게임수', '팀인원', '팀구성', '점수', '점수유형']);
    if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
    const rows = data.sessions.map(s => [s.round, s.date, s.numGames, s.teamSize, JSON.stringify(s.teams), JSON.stringify(s.scores), s.scoreType || '']);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  }
  if (data.dues) {
    saveDues(ss, { dues: data.dues });
  }
  if (data.settlements) {
    saveSettlements(ss, { settlements: data.settlements });
  }
  return { success: true };
}

// ===== 유틸 =====
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function fmtDate(val) {
  if (!val) return '';
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) return val.slice(0, 10);
  const d = new Date(val);
  if (isNaN(d)) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function resp(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
