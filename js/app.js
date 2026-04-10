/**
 * app.js - 아르케 존 볼링 클럽 점수 기록 앱
 * 엑셀과 동일한 형태: 개인전(실점수 + 오차) + 팀전(오차 합계)
 */

let currentTeams = [];
let currentSession = null; // { round, date, numGames, teamSize, teams, scores }

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSettings();
  initSession();
  initMemberForm();
  initFilters();
  refreshAll();
});

// ========================
// 탭
// ========================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      refreshTab(btn.dataset.tab);
    });
  });
}

async function refreshTab(tab) {
  switch (tab) {
    case 'home': await refreshHome(); break;
    case 'session': await refreshSessionTab(); break;
    case 'records': await refreshRecords(); break;
    case 'ranking': await refreshRanking(); break;
    case 'members': await refreshMembers(); break;
  }
}

async function refreshAll() {
  await refreshHome();
  await refreshSessionTab();
  await refreshMembers();
}

// ========================
// 홈
// ========================
async function refreshHome() {
  const sessions = await API.getSessions();
  const members = await API.getMembers();
  const recentEl = document.getElementById('recent-session');

  if (sessions.length === 0) {
    recentEl.innerHTML = emptyState('📋', '아직 모임 기록이 없습니다');
    document.getElementById('club-stats').innerHTML = emptyState('📊', '데이터가 없습니다');
    return;
  }

  // 최근 세션
  const latest = sessions[0];
  const memberMap = {};
  members.forEach(m => memberMap[m.name] = m);

  recentEl.innerHTML = `
    <p style="margin-bottom:8px;color:var(--text-light);font-size:0.85rem">
      📅 ${latest.round}회 (${formatDate(latest.date)}) · ${latest.scores.length}명 · ${latest.numGames}게임
    </p>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>이름</th>
        ${gameHeaders(latest.numGames)}
        <th>합계</th><th>에버</th><th>기본</th><th>오차</th>
      </tr></thead>
      <tbody>
        ${latest.scores.map(s => {
          const total = sumGames(s.games, latest.numGames);
          const avg = (total / latest.numGames).toFixed(1);
          const base = s.baseScore || 0;
          const diff = base > 0 ? (total - base * latest.numGames) : null;
          const diffAvg = base > 0 ? (parseFloat(avg) - base).toFixed(1) : null;
          return `<tr>
            <td><strong>${esc(s.name)}</strong></td>
            ${s.games.map((g, i) => i < latest.numGames ? `<td>${g || 0}</td>` : '').join('')}
            <td><strong>${total}</strong></td>
            <td><strong>${avg}</strong></td>
            <td>${base || '-'}</td>
            <td>${diffAvg !== null ? diffSpan(parseFloat(diffAvg)) : '-'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
    ${renderTeamSummaryReadonly(latest)}
  `;

  // 통계
  const totalSessions = sessions.length;
  let totalGames = 0;
  let allScores = [];
  sessions.forEach(ses => {
    ses.scores.forEach(s => {
      totalGames += ses.numGames;
      allScores.push(...s.games.filter((g, i) => i < ses.numGames && g > 0));
    });
  });
  const clubAvg = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
  const highScore = allScores.length > 0 ? Math.max(...allScores) : 0;

  document.getElementById('club-stats').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;">
      <div style="padding:10px;background:var(--bg);border-radius:8px;">
        <div style="font-size:0.75rem;color:var(--text-light)">총 모임</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--primary)">${totalSessions}회</div>
      </div>
      <div style="padding:10px;background:var(--bg);border-radius:8px;">
        <div style="font-size:0.75rem;color:var(--text-light)">회원</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--primary)">${members.length}명</div>
      </div>
      <div style="padding:10px;background:var(--bg);border-radius:8px;">
        <div style="font-size:0.75rem;color:var(--text-light)">클럽 에버</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--accent)">${clubAvg}</div>
      </div>
      <div style="padding:10px;background:var(--bg);border-radius:8px;">
        <div style="font-size:0.75rem;color:var(--text-light)">하이스코어</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--accent)">${highScore}</div>
      </div>
    </div>`;
}

// ========================
// 세션 (점수 입력)
// ========================
function initSession() {
  document.getElementById('session-date').value = todayStr();
  autoSelectWeekType();

  document.getElementById('btn-sel-all').addEventListener('click', () => {
    document.querySelectorAll('#session-member-checks input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  document.getElementById('btn-desel-all').addEventListener('click', () => {
    document.querySelectorAll('#session-member-checks input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  document.getElementById('btn-make-teams').addEventListener('click', stepMakeTeams);
  document.getElementById('btn-shuffle').addEventListener('click', stepMakeTeams);
  document.getElementById('btn-start-input').addEventListener('click', stepStartScoring);
  document.getElementById('btn-back-teams').addEventListener('click', () => {
    show('session-step2'); hide('session-step3');
  });
  document.getElementById('btn-save-session').addEventListener('click', saveCurrentSession);
}

async function refreshSessionTab() {
  const members = await API.getMembers();
  const checks = document.getElementById('session-member-checks');
  checks.innerHTML = members.map(m => `
    <label class="checkbox-item">
      <input type="checkbox" value="${esc(m.name)}" checked>
      <span>${esc(m.name)} <small>(${m.baseScore || 0})</small></span>
    </label>
  `).join('');

  await refreshSessionList();
}

function stepMakeTeams() {
  const teamSize = parseInt(document.getElementById('session-team-size').value);
  const checked = document.querySelectorAll('#session-member-checks input:checked');
  const names = Array.from(checked).map(cb => cb.value);

  if (names.length < teamSize) {
    toast(`최소 ${teamSize}명 이상 선택`, 'error');
    return;
  }

  API.getMembers().then(members => {
    const selected = names.map(n => {
      const m = members.find(x => x.name === n);
      return { name: n, baseScore: (m && m.baseScore) || 0 };
    });
    currentTeams = balanceTeams(selected, teamSize);
    renderTeamPreview();
    show('session-step2');
  });
}

function renderTeamPreview() {
  const el = document.getElementById('team-result');
  el.innerHTML = `<div class="team-grid">${currentTeams.map(t => `
    <div class="team-card">
      <div class="team-header">
        <strong>${t.name}</strong>
        <span class="team-avg">에버합 ${t.totalBase}</span>
      </div>
      <ul class="team-members">
        ${t.members.map(m => `<li><span>${esc(m.name)}</span><span class="base-tag">${m.baseScore}</span></li>`).join('')}
      </ul>
    </div>
  `).join('')}</div>`;
}

function stepStartScoring() {
  const numGames = parseInt(document.getElementById('session-games').value);
  const round = parseInt(document.getElementById('session-round').value) || 0;
  const date = document.getElementById('session-date').value;

  // 모든 참가자 (팀 순서대로)
  const allPlayers = [];
  currentTeams.forEach(team => {
    team.members.forEach(m => {
      allPlayers.push({ name: m.name, baseScore: m.baseScore, team: team.name });
    });
  });

  currentSession = { round, date, numGames, teamSize: currentTeams[0]?.members.length || 5, teams: currentTeams, scores: allPlayers };

  document.getElementById('scoring-title').textContent = `${round}회 번개 점수`;
  document.getElementById('scoring-sub').textContent = `${formatDate(date)} · ${numGames}게임 · ${allPlayers.length}명`;

  buildScoreTable(allPlayers, numGames);
  buildTeamScoreTables(numGames);

  hide('session-step1');
  hide('session-step2');
  show('session-step3');
}

function buildScoreTable(players, numGames) {
  const table = document.getElementById('individual-table');

  // 헤더: # | 이름 | 1G 2G 3G (4G) | 합계 | 에버 | 기본에버 | 1G오차 2G오차 ... | 합계오차 | 오차
  let html = `<thead><tr>
    <th>#</th><th>이름</th>
    ${Array.from({length: numGames}, (_, i) => `<th>${i + 1}G</th>`).join('')}
    <th>합계</th><th>에버</th><th>기본</th>
    ${Array.from({length: numGames}, (_, i) => `<th class="sub-header">${i + 1}G</th>`).join('')}
    <th class="sub-header">합계</th><th class="sub-header">오차</th>
  </tr></thead><tbody>`;

  players.forEach((p, idx) => {
    const rid = `p${idx}`;
    html += `<tr data-player="${idx}">
      <td>${idx + 1}</td>
      <td class="name-col">${esc(p.name)}</td>
      ${Array.from({length: numGames}, (_, g) =>
        `<td><input type="number" id="${rid}_g${g}" min="0" max="300" data-p="${idx}" data-g="${g}" class="score-input" placeholder="0"></td>`
      ).join('')}
      <td class="calc" id="${rid}_total">0</td>
      <td class="calc" id="${rid}_avg">0</td>
      <td class="base-col">${p.baseScore || 0}</td>
      ${Array.from({length: numGames}, (_, g) => `<td class="calc" id="${rid}_d${g}">0</td>`).join('')}
      <td class="calc" id="${rid}_dtotal">0</td>
      <td class="calc" id="${rid}_davg">0</td>
    </tr>`;
  });

  html += '</tbody>';
  table.innerHTML = html;

  // 입력 이벤트
  table.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('input', () => recalcRow(parseInt(input.dataset.p), numGames));
  });
}

function recalcRow(pIdx, numGames) {
  const rid = `p${pIdx}`;
  const p = currentSession.scores[pIdx];
  const base = p.baseScore || 0;
  const basePerGame = base; // 엑셀에서 기본에버 = 1게임 기준 에버

  const games = [];
  for (let g = 0; g < numGames; g++) {
    const val = parseInt(document.getElementById(`${rid}_g${g}`).value) || 0;
    games.push(val);
  }

  const total = games.reduce((a, b) => a + b, 0);
  const avg = numGames > 0 ? (total / numGames) : 0;

  document.getElementById(`${rid}_total`).textContent = total;
  document.getElementById(`${rid}_avg`).textContent = avg % 1 === 0 ? avg : avg.toFixed(1);

  // 오차
  let diffTotal = 0;
  for (let g = 0; g < numGames; g++) {
    const diff = games[g] - basePerGame;
    diffTotal += diff;
    const el = document.getElementById(`${rid}_d${g}`);
    el.textContent = diff;
    el.className = 'calc ' + (diff >= 0 ? 'diff-positive' : 'diff-negative');
  }

  const elDTotal = document.getElementById(`${rid}_dtotal`);
  elDTotal.textContent = diffTotal;
  elDTotal.className = 'calc ' + (diffTotal >= 0 ? 'diff-positive' : 'diff-negative');

  const diffAvg = numGames > 0 ? (diffTotal / numGames) : 0;
  const elDAvg = document.getElementById(`${rid}_davg`);
  elDAvg.textContent = diffAvg % 1 === 0 ? diffAvg : diffAvg.toFixed(1);
  elDAvg.className = 'calc ' + (diffAvg >= 0 ? 'diff-positive' : 'diff-negative');

  // 팀 테이블 갱신
  recalcTeamScores(numGames);
}

function buildTeamScoreTables(numGames) {
  const container = document.getElementById('team-score-tables');
  let html = '';

  currentTeams.forEach((team, ti) => {
    const teamPlayers = currentSession.scores.filter(p => p.team === team.name);
    html += `<div class="team-score-block">
      <h4>${team.name} (에버합: ${team.totalBase})</h4>
      <div class="table-scroll">
      <table class="score-table" id="team-table-${ti}">
        <thead><tr>
          <th>이름</th>
          ${Array.from({length: numGames}, (_, i) => `<th>${i + 1}G</th>`).join('')}
          <th>합계</th>
        </tr></thead>
        <tbody>
          ${teamPlayers.map(p => {
            const pIdx = currentSession.scores.indexOf(p);
            return `<tr data-team-player="${pIdx}">
              <td class="name-col">${esc(p.name)}</td>
              ${Array.from({length: numGames}, (_, g) => `<td id="td${ti}_p${pIdx}_d${g}">0</td>`).join('')}
              <td id="td${ti}_p${pIdx}_dt"><strong>0</strong></td>
            </tr>`;
          }).join('')}
          <tr style="background:var(--bg);font-weight:700;">
            <td>팀 합계</td>
            ${Array.from({length: numGames}, (_, g) => `<td id="td${ti}_sum_g${g}">0</td>`).join('')}
            <td id="td${ti}_sum_total"><strong>0</strong></td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

function recalcTeamScores(numGames) {
  currentTeams.forEach((team, ti) => {
    const teamPlayers = currentSession.scores.filter(p => p.team === team.name);
    const gameSums = Array(numGames).fill(0);
    let grandTotal = 0;

    teamPlayers.forEach(p => {
      const pIdx = currentSession.scores.indexOf(p);
      const rid = `p${pIdx}`;
      const base = p.baseScore || 0;

      for (let g = 0; g < numGames; g++) {
        const val = parseInt(document.getElementById(`${rid}_g${g}`)?.value) || 0;
        const diff = val - base;

        const el = document.getElementById(`td${ti}_p${pIdx}_d${g}`);
        if (el) {
          el.textContent = diff;
          el.className = diff >= 0 ? 'diff-positive' : 'diff-negative';
        }
        gameSums[g] += diff;
      }

      const playerDiffTotal = gameSums.reduce ? undefined : 0; // computed per player
      let pdt = 0;
      for (let g = 0; g < numGames; g++) {
        const val = parseInt(document.getElementById(`${rid}_g${g}`)?.value) || 0;
        pdt += val - base;
      }
      const elPdt = document.getElementById(`td${ti}_p${pIdx}_dt`);
      if (elPdt) {
        elPdt.innerHTML = `<strong>${pdt}</strong>`;
        elPdt.className = pdt >= 0 ? 'diff-positive' : 'diff-negative';
      }
    });

    // 팀별 게임 합계 다시 계산
    const gSums = Array(numGames).fill(0);
    let teamTotal = 0;
    teamPlayers.forEach(p => {
      const pIdx = currentSession.scores.indexOf(p);
      const base = p.baseScore || 0;
      for (let g = 0; g < numGames; g++) {
        const val = parseInt(document.getElementById(`p${pIdx}_g${g}`)?.value) || 0;
        gSums[g] += val - base;
      }
    });

    for (let g = 0; g < numGames; g++) {
      teamTotal += gSums[g];
      const el = document.getElementById(`td${ti}_sum_g${g}`);
      if (el) {
        el.textContent = gSums[g];
        el.className = gSums[g] >= 0 ? 'diff-positive' : 'diff-negative';
      }
    }

    const elTotal = document.getElementById(`td${ti}_sum_total`);
    if (elTotal) {
      elTotal.innerHTML = `<strong>${teamTotal}</strong>`;
      elTotal.className = teamTotal >= 0 ? 'diff-positive' : 'diff-negative';
    }
  });
}

async function saveCurrentSession() {
  if (!currentSession) { toast('세션이 없습니다', 'error'); return; }

  const numGames = currentSession.numGames;
  // 점수 수집
  const scores = currentSession.scores.map((p, idx) => {
    const games = [];
    for (let g = 0; g < numGames; g++) {
      games.push(parseInt(document.getElementById(`p${idx}_g${g}`).value) || 0);
    }
    return { name: p.name, baseScore: p.baseScore, team: p.team, games };
  });

  const session = {
    round: currentSession.round,
    date: currentSession.date,
    numGames,
    teamSize: currentSession.teamSize,
    teams: currentTeams.map(t => ({ name: t.name, members: t.members.map(m => ({ name: m.name, baseScore: m.baseScore })), totalBase: t.totalBase })),
    scores
  };

  try {
    await API.saveSession(session);
    toast(`${session.round}회 번개 저장 완료`, 'success');
    refreshSessionList();
    refreshHome();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function refreshSessionList() {
  const sessions = await API.getSessions();
  const el = document.getElementById('session-list');

  if (sessions.length === 0) {
    el.innerHTML = emptyState('📋', '저장된 모임이 없습니다');
    return;
  }

  el.innerHTML = sessions.map(s => `
    <div class="session-item" onclick="loadSession(${s.round})">
      <div class="session-info">
        <div class="session-round">${s.round}회 번개</div>
        <div class="session-meta">${formatDate(s.date)} · ${s.scores.length}명 · ${s.numGames}게임</div>
      </div>
      <button class="btn-icon delete" onclick="event.stopPropagation();deleteSession(${s.round})">삭제</button>
    </div>
  `).join('');
}

async function loadSession(round) {
  const sessions = await API.getSessions();
  const session = sessions.find(s => s.round === round);
  if (!session) return;

  // 세션 복원
  document.getElementById('session-round').value = session.round;
  document.getElementById('session-date').value = session.date;
  document.getElementById('session-games').value = session.numGames;
  document.getElementById('session-team-size').value = session.teamSize;

  currentTeams = session.teams.map(t => ({
    name: t.name,
    members: t.members,
    totalBase: t.totalBase
  }));

  currentSession = {
    round: session.round,
    date: session.date,
    numGames: session.numGames,
    teamSize: session.teamSize,
    teams: currentTeams,
    scores: session.scores.map(s => ({ name: s.name, baseScore: s.baseScore, team: s.team }))
  };

  document.getElementById('scoring-title').textContent = `${session.round}회 번개 점수`;
  document.getElementById('scoring-sub').textContent = `${formatDate(session.date)} · ${session.numGames}게임 · ${session.scores.length}명`;

  buildScoreTable(currentSession.scores, session.numGames);
  buildTeamScoreTables(session.numGames);

  // 점수 복원
  session.scores.forEach((s, idx) => {
    s.games.forEach((g, gi) => {
      if (gi < session.numGames) {
        const el = document.getElementById(`p${idx}_g${gi}`);
        if (el) el.value = g || '';
      }
    });
    recalcRow(idx, session.numGames);
  });

  hide('session-step1');
  hide('session-step2');
  show('session-step3');
}
window.loadSession = loadSession;

async function deleteSession(round) {
  if (!confirm(`${round}회 번개 기록을 삭제하시겠습니까?`)) return;
  await API.deleteSession(round);
  toast('삭제되었습니다', 'success');
  refreshSessionList();
}
window.deleteSession = deleteSession;

// ========================
// 기록 조회
// ========================
function initFilters() {
  document.getElementById('filter-month').value = new Date().toISOString().slice(0, 7);
  document.getElementById('btn-filter').addEventListener('click', refreshRecords);
  document.getElementById('btn-rank-filter').addEventListener('click', refreshRanking);
}

async function refreshRecords() {
  const sessions = await API.getSessions();
  const members = await API.getMembers();

  const filterMember = document.getElementById('filter-member');
  const cur = filterMember.value;
  filterMember.innerHTML = '<option value="">전체</option>' +
    members.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
  if (cur) filterMember.value = cur;

  const mFilter = document.getElementById('filter-member').value;
  const monthFilter = document.getElementById('filter-month').value;

  // 세션을 개인 레코드로 풀기
  let records = [];
  sessions.forEach(ses => {
    if (monthFilter && !ses.date.startsWith(monthFilter)) return;
    ses.scores.forEach(s => {
      if (mFilter && s.name !== mFilter) return;
      const total = sumGames(s.games, ses.numGames);
      const avg = (total / ses.numGames).toFixed(1);
      records.push({ round: ses.round, date: ses.date, name: s.name, games: s.games, numGames: ses.numGames, total, avg: parseFloat(avg), baseScore: s.baseScore, team: s.team });
    });
  });

  const tableEl = document.getElementById('records-table');
  if (records.length === 0) {
    tableEl.innerHTML = emptyState('📊', '기록이 없습니다');
    document.getElementById('personal-stats-card').style.display = 'none';
    return;
  }

  tableEl.innerHTML = `<div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>회차</th><th>이름</th><th>1G</th><th>2G</th><th>3G</th><th>4G</th><th>합계</th><th>에버</th><th>기본</th><th>오차</th></tr></thead>
      <tbody>
        ${records.map(r => {
          const diffAvg = r.baseScore > 0 ? (r.avg - r.baseScore).toFixed(1) : null;
          return `<tr>
            <td>${r.round}회</td>
            <td><strong>${esc(r.name)}</strong></td>
            <td>${r.games[0] || '-'}</td>
            <td>${r.games[1] || '-'}</td>
            <td>${r.games[2] || '-'}</td>
            <td>${r.numGames >= 4 ? (r.games[3] || '-') : '-'}</td>
            <td><strong>${r.total}</strong></td>
            <td><strong>${r.avg}</strong></td>
            <td>${r.baseScore || '-'}</td>
            <td>${diffAvg !== null ? diffSpan(parseFloat(diffAvg)) : '-'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;

  // 개인 통계
  const statsCard = document.getElementById('personal-stats-card');
  if (mFilter) {
    statsCard.style.display = 'block';
    document.getElementById('personal-stats-title').textContent = `${mFilter} 통계`;

    const allGames = records.flatMap(r => r.games.filter((g, i) => i < r.numGames && g > 0));
    const totalAvg = allGames.length > 0 ? Math.round(allGames.reduce((a, b) => a + b, 0) / allGames.length) : 0;
    const highGame = allGames.length > 0 ? Math.max(...allGames) : 0;
    const lowGame = allGames.length > 0 ? Math.min(...allGames) : 0;

    document.getElementById('personal-stats').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;">
        <div style="padding:10px;background:var(--bg);border-radius:8px;">
          <div style="font-size:0.75rem;color:var(--text-light)">참가</div>
          <div style="font-size:1.3rem;font-weight:700;color:var(--primary)">${records.length}회</div>
        </div>
        <div style="padding:10px;background:var(--bg);border-radius:8px;">
          <div style="font-size:0.75rem;color:var(--text-light)">에버</div>
          <div style="font-size:1.3rem;font-weight:700;color:var(--accent)">${totalAvg}</div>
        </div>
        <div style="padding:10px;background:var(--bg);border-radius:8px;">
          <div style="font-size:0.75rem;color:var(--text-light)">최고</div>
          <div style="font-size:1.3rem;font-weight:700;color:var(--success)">${highGame}</div>
        </div>
        <div style="padding:10px;background:var(--bg);border-radius:8px;">
          <div style="font-size:0.75rem;color:var(--text-light)">최저</div>
          <div style="font-size:1.3rem;font-weight:700;color:var(--danger)">${lowGame}</div>
        </div>
      </div>`;
  } else {
    statsCard.style.display = 'none';
  }
}

// ========================
// 랭킹
// ========================
async function refreshRanking() {
  const sessions = await API.getSessions();
  const period = document.getElementById('rank-period').value;

  let filtered = sessions;
  if (period === 'month') {
    const mo = new Date().toISOString().slice(0, 7);
    filtered = sessions.filter(s => s.date.startsWith(mo));
  } else if (period === 'recent5') {
    filtered = sessions.slice(0, 5);
  }

  // 에버 랭킹
  const memberStats = {};
  filtered.forEach(ses => {
    ses.scores.forEach(s => {
      if (!memberStats[s.name]) memberStats[s.name] = { totalScore: 0, totalGames: 0, sessions: 0 };
      const ms = memberStats[s.name];
      ms.totalScore += sumGames(s.games, ses.numGames);
      ms.totalGames += ses.numGames;
      ms.sessions++;
    });
  });

  const avgRanking = Object.entries(memberStats)
    .map(([name, d]) => ({ name, avg: Math.round(d.totalScore / d.totalGames), sessions: d.sessions }))
    .sort((a, b) => b.avg - a.avg);

  document.getElementById('avg-ranking').innerHTML = avgRanking.length === 0
    ? emptyState('🏆', '기록 없음')
    : rankList(avgRanking);

  // 하이스코어
  const gameRecords = [];
  filtered.forEach(ses => {
    ses.scores.forEach(s => {
      s.games.forEach((g, i) => {
        if (i < ses.numGames && g > 0) {
          gameRecords.push({ member: s.name, score: g, round: ses.round, game: `${i + 1}G` });
        }
      });
    });
  });
  gameRecords.sort((a, b) => b.score - a.score);

  document.getElementById('high-scores').innerHTML = gameRecords.length === 0
    ? emptyState('🎯', '기록 없음')
    : `<ol class="rank-list">${gameRecords.slice(0, 10).map((r, i) => `
        <li class="rank-item rank-${i + 1}">
          <div class="rank-num">${i + 1}</div>
          <div class="rank-info">
            <div class="rank-name">${esc(r.member)}</div>
            <div class="rank-detail">${r.round}회 ${r.game}</div>
          </div>
          <div class="rank-score">${r.score}</div>
        </li>
      `).join('')}</ol>`;
}

// ========================
// 회원 관리
// ========================
function initMemberForm() {
  document.getElementById('member-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-member-name').value.trim();
    const base = parseInt(document.getElementById('new-member-base').value) || 0;
    if (!name) return;
    try {
      await API.addMember(name, base);
      toast(`${name} 추가`, 'success');
      document.getElementById('new-member-name').value = '';
      document.getElementById('new-member-base').value = '';
      refreshMembers();
      refreshSessionTab();
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function refreshMembers() {
  const members = await API.getMembers();
  document.getElementById('member-count').textContent = members.length;
  const el = document.getElementById('member-list');
  if (members.length === 0) {
    el.innerHTML = emptyState('👥', '회원을 추가해주세요');
    return;
  }
  el.innerHTML = members.map(m => `
    <div class="member-item">
      <div>
        <div class="member-name">${esc(m.name)}</div>
        <div class="member-sub">기준에버: <input type="number" class="base-score-input" value="${m.baseScore || 0}" min="0" max="300" data-member="${esc(m.name)}" onchange="updateBase(this)"></div>
      </div>
      <button class="btn-icon delete" onclick="removeMember('${esc(m.name)}')">삭제</button>
    </div>
  `).join('');
}

async function updateBase(input) {
  const name = input.dataset.member;
  const base = parseInt(input.value) || 0;
  await API.updateMember(name, { baseScore: base });
  toast(`${name} 기준에버: ${base}`, 'success');
}
window.updateBase = updateBase;

async function removeMember(name) {
  if (!confirm(`${name} 삭제?`)) return;
  await API.removeMember(name);
  toast('삭제됨', 'success');
  refreshMembers();
  refreshSessionTab();
}
window.removeMember = removeMember;

// ========================
// 설정
// ========================
function initSettings() {
  const toggle = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings-panel');
  const settings = API.getSettings();
  document.getElementById('api-url').value = settings.apiUrl || '';
  document.getElementById('demo-mode').checked = settings.demoMode;

  toggle.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    API.saveSettings({
      apiUrl: document.getElementById('api-url').value,
      demoMode: document.getElementById('demo-mode').checked
    });
    toast('설정 저장됨', 'success');
    panel.style.display = 'none';
  });
  document.getElementById('btn-export').addEventListener('click', () => {
    const data = API.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bowling_${todayStr()}.json`; a.click();
    URL.revokeObjectURL(url);
  });
  const importFile = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { API.importData(ev.target.result); toast('가져오기 완료', 'success'); refreshAll(); }
      catch { toast('잘못된 파일', 'error'); }
    };
    reader.readAsText(file);
    importFile.value = '';
  });
}

// ========================
// 유틸리티
// ========================
function balanceTeams(players, teamSize) {
  const numTeams = Math.ceil(players.length / teamSize);
  const sorted = [...players].sort((a, b) => b.baseScore - a.baseScore);

  const teams = Array.from({ length: numTeams }, (_, i) => ({ name: `${i + 1}팀`, members: [], totalBase: 0 }));

  // 스네이크 드래프트
  sorted.forEach((p, idx) => {
    const round = Math.floor(idx / numTeams);
    const ti = round % 2 === 0 ? idx % numTeams : numTeams - 1 - (idx % numTeams);
    teams[ti].members.push(p);
    teams[ti].totalBase += p.baseScore;
  });

  return teams;
}

function renderTeamSummaryReadonly(session) {
  if (!session.teams || session.teams.length === 0) return '';

  return `<div style="margin-top:12px;">
    <h3 style="font-size:0.9rem;color:var(--primary);margin-bottom:8px;">팀전 결과</h3>
    ${session.teams.map((t, ti) => {
      const teamPlayers = session.scores.filter(s => s.team === t.name);
      const numGames = session.numGames;

      const gSums = Array(numGames).fill(0);
      teamPlayers.forEach(p => {
        for (let g = 0; g < numGames; g++) {
          gSums[g] += (p.games[g] || 0) - (p.baseScore || 0);
        }
      });
      const teamTotal = gSums.reduce((a, b) => a + b, 0);

      return `<div style="margin-bottom:8px;padding:8px;background:var(--bg);border-radius:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <strong>${t.name}</strong>
          <span style="font-weight:700;" class="${teamTotal >= 0 ? 'diff-up' : 'diff-down'}">${teamTotal >= 0 ? '+' : ''}${teamTotal}</span>
        </div>
        <div style="font-size:0.78rem;color:var(--text-light);">
          ${teamPlayers.map(p => esc(p.name)).join(', ')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function sumGames(games, numGames) {
  let t = 0;
  for (let i = 0; i < numGames && i < games.length; i++) t += (games[i] || 0);
  return t;
}

function gameHeaders(n) {
  return Array.from({ length: n }, (_, i) => `<th>${i + 1}G</th>`).join('');
}

function rankList(items) {
  return `<ol class="rank-list">${items.map((item, i) => `
    <li class="rank-item rank-${i + 1}">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-info">
        <div class="rank-name">${esc(item.name)}</div>
        <div class="rank-detail">${item.sessions}회 참가</div>
      </div>
      <div class="rank-score">${item.avg}</div>
    </li>
  `).join('')}</ol>`;
}

function diffSpan(val) {
  const cls = val >= 0 ? 'diff-up' : 'diff-down';
  return `<span class="${cls}">${val >= 0 ? '+' : ''}${val}</span>`;
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="icon">${icon}</div><p>${text}</p></div>`;
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type + ' show';
  setTimeout(() => el.classList.remove('show'), 2500);
}

function formatDate(d) {
  if (!d) return '-';
  const [y, m, dd] = d.split('-');
  return `${y}.${parseInt(m)}.${parseInt(dd)}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function autoSelectWeekType() {
  const w = Math.ceil(new Date().getDate() / 7);
  document.getElementById('session-games').value = (w === 1 || w === 3) ? '3' : '4';
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function show(id) { document.getElementById(id).style.display = ''; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
