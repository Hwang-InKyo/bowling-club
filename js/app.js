/**
 * app.js - 아르케 존 볼링 클럽 점수 기록 앱
 * 엑셀과 동일한 형태: 개인전(실점수 + 오차) + 팀전(오차 합계)
 */

let currentTeams = [];
let currentSession = null; // { round, date, numGames, teamSize, teams, scores }
let guestPlayers = []; // 게스트 목록 [{name, baseScore}]
let appRole = null; // 'admin' | 'viewer'
let currentTournament = null;

const PIN_ADMIN = '0410';
const PIN_VIEWER = '0409';
const SESSION_DURATION = 2 * 60 * 60 * 1000; // 2시간

document.addEventListener('DOMContentLoaded', () => {
  initLockScreen();
});

function checkSavedSession() {
  try {
    const saved = sessionStorage.getItem('bowling_session_auth');
    if (!saved) return null;
    const data = JSON.parse(saved);
    if (Date.now() - data.ts < SESSION_DURATION) return data.role;
    sessionStorage.removeItem('bowling_session_auth');
  } catch (e) { /* ignore */ }
  return null;
}

function saveSessionAuth(role) {
  sessionStorage.setItem('bowling_session_auth', JSON.stringify({ role, ts: Date.now() }));
}

function initLockScreen() {
  const pinInput = document.getElementById('pin-input');
  const btnEnter = document.getElementById('btn-pin-enter');
  const pinError = document.getElementById('pin-error');

  function enterApp() {
    document.getElementById('lock-screen').style.display = 'none';
    document.getElementById('app-wrap').style.display = '';
    applyRole();
    initTabs();
    initSettings();
    initSession();
    initTournament();
    initMemberForm();
    initFilters();
    refreshAll();
  }

  function tryPin() {
    const pin = pinInput.value.trim();
    if (pin === PIN_ADMIN) {
      appRole = 'admin';
    } else if (pin === PIN_VIEWER) {
      appRole = 'viewer';
    } else {
      pinError.style.display = 'block';
      pinInput.value = '';
      pinInput.focus();
      return;
    }
    saveSessionAuth(appRole);
    enterApp();
  }

  // 항상 등록
  btnEnter.addEventListener('click', tryPin);
  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryPin();
    pinError.style.display = 'none';
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('bowling_session_auth');
    appRole = null;
    document.getElementById('lock-screen').style.display = '';
    document.getElementById('app-wrap').style.display = 'none';
    pinInput.value = '';
    pinInput.focus();
  });

  // 저장된 세션 확인 (2시간 이내)
  const savedRole = checkSavedSession();
  if (savedRole) {
    appRole = savedRole;
    enterApp();
    return;
  }

  pinInput.focus();
}

function applyRole() {
  const badge = document.getElementById('role-badge');
  if (appRole === 'admin') {
    badge.textContent = '관리자';
    badge.className = 'role-badge admin';
  } else {
    badge.textContent = '조회모드';
    badge.className = 'role-badge viewer';
  }

  // 조회 모드: 점수입력/회원관리 탭 숨기기, 설정 숨기기
  const sessionTab = document.querySelector('[data-tab="session"]');
  const membersTab = document.querySelector('[data-tab="members"]');
  const settingsToggle = document.getElementById('settings-toggle');

  if (appRole === 'viewer') {
    if (sessionTab) sessionTab.style.display = 'none';
    if (membersTab) membersTab.style.display = 'none';
    if (settingsToggle) settingsToggle.style.display = 'none';
  } else {
    if (sessionTab) sessionTab.style.display = '';
    if (membersTab) membersTab.style.display = '';
    if (settingsToggle) settingsToggle.style.display = '';
  }
}

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
    case 'tournament': await refreshTournament(); break;
    case 'records': await refreshRecords(); break;
    case 'ranking': await refreshRanking(); break;
    case 'members': await refreshMembers(); break;
  }
}

async function refreshAll() {
  await refreshHome();
  await refreshSessionTab();
  await refreshTournament();
  await refreshMembers();
}

// ========================
// 토너먼트 (테스트용)
// ========================
function initTournament() {
  const btnRandom = document.getElementById('btn-tournament-random');
  const btnClear = document.getElementById('btn-tournament-clear');
  if (!btnRandom || !btnClear) return;

  btnRandom.addEventListener('click', generateRandomTournament);
  btnClear.addEventListener('click', () => {
    currentTournament = null;
    renderTournament();
  });
}

async function refreshTournament() {
  renderTournament();
}

async function generateRandomTournament() {
  try {
    const members = await API.getMembers();
    const count = members.length >= 24 ? 24 : (members.length >= 20 ? members.length : 20);
    const selected = pickTournamentPlayers(members, count);
    currentTournament = buildTournamentBracket(selected);
    renderTournament();
    toast(`${count}인 토너먼트 대진표 생성 완료`, 'success');
  } catch (e) {
    toast(e.message || '토너먼트 생성 실패', 'error');
  }
}

function pickTournamentPlayers(members, count) {
  const curQKey = getCurrentQuarterKey();
  const pool = [...members].map(m => ({
    name: m.name,
    baseScore: getMemberBaseForQuarter(m, curQKey)
  }));
  const shuffledPool = shuffleArray(pool);
  const picked = shuffledPool.slice(0, count);

  // 회원 수가 부족하면 테스트용 이름으로 채움
  if (picked.length < count) {
    for (let i = picked.length + 1; i <= count; i++) {
      picked.push({ name: `테스트참가자${i}`, baseScore: 180 });
    }
  }
  return picked;
}

function buildTournamentBracket(players) {
  if (!players || players.length < 20 || players.length > 24) {
    throw new Error('토너먼트 참가자는 20~24명이어야 합니다.');
  }

  const seeded = shuffleArray(players).map((p, i) => ({ seed: i + 1, name: p.name, baseScore: p.baseScore || 0 }));
  const slot = {};
  seeded.slice(0, 20).forEach((s, i) => { slot[i + 1] = s; });
  const extra = seeded.slice(20, 24);
  const byeFill = [
    extra[0] || { seed: null, name: '부전승', isBye: true },
    extra[1] || { seed: null, name: '부전승', isBye: true },
    extra[2] || { seed: null, name: '부전승', isBye: true },
    extra[3] || { seed: null, name: '부전승', isBye: true }
  ];

  // 1차전(20명): 10명씩 2그룹으로 나누고, 각 그룹 상위 2명은 부전승
  // A그룹: #1~#10, B그룹: #11~#20
  const round1 = [
    { id: 'R1-A-BYE1', a: slot[1], b: byeFill[0] },
    { id: 'R1-A-BYE2', a: slot[2], b: byeFill[1] },
    { id: 'R1-A1', a: slot[3], b: slot[10] },
    { id: 'R1-A2', a: slot[4], b: slot[9] },
    { id: 'R1-A3', a: slot[5], b: slot[8] },
    { id: 'R1-A4', a: slot[6], b: slot[7] },

    { id: 'R1-B-BYE1', a: slot[11], b: byeFill[2] },
    { id: 'R1-B-BYE2', a: slot[12], b: byeFill[3] },
    { id: 'R1-B1', a: slot[13], b: slot[20] },
    { id: 'R1-B2', a: slot[14], b: slot[19] },
    { id: 'R1-B3', a: slot[15], b: slot[18] },
    { id: 'R1-B4', a: slot[16], b: slot[17] }
  ];

  // 2차전(12명): A/B 그룹에서 올라온 6명씩 교차 대진
  const round2 = [
    { id: 'R2-1', a: { seed: null, name: '승자 R1-A-BYE1' }, b: { seed: null, name: '승자 R1-A-BYE2' } },
    { id: 'R2-2', a: { seed: null, name: '승자 R1-A1' }, b: { seed: null, name: '승자 R1-A2' } },
    { id: 'R2-3', a: { seed: null, name: '승자 R1-A3' }, b: { seed: null, name: '승자 R1-A4' } },
    { id: 'R2-4', a: { seed: null, name: '승자 R1-B-BYE1' }, b: { seed: null, name: '승자 R1-B-BYE2' } },
    { id: 'R2-5', a: { seed: null, name: '승자 R1-B1' }, b: { seed: null, name: '승자 R1-B2' } },
    { id: 'R2-6', a: { seed: null, name: '승자 R1-B3' }, b: { seed: null, name: '승자 R1-B4' } }
  ];

  // 3차전(6명): 2차전 승자 6명으로 3경기
  const round3 = [
    { id: 'R3-1', a: { seed: null, name: '승자 R2-1' }, b: { seed: null, name: '승자 R2-2' } },
    { id: 'R3-2', a: { seed: null, name: '승자 R2-3' }, b: { seed: null, name: '승자 R2-4' } },
    { id: 'R3-3', a: { seed: null, name: '승자 R2-5' }, b: { seed: null, name: '승자 R2-6' } }
  ];

  const finalRound = [
    {
      id: 'R4-FINAL',
      players: [
        { seed: null, name: '승자 R3-1' },
        { seed: null, name: '승자 R3-2' },
        { seed: null, name: '승자 R3-3' }
      ]
    }
  ];

  return {
    selected: seeded,
    rounds: [
      { title: '1차전 (20명)', matches: round1 },
      { title: '2차전 (12명)', matches: round2 },
      { title: '3차전 (6명)', matches: round3 },
      { title: '4차전 결승 (3명)', matches: finalRound }
    ]
  };
}

function renderTournament() {
  const summaryEl = document.getElementById('tournament-summary');
  const bracketEl = document.getElementById('tournament-bracket');
  if (!summaryEl || !bracketEl) return;

  if (!currentTournament) {
    summaryEl.innerHTML = emptyState('🎯', '토너먼트 모드를 선택하고 점수를 입력하면 자동 반영됩니다');
    bracketEl.innerHTML = emptyState('🧩', '아직 생성된 대진표가 없습니다');
    return;
  }

  if (currentTournament.mode === 'teamRep') {
    renderTeamRepresentativeTournament(summaryEl, bracketEl, currentTournament, currentSession);
    return;
  }

  summaryEl.innerHTML = `
    <p style="font-size:0.8rem;color:var(--text-light);margin-bottom:6px;">승리 기준: <strong>실점수 - 기준에버</strong> 값이 높은 선수</p>
    <p style="font-size:0.78rem;color:var(--text-light);margin-bottom:6px;">라운드 기준: 1차전=1G, 2차전=2G, 3차전=3G, 4차전=4G</p>
    <p style="font-size:0.82rem;color:var(--text-light);margin-bottom:8px;">선발 인원 ${currentTournament.selected.length}명</p>
    <div class="tournament-picked-list">
      ${currentTournament.selected.map(p => `<span class="tournament-chip">#${p.seed} ${esc(p.name)} <small>(기준 ${p.baseScore || 0})</small></span>`).join('')}
    </div>
  `;

  const tournamentEval = evaluateTournament(currentTournament, currentSession);
  const winners = tournamentEval.winners;
  const scoreMap = tournamentEval.scoreMap;

  function renderMatchCard(m, roundIdx) {
    if (m.players && m.players.length === 3) {
      return `
        <div class="tournament-match final-three">
          <div class="match-id">${m.id}</div>
          ${m.players.map((p, i) => {
            const resolved = resolveTournamentEntry(p, winners);
            return `<div class="match-player">${i + 1}. ${formatTournamentPlayer(p, scoreMap, resolved, false, roundIdx)}</div>`;
          }).join('')}
        </div>
      `;
    }

    const resolvedA = resolveTournamentEntry(m.a, winners);
    const resolvedB = resolveTournamentEntry(m.b, winners);
    const winner = winners[m.id];

    return `
      <div class="tournament-match">
        <div class="match-id">${m.id}</div>
        <div class="match-player ${winner && resolvedA && winner.name === resolvedA.name ? 'match-winner' : ''}">${formatTournamentPlayer(m.a, scoreMap, resolvedA, winner && resolvedA && winner.name === resolvedA.name, roundIdx)}</div>
        <div class="match-vs">VS</div>
        <div class="match-player ${winner && resolvedB && winner.name === resolvedB.name ? 'match-winner' : ''}">${formatTournamentPlayer(m.b, scoreMap, resolvedB, winner && resolvedB && winner.name === resolvedB.name, roundIdx)}</div>
      </div>
    `;
  }

  bracketEl.innerHTML = `
    <div class="tournament-bracket">
      ${currentTournament.rounds.map((round, roundIdx) => `
        <div class="tournament-round">
          <h3>${round.title}</h3>
          ${round.matches.map(m => renderMatchCard(m, roundIdx)).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function formatTournamentPlayer(player, scoreMap, resolvedPlayer, isWinner, roundIdx) {
  if (!player) return '-';
  if (player.isBye) return '부전승';

  const resolved = resolvedPlayer && !resolvedPlayer.isBye ? resolvedPlayer : null;
  const target = resolved || (player.seed ? player : null);
  const score = target ? getRoundScore(scoreMap[target.name], roundIdx) : null;
  const scoreHtml = score
    ? `<span class="player-score">${score.label} ${score.adjusted >= 0 ? '+' : ''}${score.adjusted}</span>`
    : '';

  const displayPlayer = target || player;

  if (displayPlayer.seed) {
    return `<strong>[${displayPlayer.seed}]</strong> ${esc(displayPlayer.name)} <span class="player-base">기준 ${displayPlayer.baseScore || 0}</span> ${scoreHtml}${isWinner ? ' 🏅' : ''}`;
  }
  return `${esc(displayPlayer.name)} ${scoreHtml}${isWinner ? ' 🏅' : ''}`;
}

function buildTournamentScoreMapFromSession(session) {
  const map = {};
  if (!session || !session.scores || !session.numGames) return map;

  session.scores.forEach((s, idx) => {
    const base = s.baseScore || 0;
    const games = Array.from({ length: 4 }, (_, g) => {
      if (Array.isArray(s.games) && s.games[g] !== undefined) return s.games[g] || 0;
      const inputEl = document.getElementById(`p${idx}_g${g}`);
      return inputEl ? (parseInt(inputEl.value, 10) || 0) : 0;
    });
    map[s.name] = { base, games };
  });
  return map;
}

function getRoundScore(playerScore, roundIdx) {
  if (!playerScore) return null;
  const gi = Math.max(0, Math.min(roundIdx, 3));
  const game = playerScore.games[gi];
  if (game === undefined || game === null) return null;
  return {
    label: `${gi + 1}G`,
    raw: game,
    adjusted: game - (playerScore.base || 0)
  };
}

function resolveTournamentEntry(entry, winners) {
  if (!entry) return null;
  if (entry.isBye) return entry;
  if (entry.seed) return entry;

  if (entry.name && entry.name.startsWith('승자 ')) {
    const refId = entry.name.replace('승자 ', '');
    return winners[refId] || null;
  }
  return entry;
}

function pickTournamentWinner(a, b, scoreMap, roundIdx) {
  if (!a && !b) return null;
  if (a && a.isBye) return b || null;
  if (b && b.isBye) return a || null;
  if (!a) return b || null;
  if (!b) return a || null;

  const sa = getRoundScore(scoreMap[a.name], roundIdx);
  const sb = getRoundScore(scoreMap[b.name], roundIdx);
  if (!sa && !sb) return null;
  if (sa && !sb) return a;
  if (!sa && sb) return b;

  if (sa.adjusted !== sb.adjusted) return sa.adjusted > sb.adjusted ? a : b;
  if (sa.raw !== sb.raw) return sa.raw > sb.raw ? a : b;
  return a.name.localeCompare(b.name, 'ko') <= 0 ? a : b;
}

function evaluateTournament(tournament, session) {
  const winners = {};
  const scoreMap = buildTournamentScoreMapFromSession(session);
  if (!tournament || !tournament.rounds) return { winners, scoreMap };

  tournament.rounds.forEach((round, roundIdx) => {
    round.matches.forEach(m => {
      if (m.players && m.players.length === 3) return;

      const a = resolveTournamentEntry(m.a, winners);
      const b = resolveTournamentEntry(m.b, winners);
      winners[m.id] = pickTournamentWinner(a, b, scoreMap, roundIdx);
    });
  });

  return { winners, scoreMap };
}

function buildTeamRepresentativeTournament(teams) {
  return {
    mode: 'teamRep',
    teams: (teams || []).map(t => ({
      name: t.name,
      members: (t.members || []).map(m => ({ name: m.name, baseScore: m.baseScore || 0 }))
    }))
  };
}

function compareRepEntry(a, b) {
  const sa = a.score;
  const sb = b.score;
  if (!sa && !sb) return a.name.localeCompare(b.name, 'ko');
  if (sa && !sb) return -1;
  if (!sa && sb) return 1;
  if (sa.adjusted !== sb.adjusted) return sb.adjusted - sa.adjusted;
  if (sa.raw !== sb.raw) return sb.raw - sa.raw;
  return a.name.localeCompare(b.name, 'ko');
}

function evaluateTeamRepresentativeTournament(tournament, session) {
  const scoreMap = buildTournamentScoreMapFromSession(session);
  const teamResults = (tournament.teams || []).map(team => {
    const pool = (team.members || []).map(p => ({
      name: p.name,
      baseScore: p.baseScore || 0,
      score: getRoundScore(scoreMap[p.name], 0)
    })).sort(compareRepEntry);

    const top3 = pool.slice(0, 3).map(p => ({
      name: p.name,
      baseScore: p.baseScore,
      score: getRoundScore(scoreMap[p.name], 1)
    })).sort(compareRepEntry);

    const rep = top3.length > 0 ? {
      name: top3[0].name,
      baseScore: top3[0].baseScore,
      score: getRoundScore(scoreMap[top3[0].name], 2)
    } : null;

    return { teamName: team.name, pool, top3, rep };
  });

  const finals = teamResults
    .filter(t => !!t.rep)
    .map(t => ({ teamName: t.teamName, ...t.rep }))
    .sort(compareRepEntry);

  return { teamResults, finals };
}

function formatRepScore(score) {
  if (!score) return '<span class="player-score">미입력</span>';
  return `<span class="player-score">${score.label} ${score.adjusted >= 0 ? '+' : ''}${score.adjusted}</span>`;
}

function renderTeamRepresentativeTournament(summaryEl, bracketEl, tournament, session) {
  const evalData = evaluateTeamRepresentativeTournament(tournament, session);

  summaryEl.innerHTML = `
    <p style="font-size:0.8rem;color:var(--text-light);margin-bottom:6px;">팀대표선발 규칙: 1차전(1G) 팀별 상위 3명 → 2차전(2G) 팀별 상위 1명 → 3차전(3G) 대표전</p>
    <p style="font-size:0.82rem;color:var(--text-light);margin-bottom:8px;">승리 기준: 해당 라운드 게임의 <strong>실점수 - 기준에버</strong></p>
  `;

  bracketEl.innerHTML = `
    <div class="tournament-bracket">
      <div class="tournament-round">
        <h3>1차전 (팀별 3명 선발 · 1G)</h3>
        ${evalData.teamResults.map(tr => `
          <div class="tournament-match">
            <div class="match-id">${tr.teamName}</div>
            ${tr.pool.map((p, idx) => `
              <div class="match-player ${idx < 3 ? 'match-winner' : ''}">
                ${idx + 1}. ${esc(p.name)} <span class="player-base">기준 ${p.baseScore}</span> ${formatRepScore(p.score)}
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>

      <div class="tournament-round">
        <h3>2차전 (팀별 1명 선발 · 2G)</h3>
        ${evalData.teamResults.map(tr => `
          <div class="tournament-match">
            <div class="match-id">${tr.teamName}</div>
            ${tr.top3.length === 0 ? '<div class="match-player">미확정</div>' : tr.top3.map((p, idx) => `
              <div class="match-player ${idx === 0 ? 'match-winner' : ''}">
                ${idx + 1}. ${esc(p.name)} <span class="player-base">기준 ${p.baseScore}</span> ${formatRepScore(p.score)} ${idx === 0 ? '🏅' : ''}
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>

      <div class="tournament-round">
        <h3>3차전 (대표전 · 3G)</h3>
        <div class="tournament-match final-three">
          <div class="match-id">팀 대표 순위</div>
          ${evalData.finals.length === 0 ? '<div class="match-player">미확정</div>' : evalData.finals.map((p, idx) => `
            <div class="match-player ${idx === 0 ? 'match-winner' : ''}">
              ${idx + 1}. ${esc(p.teamName)} · ${esc(p.name)} <span class="player-base">기준 ${p.baseScore}</span> ${formatRepScore(p.score)} ${idx === 0 ? '🏆' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function shuffleArray(arr) {
  const clone = [...arr];
  for (let i = clone.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
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
      📅 ${sessionLabel(latest, sessions)} (${formatDate(latest.date)}) · ${latest.scores.length}명 · ${latest.numGames}게임
    </p>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>이름</th>
        ${gameHeaders(latest.numGames)}
        <th>총핀</th><th>단게임</th><th>에버</th><th>기본</th><th>오차</th>
      </tr></thead>
      <tbody>
        ${latest.scores.map(s => {
          const total = sumGames(s.games, latest.numGames);
          const avg = (total / latest.numGames).toFixed(1);
          const base = s.baseScore || 0;
          const diff = base > 0 ? (total - base * latest.numGames) : null;
          const diffAvg = base > 0 ? (parseFloat(avg) - base).toFixed(1) : null;
          const highGame = Math.max(...s.games.filter((g, i) => i < latest.numGames && g > 0), 0);
          return `<tr>
            <td><strong>${esc(s.name)}</strong></td>
            ${s.games.map((g, i) => i < latest.numGames ? `<td>${g || 0}</td>` : '').join('')}
            <td><strong>${total}</strong></td>
            <td><strong>${highGame}</strong></td>
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

  // 모임 유형 변경 시 자동 회차 갱신
  document.getElementById('session-games').addEventListener('change', () => {
    autoFillRound();
    updateTournamentOptionState();
  });

  document.getElementById('btn-sel-all').addEventListener('click', () => {
    document.querySelectorAll('#session-member-checks input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  document.getElementById('btn-desel-all').addEventListener('click', () => {
    document.querySelectorAll('#session-member-checks input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  document.getElementById('btn-make-teams').addEventListener('click', stepMakeTeams);
  document.getElementById('btn-shuffle').addEventListener('click', stepMakeTeams);
  document.getElementById('btn-back-to-setup').addEventListener('click', () => {
    show('session-step1'); hide('session-step2');
  });
  document.getElementById('btn-save-setup').addEventListener('click', saveTeamSetup);

  // 게스트 추가
  document.getElementById('btn-add-guest').addEventListener('click', addGuest);

  // 참가자 수 업데이트
  document.getElementById('session-member-checks').addEventListener('change', updateParticipantSummary);
  document.getElementById('session-tournament').addEventListener('change', () => {
    if (document.getElementById('session-tournament').checked) {
      document.getElementById('session-team-rep').checked = false;
    }
    updateParticipantSummary();
  });
  document.getElementById('session-team-rep').addEventListener('change', () => {
    if (document.getElementById('session-team-rep').checked) {
      document.getElementById('session-tournament').checked = false;
    }
    updateParticipantSummary();
  });

  updateTournamentOptionState();
  initScoringTab();
}

function updateTournamentOptionState() {
  const games = parseInt(document.getElementById('session-games').value, 10);
  const cbTournament = document.getElementById('session-tournament');
  const cbTeamRep = document.getElementById('session-team-rep');
  const helpTournament = document.getElementById('session-tournament-help');
  const helpTeamRep = document.getElementById('session-team-rep-help');
  const tournamentEnabled = games === 4;
  const teamRepEnabled = games === 3;

  cbTournament.disabled = !tournamentEnabled;
  cbTeamRep.disabled = !teamRepEnabled;

  if (!tournamentEnabled) cbTournament.checked = false;
  if (!teamRepEnabled) cbTeamRep.checked = false;

  if (cbTournament.checked) cbTeamRep.checked = false;
  if (cbTeamRep.checked) cbTournament.checked = false;

  if (helpTournament) {
    helpTournament.textContent = tournamentEnabled
      ? '4게임 벙개에서만 사용 가능 (참가자 20~24명)'
      : '토너먼트는 벙개(4게임)에서만 선택할 수 있습니다';
  }
  if (helpTeamRep) {
    helpTeamRep.textContent = teamRepEnabled
      ? '3게임 정모에서만 사용 가능 (팀별 3명 선발 → 1명 대표 → 대표전)'
      : '팀대표선발은 정모(3게임)에서만 선택할 수 있습니다';
  }
}

async function refreshSessionTab() {
  const members = await API.getMembers();
  const curQKey = getCurrentQuarterKey();
  const checks = document.getElementById('session-member-checks');
  checks.innerHTML = members.map(m => {
    const base = getMemberBaseForQuarter(m, curQKey);
    return `
    <label class="checkbox-item">
      <input type="checkbox" value="${esc(m.name)}" checked>
      <span>${esc(m.name)} <small>(${base})</small></span>
    </label>
  `}).join('');

  guestPlayers = [];
  renderGuestList();
  updateTournamentOptionState();
  updateParticipantSummary();
  await refreshSessionList();
}

function addGuest() {
  const nameEl = document.getElementById('guest-name');
  const baseEl = document.getElementById('guest-base');
  const name = nameEl.value.trim();
  if (!name) { toast('게스트 이름을 입력하세요', 'error'); return; }
  if (guestPlayers.find(g => g.name === name)) { toast('이미 추가된 게스트입니다', 'error'); return; }
  const base = parseInt(baseEl.value) || 0;
  guestPlayers.push({ name, baseScore: base, isGuest: true });
  nameEl.value = '';
  baseEl.value = '';
  renderGuestList();
  updateParticipantSummary();
  toast(`게스트 ${name} 추가`, 'success');
}

function removeGuest(name) {
  guestPlayers = guestPlayers.filter(g => g.name !== name);
  renderGuestList();
  updateParticipantSummary();
}
window.removeGuest = removeGuest;

function renderGuestList() {
  const el = document.getElementById('guest-list');
  if (guestPlayers.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = guestPlayers.map(g => `
    <span class="guest-tag">
      🏷️ ${esc(g.name)} (${g.baseScore})
      <button onclick="removeGuest('${esc(g.name)}')" style="border:none;background:none;cursor:pointer;color:var(--danger);font-weight:700;">✕</button>
    </span>
  `).join('');
}

function updateParticipantSummary() {
  const checked = document.querySelectorAll('#session-member-checks input:checked');
  const total = checked.length + guestPlayers.length;
  const el = document.getElementById('participant-summary');
  const teamSize = parseInt(document.getElementById('session-team-size').value);
  const numTeams = teamSize > 0 ? Math.ceil(total / teamSize) : 0;
  const tChecked = document.getElementById('session-tournament').checked;
  const repChecked = document.getElementById('session-team-rep').checked;
  const tText = tChecked ? ` · 토너먼트 ${total >= 20 && total <= 24 ? '가능' : '불가(20~24명)'}` : '';
  const repText = repChecked ? ` · 팀대표선발 ${numTeams >= 2 ? '가능' : '불가(최소 2팀)'}` : '';
  el.textContent = `참가자 ${total}명 (회원 ${checked.length} + 게스트 ${guestPlayers.length}) → ${numTeams}팀 예상${tText}${repText}`;
}

function initScoringTab() {
  document.getElementById('btn-scoring-back').addEventListener('click', () => {
    show('scoring-select-session');
    hide('scoring-input-form');
  });
  document.getElementById('btn-save-session').addEventListener('click', saveCurrentSession);
  refreshScoringSessionList();
}

async function refreshScoringSessionList() {
  const sessions = await API.getSessions();
  const el = document.getElementById('scoring-session-list');

  if (sessions.length === 0) {
    el.innerHTML = emptyState('📋', '저장된 모임이 없습니다');
    return;
  }

  el.innerHTML = sessions.map(s => `
    <div class="session-item" onclick="loadSessionForScoring(${s.round})">
      <div class="session-info">
        <div class="session-round">${sessionLabel(s, sessions)}</div>
        <div class="session-meta">${formatDate(s.date)} · ${s.scores.length}명 · ${getMeetingType(s)}</div>
      </div>
    </div>
  `).join('');
}

async function loadSessionForScoring(round) {
  const sessions = await API.getSessions();
  const session = sessions.find(s => s.round === round);
  if (!session) return;

  // 세션 복원
  currentTeams = session.teams.map(t => ({
    name: t.name,
    members: t.members,
    totalBase: t.totalBase
  }));

  currentSession = {
    round: session.round,
    date: session.date,
    numGames: session.numGames,
    scoreType: session.scoreType || 'average',
    teamSize: session.teamSize,
    tournamentEnabled: !!session.tournamentEnabled,
    tournament: session.tournament || null,
    teamRepEnabled: !!session.teamRepEnabled,
    teamRep: session.teamRep || null,
    teams: currentTeams,
    scores: session.scores.map(s => ({ name: s.name, baseScore: s.baseScore, team: s.team }))
  };
  currentTournament = session.tournament || session.teamRep || null;

  const scoreType = currentSession.scoreType;
  document.getElementById('scoring-title').textContent = `${sessionLabel(session, sessions)} 점수`;
  document.getElementById('scoring-sub').textContent = `${formatDate(session.date)} · ${getMeetingType(session)} · ${session.scores.length}명 · ${scoreType === 'average' ? '에버기준' : '총핀기준'}`;

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

  renderTournament();
  hide('scoring-select-session');
  show('scoring-input-form');
}
window.loadSessionForScoring = loadSessionForScoring;

function stepMakeTeams() {
  const teamSize = parseInt(document.getElementById('session-team-size').value);
  const numGames = parseInt(document.getElementById('session-games').value, 10);
  const tournamentEnabled = document.getElementById('session-tournament').checked && numGames === 4;
  const teamRepEnabled = document.getElementById('session-team-rep').checked && numGames === 3;
  const checked = document.querySelectorAll('#session-member-checks input:checked');
  const memberNames = Array.from(checked).map(cb => cb.value);
  const totalCount = memberNames.length + guestPlayers.length;

  if (totalCount < teamSize) {
    toast(`최소 ${teamSize}명 이상 필요 (현재 ${totalCount}명)`, 'error');
    return;
  }

  if (tournamentEnabled && (totalCount < 20 || totalCount > 24)) {
    toast(`토너먼트는 참가자 20~24명에서만 진행할 수 있습니다 (현재 ${totalCount}명)`, 'error');
    return;
  }

  API.getMembers().then(members => {
    const curQKey = getCurrentQuarterKey();
    const selected = memberNames.map(n => {
      const m = members.find(x => x.name === n);
      return { name: n, baseScore: m ? getMemberBaseForQuarter(m, curQKey) : 0 };
    });
    // 게스트 합치기
    const allPlayers = [...selected, ...guestPlayers.map(g => ({ name: g.name, baseScore: g.baseScore }))];
    currentTeams = balanceTeams(allPlayers, teamSize);

    if (teamRepEnabled && currentTeams.length < 2) {
      toast('팀대표선발은 최소 2팀이 필요합니다', 'error');
      return;
    }

    renderTeamPreview();
    show('session-step2');
  });
}

function renderTeamPreview() {
  const el = document.getElementById('team-result');
  el.innerHTML = `<div class="team-grid">${currentTeams.map((t, ti) => `
    <div class="team-card">
      <div class="team-header">
        <strong>${t.name}</strong>
        <span class="team-avg">에버합 ${t.totalBase}</span>
      </div>
      <ul class="team-members">
        ${t.members.map(m => `<li>
          <span>${esc(m.name)}</span>
          <span class="base-tag">${m.baseScore}</span>
          <select class="team-move-select" data-player="${esc(m.name)}" data-from="${ti}" onchange="movePlayer(this)">
            <option value="">이동</option>
            ${currentTeams.filter((_, i) => i !== ti).map((ot, oi) => {
              const realIdx = currentTeams.indexOf(ot);
              return `<option value="${realIdx}">${ot.name}</option>`;
            }).join('')}
          </select>
        </li>`).join('')}
      </ul>
    </div>
  `).join('')}</div>`;
}

function movePlayer(selectEl) {
  const playerName = selectEl.dataset.player;
  const fromIdx = parseInt(selectEl.dataset.from);
  const toIdx = parseInt(selectEl.value);
  if (isNaN(toIdx)) return;

  const fromTeam = currentTeams[fromIdx];
  const toTeam = currentTeams[toIdx];
  const playerIdx = fromTeam.members.findIndex(m => m.name === playerName);
  if (playerIdx < 0) return;

  const player = fromTeam.members.splice(playerIdx, 1)[0];
  toTeam.members.push(player);

  // 에버합 재계산
  fromTeam.totalBase = fromTeam.members.reduce((s, m) => s + (m.baseScore || 0), 0);
  toTeam.totalBase = toTeam.members.reduce((s, m) => s + (m.baseScore || 0), 0);

  // 빈 팀 제거
  currentTeams = currentTeams.filter(t => t.members.length > 0);

  renderTeamPreview();
  toast(`${playerName} → ${toTeam.name}`, 'success');
}
window.movePlayer = movePlayer;

async function saveTeamSetup() {
  if (currentTeams.length === 0) {
    toast('팀이 구성되지 않았습니다', 'error');
    return;
  }

  const round = parseInt(document.getElementById('session-round').value) || 0;
  const date = document.getElementById('session-date').value;
  const numGames = parseInt(document.getElementById('session-games').value);
  const scoreType = document.getElementById('session-score-type').value;
  const teamSize = parseInt(document.getElementById('session-team-size').value);
  const tournamentEnabled = document.getElementById('session-tournament').checked && numGames === 4;
  const teamRepEnabled = document.getElementById('session-team-rep').checked && numGames === 3;

  // 모든 팀원을 scores 배열로
  const allPlayers = [];
  currentTeams.forEach(team => {
    team.members.forEach(m => {
      allPlayers.push({ name: m.name, baseScore: m.baseScore, team: team.name, games: Array(numGames).fill(0) });
    });
  });

  const session = {
    round,
    date,
    numGames,
    scoreType,
    teamSize,
    tournamentEnabled,
    tournament: null,
    teamRepEnabled,
    teamRep: null,
    teams: currentTeams.map(t => ({ name: t.name, members: t.members.map(m => ({ name: m.name, baseScore: m.baseScore })), totalBase: t.totalBase })),
    scores: allPlayers
  };

  try {
    await API.saveSession(session);
    toast(`${getMeetingType(session)} ${round}회 팀 구성 저장 완료`, 'success');
    refreshSessionList();
    await refreshScoringSessionList();
  } catch (e) {
    toast(e.message, 'error');
  }
}
window.saveTeamSetup = saveTeamSetup;

function stepStartScoring() {
  const numGames = parseInt(document.getElementById('session-games').value);
  const scoreType = document.getElementById('session-score-type').value; // 'average' or 'totalpin'
  const tournamentEnabled = document.getElementById('session-tournament').checked && numGames === 4;
  const teamRepEnabled = document.getElementById('session-team-rep').checked && numGames === 3;
  const round = parseInt(document.getElementById('session-round').value) || 0;
  const date = document.getElementById('session-date').value;

  // 모든 참가자 (팀 순서대로)
  const allPlayers = [];
  currentTeams.forEach(team => {
    team.members.forEach(m => {
      allPlayers.push({ name: m.name, baseScore: m.baseScore, team: team.name });
    });
  });

  if (tournamentEnabled && (allPlayers.length < 20 || allPlayers.length > 24)) {
    toast(`토너먼트는 참가자 20~24명에서만 진행할 수 있습니다 (현재 ${allPlayers.length}명)`, 'error');
    return;
  }

  if (teamRepEnabled && currentTeams.length < 2) {
    toast('팀대표선발은 최소 2팀이 필요합니다', 'error');
    return;
  }

  const tournament = tournamentEnabled
    ? buildTournamentBracket(allPlayers.map(p => ({ name: p.name, baseScore: p.baseScore })))
    : null;
  const teamRep = teamRepEnabled
    ? buildTeamRepresentativeTournament(currentTeams)
    : null;

  currentSession = {
    round,
    date,
    numGames,
    scoreType,
    teamSize: currentTeams[0]?.members.length || 5,
    teams: currentTeams,
    scores: allPlayers,
    tournamentEnabled,
    tournament,
    teamRepEnabled,
    teamRep
  };
  currentTournament = tournament || teamRep;

  document.getElementById('scoring-title').textContent = `${getMeetingType({numGames})} ${round}회 점수`;
  document.getElementById('scoring-sub').textContent = `${formatDate(date)} · ${numGames === 3 ? '정모' : '벙개'} · ${allPlayers.length}명 · ${scoreType === 'average' ? '에버기준' : '총핀기준'}`;

  buildScoreTable(allPlayers, numGames);
  buildTeamScoreTables(numGames);
  renderTournament();

  hide('session-step1');
  hide('session-step2');
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
        `<td><div class="score-cell"><input type="number" id="${rid}_g${g}" min="0" max="300" data-p="${idx}" data-g="${g}" class="score-input" placeholder="0"><label class="allcover-label" title="올커버"><input type="checkbox" id="${rid}_a${g}" data-p="${idx}" data-g="${g}" class="allcover-checkbox"></label></div></td>`
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

  // 입력 이벤트 + 자동저장
  let autoSaveTimer = null;
  table.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('input', () => {
      recalcRow(parseInt(input.dataset.p), numGames);
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        saveCurrentSession(true);
      }, 1500);
    });
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

  // 토너먼트 결과 갱신
  if (currentTournament) renderTournament();
}

function buildTeamScoreTables(numGames) {
  const container = document.getElementById('team-score-tables');
  const scoreType = currentSession.scoreType || 'average';
  const isTotalPin = scoreType === 'totalpin';
  let html = '';

  currentTeams.forEach((team, ti) => {
    const teamPlayers = currentSession.scores.filter(p => p.team === team.name);
    html += `<div class="team-score-block">
      <h4>${team.name} ${isTotalPin ? '' : '(에버합: ' + team.totalBase + ')'}</h4>
      <div class="table-scroll">
      <table class="score-table" id="team-table-${ti}">
        <thead><tr>
          <th>이름</th>
          ${Array.from({length: numGames}, (_, i) => `<th>${i + 1}G</th>`).join('')}
          <th>${isTotalPin ? '총핀' : '합계'}</th>
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
  const scoreType = currentSession?.scoreType || 'average';
  const isTotalPin = scoreType === 'totalpin';

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
        const cellVal = isTotalPin ? val : (val - base);

        const el = document.getElementById(`td${ti}_p${pIdx}_d${g}`);
        if (el) {
          el.textContent = cellVal;
          if (!isTotalPin) el.className = cellVal >= 0 ? 'diff-positive' : 'diff-negative';
          else el.className = '';
        }
        gameSums[g] += cellVal;
      }

      let pdt = 0;
      for (let g = 0; g < numGames; g++) {
        const val = parseInt(document.getElementById(`${rid}_g${g}`)?.value) || 0;
        pdt += isTotalPin ? val : (val - base);
      }
      const elPdt = document.getElementById(`td${ti}_p${pIdx}_dt`);
      if (elPdt) {
        elPdt.innerHTML = `<strong>${pdt}</strong>`;
        if (!isTotalPin) elPdt.className = pdt >= 0 ? 'diff-positive' : 'diff-negative';
        else elPdt.className = '';
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
        gSums[g] += isTotalPin ? val : (val - base);
      }
    });

    for (let g = 0; g < numGames; g++) {
      teamTotal += gSums[g];
      const el = document.getElementById(`td${ti}_sum_g${g}`);
      if (el) {
        el.textContent = gSums[g];
        if (!isTotalPin) el.className = gSums[g] >= 0 ? 'diff-positive' : 'diff-negative';
        else el.className = '';
      }
    }

    const elTotal = document.getElementById(`td${ti}_sum_total`);
    if (elTotal) {
      elTotal.innerHTML = `<strong>${teamTotal}</strong>`;
      if (!isTotalPin) elTotal.className = teamTotal >= 0 ? 'diff-positive' : 'diff-negative';
      else elTotal.className = '';
    }
  });
}

async function saveCurrentSession(isAuto) {
  if (!currentSession) { if (!isAuto) toast('세션이 없습니다', 'error'); return; }

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
    scoreType: currentSession.scoreType || 'average',
    teamSize: currentSession.teamSize,
    tournamentEnabled: !!currentSession.tournamentEnabled,
    tournament: currentSession.tournament || null,
    teamRepEnabled: !!currentSession.teamRepEnabled,
    teamRep: currentSession.teamRep || null,
    teams: currentTeams.map(t => ({ name: t.name, members: t.members.map(m => ({ name: m.name, baseScore: m.baseScore })), totalBase: t.totalBase })),
    scores
  };

  try {
    await API.saveSession(session);
    if (!isAuto) {
      toast(`${getMeetingType(session)} ${session.round}회 저장 완료`, 'success');
    } else {
      toast('자동 저장됨', 'info');
    }
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
    <div class="session-item">
      <div class="session-info">
        <div class="session-round">${sessionLabel(s, sessions)}</div>
        <div class="session-meta">${formatDate(s.date)} · ${s.scores.length}명 · ${getMeetingType(s)}</div>
      </div>
      <button class="btn-icon delete" onclick="deleteSession(${s.round})">삭제</button>
    </div>
  `).join('');
  
  // 점수입력 탭의 세션 목록도 갱신
  await refreshScoringSessionList();
}

async function loadSession(round) {
  const sessions = await API.getSessions();
  const session = sessions.find(s => s.round === round);
  if (!session) return;

  // 세션 복원
  document.getElementById('session-round').value = session.round;
  document.getElementById('session-date').value = session.date;
  document.getElementById('session-games').value = session.numGames;
  document.getElementById('session-score-type').value = session.scoreType || 'average';
  document.getElementById('session-team-size').value = session.teamSize;
  document.getElementById('session-tournament').checked = !!session.tournamentEnabled;
  document.getElementById('session-team-rep').checked = !!session.teamRepEnabled;
  updateTournamentOptionState();
  if (session.numGames !== 4) document.getElementById('session-tournament').checked = false;
  if (session.numGames !== 3) document.getElementById('session-team-rep').checked = false;

  currentTeams = session.teams.map(t => ({
    name: t.name,
    members: t.members,
    totalBase: t.totalBase
  }));

  currentSession = {
    round: session.round,
    date: session.date,
    numGames: session.numGames,
    scoreType: session.scoreType || 'average',
    teamSize: session.teamSize,
    tournamentEnabled: !!session.tournamentEnabled,
    tournament: session.tournament || null,
    teamRepEnabled: !!session.teamRepEnabled,
    teamRep: session.teamRep || null,
    teams: currentTeams,
    scores: session.scores.map(s => ({ name: s.name, baseScore: s.baseScore, team: s.team }))
  };
  currentTournament = session.tournament || session.teamRep || null;

  const scoreType = currentSession.scoreType;
  document.getElementById('scoring-title').textContent = `${sessionLabel(session, sessions)} 점수`;
  document.getElementById('scoring-sub').textContent = `${formatDate(session.date)} · ${getMeetingType(session)} · ${session.scores.length}명 · ${scoreType === 'average' ? '에버기준' : '총핀기준'}`;

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
  renderTournament();
}
window.loadSession = loadSession;

async function deleteSession(round) {
  const sessions = await API.getSessions();
  const ses = sessions.find(s => s.round === round);
  const label = ses ? sessionLabel(ses, sessions) : round + '회';
  if (!confirm(`${label} 기록을 삭제하시겠습니까?`)) return;
  await API.deleteSession(round);
  toast('삭제되었습니다', 'success');
  refreshSessionList();
}
window.deleteSession = deleteSession;

// ========================
// 기록 조회
// ========================
function initFilters() {
  document.getElementById('btn-filter').addEventListener('click', refreshRecords);
  document.getElementById('btn-rank-filter').addEventListener('click', refreshRanking);
  document.getElementById('filter-type').addEventListener('change', function() {
    document.getElementById('filter-round').value = '';
    refreshRecords();
  });
}

async function refreshRecords() {
  const allSessions = await API.getSessions();
  const members = await API.getMembers();

  // 유형 필터
  const typeFilter = document.getElementById('filter-type').value;
  const sessions = typeFilter ? allSessions.filter(s => getMeetingType(s) === typeFilter) : allSessions;

  // 회차 필터 갱신
  const filterRound = document.getElementById('filter-round');
  const curRound = filterRound.value;
  filterRound.innerHTML = '<option value="">전체</option>' +
    sessions.map(s => '<option value="' + s.round + '">' + sessionLabel(s, allSessions) + ' (' + formatDate(s.date) + ')</option>').join('');
  if (curRound) filterRound.value = curRound;

  // 회원 필터 갱신
  const filterMember = document.getElementById('filter-member');
  const curMember = filterMember.value;
  filterMember.innerHTML = '<option value="">전체</option>' +
    members.map(m => '<option value="' + esc(m.name) + '">' + esc(m.name) + '</option>').join('');
  if (curMember) filterMember.value = curMember;

  const roundFilter = document.getElementById('filter-round').value;
  const mFilter = document.getElementById('filter-member').value;

  const detailEl = document.getElementById('records-session-detail');
  const tableCardEl = document.getElementById('records-table-card');
  const tableEl = document.getElementById('records-table');
  const statsCard = document.getElementById('personal-stats-card');

  // 특정 회차 선택 시: 해당 모임 상세 표시
  if (roundFilter) {
    const ses = sessions.find(s => String(s.round) === roundFilter);
    if (!ses) {
      detailEl.innerHTML = '';
      tableCardEl.style.display = 'none';
      statsCard.style.display = 'none';
      return;
    }

    const filteredScores = mFilter ? ses.scores.filter(s => s.name === mFilter) : ses.scores;
    detailEl.innerHTML = renderSessionDetail(ses, filteredScores, !mFilter, allSessions);
    tableCardEl.style.display = 'none';

    if (mFilter && filteredScores.length > 0) {
      renderPersonalStats(filteredScores, ses.numGames, mFilter);
    } else {
      statsCard.style.display = 'none';
    }
    return;
  }

  // 전체 회차
  detailEl.innerHTML = '';

  if (mFilter) {
    // 특정 회원의 전체 기록
    let records = [];
    sessions.forEach(ses => {
      ses.scores.forEach(s => {
        if (s.name !== mFilter) return;
        const total = sumGames(s.games, ses.numGames);
        const avg = (total / ses.numGames).toFixed(1);
        records.push({ round: ses.round, date: ses.date, name: s.name, games: s.games, numGames: ses.numGames, total, avg: parseFloat(avg), baseScore: s.baseScore, team: s.team, label: sessionLabel(ses, allSessions) });
      });
    });

    tableCardEl.style.display = 'block';
    if (records.length === 0) {
      tableEl.innerHTML = emptyState('📊', '기록이 없습니다');
      statsCard.style.display = 'none';
      return;
    }

    tableEl.innerHTML = renderMemberRecordsTable(records);
    renderPersonalStats(records.map(r => ({ games: r.games, baseScore: r.baseScore })), records[0].numGames, mFilter, records.length);
  } else {
    // 전체: 모임별 카드 목록
    tableCardEl.style.display = 'none';
    statsCard.style.display = 'none';

    if (sessions.length === 0) {
      detailEl.innerHTML = '<div class="card">' + emptyState('📊', '기록이 없습니다') + '</div>';
      return;
    }

    detailEl.innerHTML = sessions.map(ses => renderSessionCard(ses, allSessions)).join('');
  }
}

function renderSessionDetail(ses, scores, showTeam, allSessions) {
  // 정렬용 데이터 준비
  const rows = scores.map(s => {
    const total = sumGames(s.games, ses.numGames);
    const avg = parseFloat((total / ses.numGames).toFixed(1));
    const base = s.baseScore || 0;
    const diffAvg = base > 0 ? parseFloat((avg - base).toFixed(1)) : null;
    const highGame = Math.max(...s.games.filter((g, i) => i < ses.numGames && g > 0), 0);
    return { name: s.name, games: s.games, total, highGame, avg, base, diffAvg };
  });

  const tableId = 'session-detail-table';
  let html = '<div class="card">';
  html += '<h2>' + sessionLabel(ses, allSessions) + ' <span style="font-size:0.85rem;font-weight:400;color:var(--text-light)">' + formatDate(ses.date) + ' · ' + ses.scores.length + '명 · ' + ses.numGames + '게임</span></h2>';
  html += '<h3 style="font-size:0.9rem;color:var(--primary);margin:12px 0 8px;">개인전</h3>';
  html += '<div class="table-scroll"><table class="data-table sortable-table" id="' + tableId + '"><thead><tr>';
  html += '<th class="sortable" data-sort="name">이름</th>';
  for (let i = 0; i < ses.numGames; i++) html += '<th class="sortable" data-sort="g' + i + '">' + (i + 1) + 'G</th>';
  html += '<th class="sortable" data-sort="total">총핀</th>';
  html += '<th class="sortable" data-sort="highGame">단게임</th>';
  html += '<th class="sortable" data-sort="avg">에버</th>';
  html += '<th class="sortable" data-sort="base">기본</th>';
  html += '<th class="sortable" data-sort="diffAvg">오차</th>';
  html += '</tr></thead><tbody>';
  html += buildDetailRows(rows, ses.numGames);
  html += '</tbody></table></div>';
  if (showTeam) html += renderTeamSummaryReadonly(ses);
  html += '</div>';

  // 정렬 이벤트 등록 (setTimeout으로 DOM 렌더 후)
  setTimeout(() => attachSortHandlers(tableId, rows, ses.numGames, 'detail'), 0);
  return html;
}

function buildDetailRows(rows, numGames) {
  let html = '';
  rows.forEach(r => {
    html += '<tr>';
    html += '<td><strong>' + esc(r.name) + '</strong></td>';
    for (let i = 0; i < numGames; i++) html += '<td>' + (r.games[i] || 0) + '</td>';
    html += '<td><strong>' + r.total + '</strong></td>';
    html += '<td><strong>' + r.highGame + '</strong></td>';
    html += '<td><strong>' + r.avg + '</strong></td>';
    html += '<td>' + (r.base || '-') + '</td>';
    html += '<td>' + (r.diffAvg !== null ? diffSpan(r.diffAvg) : '-') + '</td>';
    html += '</tr>';
  });
  return html;
}

function renderSessionCard(ses, allSessions) {
  const topScorer = ses.scores.reduce((best, s) => {
    const total = sumGames(s.games, ses.numGames);
    return total > (best.total || 0) ? { name: s.name, total } : best;
  }, { total: 0 });

  let winTeam = '';
  if (ses.teams && ses.teams.length > 0) {
    let best = { name: '', total: -Infinity };
    ses.teams.forEach(t => {
      const teamPlayers = ses.scores.filter(s => s.team === t.name);
      let teamDiff = 0;
      teamPlayers.forEach(p => {
        for (let g = 0; g < ses.numGames; g++) teamDiff += (p.games[g] || 0) - (p.baseScore || 0);
      });
      if (teamDiff > best.total) best = { name: t.name, total: teamDiff };
    });
    winTeam = best.name;
  }

  let html = '<div class="card session-record-card" onclick="document.getElementById(\'filter-round\').value=\'' + ses.round + '\';refreshRecords();" style="cursor:pointer;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
  html += '<div><strong style="font-size:1.05rem;">' + sessionLabel(ses, allSessions) + '</strong>';
  html += '<div style="font-size:0.8rem;color:var(--text-light);margin-top:2px;">' + formatDate(ses.date) + ' · ' + ses.scores.length + '명 · ' + ses.numGames + '게임</div></div>';
  html += '<span style="font-size:1.2rem;">▸</span></div>';
  html += '<div style="display:flex;gap:12px;margin-top:8px;font-size:0.8rem;">';
  html += '<span>🏆 개인: <strong>' + esc(topScorer.name) + '</strong> (' + topScorer.total + ')</span>';
  if (winTeam) html += '<span>👥 팀: <strong>' + winTeam + '</strong></span>';
  html += '</div></div>';
  return html;
}

function renderMemberRecordsTable(records) {
  const tableId = 'member-records-table';
  const rows = records.map(r => {
    const diffAvg = r.baseScore > 0 ? parseFloat((r.avg - r.baseScore).toFixed(1)) : null;
    const highGame = Math.max(...r.games.filter((g, i) => i < r.numGames && g > 0), 0);
    return { round: r.round, label: r.label, name: r.name, games: r.games, numGames: r.numGames, total: r.total, highGame, avg: r.avg, base: r.baseScore, diffAvg };
  });

  let html = '<div class="table-scroll"><table class="data-table sortable-table" id="' + tableId + '">';
  html += '<thead><tr>';
  html += '<th class="sortable" data-sort="round">회차</th>';
  html += '<th class="sortable" data-sort="name">이름</th>';
  html += '<th class="sortable" data-sort="g0">1G</th>';
  html += '<th class="sortable" data-sort="g1">2G</th>';
  html += '<th class="sortable" data-sort="g2">3G</th>';
  html += '<th class="sortable" data-sort="g3">4G</th>';
  html += '<th class="sortable" data-sort="total">총핀</th>';
  html += '<th class="sortable" data-sort="highGame">단게임</th>';
  html += '<th class="sortable" data-sort="avg">에버</th>';
  html += '<th class="sortable" data-sort="base">기본</th>';
  html += '<th class="sortable" data-sort="diffAvg">오차</th>';
  html += '</tr></thead><tbody>';
  html += buildMemberRows(rows);
  html += '</tbody></table></div>';

  setTimeout(() => attachSortHandlers(tableId, rows, 4, 'member'), 0);
  return html;
}

function buildMemberRows(rows) {
  let html = '';
  rows.forEach(r => {
    html += '<tr>';
    html += '<td>' + (r.label || r.round + '회') + '</td>';
    html += '<td><strong>' + esc(r.name) + '</strong></td>';
    html += '<td>' + (r.games[0] || '-') + '</td>';
    html += '<td>' + (r.games[1] || '-') + '</td>';
    html += '<td>' + (r.games[2] || '-') + '</td>';
    html += '<td>' + (r.numGames >= 4 ? (r.games[3] || '-') : '-') + '</td>';
    html += '<td><strong>' + r.total + '</strong></td>';
    html += '<td><strong>' + r.highGame + '</strong></td>';
    html += '<td><strong>' + r.avg + '</strong></td>';
    html += '<td>' + (r.base || '-') + '</td>';
    html += '<td>' + (r.diffAvg !== null ? diffSpan(r.diffAvg) : '-') + '</td>';
    html += '</tr>';
  });
  return html;
}

function renderPersonalStats(records, numGames, memberName, sessionCount) {
  const statsCard = document.getElementById('personal-stats-card');
  statsCard.style.display = 'block';
  document.getElementById('personal-stats-title').textContent = memberName + ' 통계';

  const allGames = records.flatMap(r => (r.games || []).filter((g, i) => i < numGames && g > 0));
  const count = sessionCount || records.length;
  const totalAvg = allGames.length > 0 ? Math.round(allGames.reduce((a, b) => a + b, 0) / allGames.length) : 0;
  const highGame = allGames.length > 0 ? Math.max(...allGames) : 0;
  const lowGame = allGames.length > 0 ? Math.min(...allGames) : 0;

  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;">';
  html += '<div style="padding:10px;background:var(--bg);border-radius:8px;"><div style="font-size:0.75rem;color:var(--text-light)">참가</div><div style="font-size:1.3rem;font-weight:700;color:var(--primary)">' + count + '회</div></div>';
  html += '<div style="padding:10px;background:var(--bg);border-radius:8px;"><div style="font-size:0.75rem;color:var(--text-light)">에버</div><div style="font-size:1.3rem;font-weight:700;color:var(--accent)">' + totalAvg + '</div></div>';
  html += '<div style="padding:10px;background:var(--bg);border-radius:8px;"><div style="font-size:0.75rem;color:var(--text-light)">최고</div><div style="font-size:1.3rem;font-weight:700;color:var(--success)">' + highGame + '</div></div>';
  html += '<div style="padding:10px;background:var(--bg);border-radius:8px;"><div style="font-size:0.75rem;color:var(--text-light)">최저</div><div style="font-size:1.3rem;font-weight:700;color:var(--danger)">' + lowGame + '</div></div>';
  html += '</div>';
  document.getElementById('personal-stats').innerHTML = html;
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
          gameRecords.push({ member: s.name, score: g, round: ses.round, game: `${i + 1}G`, label: sessionLabel(ses, sessions) });
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
            <div class="rank-detail">${r.label} ${r.game}</div>
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
      // 현재 분기에 기준에버 저장
      if (base > 0) {
        const qKey = getCurrentQuarterKey();
        const members = await API.getMembers();
        const m = members.find(x => x.name === name);
        const baseScores = (m && m.baseScores) || {};
        baseScores[qKey] = base;
        await API.updateMember(name, { baseScores });
      }
      toast(`${name} 추가`, 'success');
      document.getElementById('new-member-name').value = '';
      document.getElementById('new-member-base').value = '';
      refreshMembers();
      refreshSessionTab();
    } catch (e) { toast(e.message, 'error'); }
  });

  // 분기별 기준에버 조회
  initBaseYearSelect();
  document.getElementById('btn-base-view').addEventListener('click', refreshBaseScoreList);
}

function initBaseYearSelect() {
  const sel = document.getElementById('base-year');
  const curYear = new Date().getFullYear();
  sel.innerHTML = '';
  for (let y = curYear; y >= curYear - 3; y--) {
    sel.innerHTML += `<option value="${y}">${y}년</option>`;
  }
  // 현재 분기 자동 선택
  const q = getCurrentQuarter();
  document.getElementById('base-quarter').value = q;
}

function getCurrentQuarter() {
  const m = new Date().getMonth(); // 0-11
  if (m < 3) return 'Q1';
  if (m < 6) return 'Q2';
  if (m < 9) return 'Q3';
  return 'Q4';
}

function getCurrentQuarterKey() {
  return `${new Date().getFullYear()}-${getCurrentQuarter()}`;
}

function getQuarterKey() {
  const y = document.getElementById('base-year').value;
  const q = document.getElementById('base-quarter').value;
  return `${y}-${q}`;
}

function getMemberBaseForQuarter(member, qKey) {
  if (!member.baseScores) return member.baseScore || 0;
  return member.baseScores[qKey] !== undefined ? member.baseScores[qKey] : (member.baseScore || 0);
}

async function refreshBaseScoreList() {
  const members = await API.getMembers();
  const qKey = getQuarterKey();
  const el = document.getElementById('base-score-list');
  const y = document.getElementById('base-year').value;
  const q = document.getElementById('base-quarter').value;
  const qLabel = {'Q1':'1분기','Q2':'2분기','Q3':'3분기','Q4':'4분기'}[q];

  el.innerHTML = `
    <p style="font-size:0.82rem;color:var(--text-light);margin-bottom:8px;">${y}년 ${qLabel} 기준에버</p>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>#</th><th>이름</th><th>기준에버</th></tr></thead>
      <tbody>
        ${members.map((m, i) => {
          const val = getMemberBaseForQuarter(m, qKey);
          return `<tr>
            <td>${i + 1}</td>
            <td><strong>${esc(m.name)}</strong></td>
            <td><input type="number" class="base-score-input" value="${val}" min="0" max="300" 
                data-member="${esc(m.name)}" data-qkey="${qKey}" onchange="updateQuarterBase(this)"></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
    <button class="btn btn-small" style="margin-top:8px;" onclick="copyBaseToCurrentQuarter()">\uD83D\uDCCB 현재 분기로 복사</button>
  `;
}

async function updateQuarterBase(input) {
  const name = input.dataset.member;
  const qKey = input.dataset.qkey;
  const val = parseInt(input.value) || 0;

  const members = await API.getMembers();
  const m = members.find(x => x.name === name);
  if (!m) return;

  const baseScores = m.baseScores || {};
  baseScores[qKey] = val;

  // 현재 분기면 baseScore도 업데이트
  const curQKey = getCurrentQuarterKey();
  const updates = { baseScores };
  if (qKey === curQKey) updates.baseScore = val;

  await API.updateMember(name, updates);
  toast(`${name} ${qKey}: ${val}`, 'success');
}
window.updateQuarterBase = updateQuarterBase;

async function copyBaseToCurrentQuarter() {
  const curQKey = getCurrentQuarterKey();
  const selQKey = getQuarterKey();
  if (selQKey === curQKey) { toast('이미 현재 분기입니다', 'error'); return; }
  if (!confirm(`${selQKey} 기준에버를 ${curQKey}로 복사하시겠습니까?`)) return;

  const members = await API.getMembers();
  for (const m of members) {
    const val = getMemberBaseForQuarter(m, selQKey);
    const baseScores = m.baseScores || {};
    baseScores[curQKey] = val;
    await API.updateMember(m.name, { baseScore: val, baseScores });
  }
  toast('복사 완료', 'success');
  refreshBaseScoreList();
  refreshMembers();
}
window.copyBaseToCurrentQuarter = copyBaseToCurrentQuarter;

async function refreshMembers() {
  const members = await API.getMembers();
  document.getElementById('member-count').textContent = members.length;
  const el = document.getElementById('member-list');
  const curQKey = getCurrentQuarterKey();
  if (members.length === 0) {
    el.innerHTML = emptyState('👥', '회원을 추가해주세요');
    return;
  }
  el.innerHTML = members.map(m => {
    const curBase = getMemberBaseForQuarter(m, curQKey);
    return `
    <div class="member-item">
      <div>
        <div class="member-name">${esc(m.name)}</div>
        <div class="member-sub">현재 기준에버: <strong>${curBase}</strong></div>
      </div>
      <button class="btn-icon delete" onclick="removeMember('${esc(m.name)}')">삭제</button>
    </div>
  `}).join('');

  // 분기별 리스트도 갱신
  refreshBaseScoreList();
}

async function updateBase(input) {
  const name = input.dataset.member;
  const base = parseInt(input.value) || 0;
  const curQKey = getCurrentQuarterKey();
  const members = await API.getMembers();
  const m = members.find(x => x.name === name);
  const baseScores = (m && m.baseScores) || {};
  baseScores[curQKey] = base;
  await API.updateMember(name, { baseScore: base, baseScores });
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

// 정렬 기능
let sortState = {}; // { tableId: { key, dir } }

function attachSortHandlers(tableId, rows, numGames, mode) {
  const table = document.getElementById(tableId);
  if (!table) return;
  table.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const prev = sortState[tableId];
      const dir = (prev && prev.key === key && prev.dir === 'asc') ? 'desc' : 'asc';
      sortState[tableId] = { key, dir };

      // 정렬 표시 업데이트
      table.querySelectorAll('th.sortable').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');

      // 정렬 실행
      const sorted = [...rows];
      sorted.sort((a, b) => {
        let va, vb;
        if (key === 'name') { va = a.name; vb = b.name; }
        else if (key.startsWith('g')) { const gi = parseInt(key.slice(1)); va = a.games[gi] || 0; vb = b.games[gi] || 0; }
        else if (key === 'round') { va = a.round || 0; vb = b.round || 0; }
        else { va = a[key] !== null && a[key] !== undefined ? a[key] : -Infinity; vb = b[key] !== null && b[key] !== undefined ? b[key] : -Infinity; }
        if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return dir === 'asc' ? va - vb : vb - va;
      });

      // tbody 갱신
      const tbody = table.querySelector('tbody');
      if (mode === 'detail') tbody.innerHTML = buildDetailRows(sorted, numGames);
      else if (mode === 'member') tbody.innerHTML = buildMemberRows(sorted);
    });
  });
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
  autoFillRound();
}

function getMeetingType(ses) {
  return ses.numGames === 3 ? '정모' : '벙개';
}

function getTypeRound(sessions, ses) {
  const type = getMeetingType(ses);
  const sametype = sessions.filter(s => getMeetingType(s) === type).sort((a, b) => a.round - b.round);
  const idx = sametype.findIndex(s => s.round === ses.round);
  return idx >= 0 ? idx + 1 : sametype.length + 1;
}

function sessionLabel(ses, sessions) {
  const type = getMeetingType(ses);
  const typeRound = sessions ? getTypeRound(sessions, ses) : ses.typeRound || ses.round;
  return type + ' ' + typeRound + '회';
}

async function autoFillRound() {
  const numGames = parseInt(document.getElementById('session-games').value);
  const sessions = await API.getSessions();
  const type = numGames === 3 ? '정모' : '벙개';
  const count = sessions.filter(s => getMeetingType(s) === type).length;
  document.getElementById('session-round').value = count + 1;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function show(id) { document.getElementById(id).style.display = ''; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
