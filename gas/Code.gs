/**
 * Google Apps Script - 아르케 존 볼링 클럽 API (세션 기반)
 *
 * [설치 방법]
 * 1. Google Sheets 새 스프레드시트 생성
 * 2. 시트 이름: "회원목록", "세션목록"
 *    - 회원목록 1행: 이름 | 기준에버 | 가입일
 *    - 세션목록 1행: 회차 | 날짜 | 게임수 | 팀인원 | 팀구성(JSON) | 점수(JSON)
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

function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    switch (action) {
      case 'getMembers': return resp(getMembers(ss));
      case 'getSessions': return resp(getSessions(ss));
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
      case 'addMember': return resp(addMember(ss, data.name, data.baseScore));
      case 'removeMember': return resp(removeMember(ss, data.name));
      case 'updateMember': return resp(updateMember(ss, data.name, data.updates));
      case 'saveSession': return resp(saveSession(ss, data.session));
      case 'deleteSession': return resp(deleteSession(ss, data.round));
      case 'importData': return resp(importData(ss, data));
      default: return resp({ error: 'Unknown action: ' + data.action });
    }
  } catch (err) {
    return resp({ error: err.message });
  }
}

// ===== 회원 =====
function getMembers(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, ['이름', '기준에버', '가입일']);
  const data = sheet.getDataRange().getValues();
  const members = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      members.push({
        name: String(data[i][0]).trim(),
        baseScore: Number(data[i][1]) || 0,
        joinDate: fmtDate(data[i][2])
      });
    }
  }
  members.sort((a, b) => b.baseScore - a.baseScore || a.name.localeCompare(b.name, 'ko'));
  return { members };
}

function addMember(ss, name, baseScore) {
  const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, ['이름', '기준에버', '가입일']);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === name) throw new Error('이미 존재하는 회원입니다.');
  }
  sheet.appendRow([name, baseScore || 0, new Date()]);
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
  const sheet = getOrCreateSheet(ss, SHEET_SESSIONS, ['회차', '날짜', '게임수', '팀인원', '팀구성', '점수']);
  const data = sheet.getDataRange().getValues();
  const sessions = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      try {
        sessions.push({
          round: Number(data[i][0]),
          date: fmtDate(data[i][1]),
          numGames: Number(data[i][2]),
          teamSize: Number(data[i][3]),
          teams: JSON.parse(data[i][4] || '[]'),
          scores: JSON.parse(data[i][5] || '[]')
        });
      } catch (e) { /* skip bad rows */ }
    }
  }
  sessions.sort((a, b) => b.round - a.round);
  return { sessions };
}

function saveSession(ss, session) {
  const sheet = getOrCreateSheet(ss, SHEET_SESSIONS, ['회차', '날짜', '게임수', '팀인원', '팀구성', '점수']);
  const data = sheet.getDataRange().getValues();
  const round = Number(session.round);
  const rowData = [
    round,
    session.date,
    session.numGames,
    session.teamSize,
    JSON.stringify(session.teams),
    JSON.stringify(session.scores)
  ];

  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === round) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([rowData]);
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

// ===== 일괄 가져오기 =====
function importData(ss, data) {
  if (data.members && data.members.length > 0) {
    const sheet = getOrCreateSheet(ss, SHEET_MEMBERS, ['이름', '기준에버', '가입일']);
    if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
    data.members.forEach(m => {
      sheet.appendRow([m.name, m.baseScore || 0, m.joinDate || new Date()]);
    });
  }
  if (data.sessions && data.sessions.length > 0) {
    const sheet = getOrCreateSheet(ss, SHEET_SESSIONS, ['회차', '날짜', '게임수', '팀인원', '팀구성', '점수']);
    if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
    data.sessions.forEach(s => {
      sheet.appendRow([s.round, s.date, s.numGames, s.teamSize, JSON.stringify(s.teams), JSON.stringify(s.scores)]);
    });
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
