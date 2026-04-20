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
    try {
      document.getElementById('lock-screen').style.display = 'none';
      document.getElementById('app-wrap').style.display = '';
      applyRole();
      initTabs();
      initSettings();
      initSession();
      initTournament();
      initMemberForm();
      initFilters();
      initStats();
      initDues();
      initSettlement();
      refreshAll();
    } catch (e) {
      console.error('enterApp error:', e);
      alert('초기화 오류: ' + e.message);
    }
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

  // 조회 모드: 점수입력/회원관리/모임생성 탭 숨기기, 설정 숨기기
  const sessionTab = document.querySelector('[data-tab="session"]');
  const scoringTab = document.querySelector('[data-tab="scoring"]');
  const membersTab = document.querySelector('[data-tab="members"]');
  const duesTab = document.querySelector('[data-tab="dues"]');
  const settleTab = document.querySelector('[data-tab="settlement"]');
  const settingsToggle = document.getElementById('settings-toggle');

  if (appRole === 'viewer') {
    if (sessionTab) sessionTab.style.display = 'none';
    if (scoringTab) scoringTab.style.display = 'none';
    if (membersTab) membersTab.style.display = 'none';
    if (duesTab) duesTab.style.display = 'none';
    if (settleTab) settleTab.style.display = 'none';
    if (settingsToggle) settingsToggle.style.display = 'none';
  } else {
    if (sessionTab) sessionTab.style.display = '';
    if (scoringTab) scoringTab.style.display = '';
    if (membersTab) membersTab.style.display = '';
    if (duesTab) duesTab.style.display = '';
    if (settleTab) settleTab.style.display = '';
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
    case 'stats': await refreshStats(); break;
    case 'ranking': await refreshRanking(); break;
    case 'dues': await refreshDues(); break;
    case 'settlement': await refreshSettleDropdown(); break;
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
  const scoringSummaryEl = document.getElementById('scoring-tournament-summary');
  const scoringBracketEl = document.getElementById('scoring-tournament-bracket');
  const scoringCard = document.getElementById('scoring-tournament-card');

  if (!currentTournament) {

    if (summaryEl) summaryEl.innerHTML = emptyState('🎯', '토너먼트 모드를 선택하고 점수를 입력하면 자동 반영됩니다');
    if (bracketEl) bracketEl.innerHTML = emptyState('🧩', '아직 생성된 대진표가 없습니다');
    if (scoringCard) scoringCard.style.display = 'none';
    return;
  }

  if (scoringCard) scoringCard.style.display = '';

  if (currentTournament.mode === 'teamRep') {
    if (summaryEl && bracketEl) renderTeamRepresentativeTournament(summaryEl, bracketEl, currentTournament, currentSession);
    if (scoringSummaryEl && scoringBracketEl) renderTeamRepresentativeTournament(scoringSummaryEl, scoringBracketEl, currentTournament, currentSession);
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
          <div class="tournament-round-matches">
          ${round.matches.map(m => renderMatchCard(m, roundIdx)).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // 점수 입력 탭에도 동일하게 표시
  if (scoringSummaryEl) scoringSummaryEl.innerHTML = summaryEl.innerHTML;
  if (scoringBracketEl) scoringBracketEl.innerHTML = bracketEl.innerHTML;
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
      if (Array.isArray(s.games) && g < s.games.length) {
        const v = s.games[g];
        return (v !== undefined && v !== null && v !== 0) ? v : null;
      }
      const inputEl = document.getElementById(`p${idx}_g${g}`);
      if (inputEl) {
        const v = parseInt(inputEl.value, 10);
        return (v && v > 0) ? v : null;
      }
      return null;
    });
    map[s.name] = { base, games };
  });
  return map;
}

function getRoundScore(playerScore, roundIdx) {
  if (!playerScore) return null;
  const gi = Math.max(0, Math.min(roundIdx, 3));
  const game = playerScore.games[gi];
  if (game === undefined || game === null || game === 0) return null;
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

    // 1차전: 1G 점수가 있는 사람이 있을 때만 상위 3명 선발
    const hasRound1Scores = pool.some(p => p.score !== null);
    const top3Candidates = hasRound1Scores ? pool.slice(0, 3) : [];
    const top3 = top3Candidates.map(p => ({
      name: p.name,
      baseScore: p.baseScore,
      score: getRoundScore(scoreMap[p.name], 1)
    })).sort(compareRepEntry);

    // 2차전: 2G 점수가 있는 사람이 있을 때만 대표 선발
    const hasRound2Scores = top3.some(p => p.score !== null);
    const rep = (hasRound2Scores && top3.length > 0) ? {
      name: top3[0].name,
      baseScore: top3[0].baseScore,
      score: getRoundScore(scoreMap[top3[0].name], 2)
    } : null;

    return { teamName: team.name, pool, top3, rep, hasRound1Scores, hasRound2Scores };
  });

  // 3차전: 3G 점수가 있는 대표가 있을 때만 순위 결정
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
        <div class="tournament-round-matches">
        ${evalData.teamResults.map(tr => `
          <div class="tournament-match">
            <div class="match-id">${tr.teamName}</div>
            ${tr.pool.map((p, idx) => `
              <div class="match-player ${tr.hasRound1Scores && idx < 3 ? 'match-winner' : ''}">
                ${idx + 1}. ${esc(p.name)} <span class="player-base">기준 ${p.baseScore}</span> ${formatRepScore(p.score)}
              </div>
            `).join('')}
          </div>
        `).join('')}
        </div>
      </div>

      <div class="tournament-round">
        <h3>2차전 (팀별 1명 선발 · 2G)</h3>
        <div class="tournament-round-matches">
        ${evalData.teamResults.map(tr => `
          <div class="tournament-match">
            <div class="match-id">${tr.teamName}</div>
            ${tr.top3.length === 0 ? '<div class="match-player">미확정</div>' : tr.top3.map((p, idx) => `
              <div class="match-player ${tr.hasRound2Scores && idx === 0 ? 'match-winner' : ''}">
                ${idx + 1}. ${esc(p.name)} <span class="player-base">기준 ${p.baseScore}</span> ${formatRepScore(p.score)} ${tr.hasRound2Scores && idx === 0 ? '🏅' : ''}
              </div>
            `).join('')}
          </div>
        `).join('')}
        </div>
      </div>

      <div class="tournament-round">
        <h3>3차전 (대표전 · 3G)</h3>
        <div class="tournament-round-matches">
        <div class="tournament-match final-three">
          <div class="match-id">팀 대표 순위</div>
          ${evalData.finals.length === 0 ? '<div class="match-player">미확정</div>' : evalData.finals.map((p, idx) => {
            const hasScore = p.score !== null;
            const isWinner = idx === 0 && hasScore;
            return `
            <div class="match-player ${isWinner ? 'match-winner' : ''}">
              ${idx + 1}. ${esc(p.teamName)} · ${esc(p.name)} <span class="player-base">기준 ${p.baseScore}</span> ${formatRepScore(p.score)} ${isWinner ? '🏆' : ''}
            </div>
          `}).join('')}
        </div>
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
  const todayCard = document.getElementById('today-session-card');
  const todayEl = document.getElementById('today-session');
  const todayTitle = document.getElementById('today-session-title');

  // 오늘 모임 표시
  const today = todayStr();
  const todaySession = sessions.find(s => s.date === today);
  if (todaySession) {
    todayCard.style.display = '';
    const scoreType = todaySession.scoreType || 'average';
    const isTotalPin = scoreType === 'totalpin';
    todayTitle.textContent = '오늘의 모임 - ' + sessionLabel(todaySession, sessions) + ' (' + (isTotalPin ? '총핀기준' : '에버기준') + ')';

    let html = '';

    // 토너먼트/팀대표선발 표시
    if (todaySession.tournamentEnabled || todaySession.teamRepEnabled) {
      let tournamentData = todaySession.tournament || todaySession.teamRep || null;
      if (!tournamentData && todaySession.teamRepEnabled && todaySession.numGames === 3 && todaySession.teams && todaySession.teams.length >= 2) {
        tournamentData = buildTeamRepresentativeTournament(todaySession.teams);
      }
      if (!tournamentData && todaySession.tournamentEnabled && todaySession.numGames === 4) {
        tournamentData = buildTournamentBracket(todaySession.scores.map(s => ({ name: s.name, baseScore: s.baseScore })));
      }
      if (tournamentData) {
        html += '<h3 style="font-size:0.9rem;color:var(--primary);margin:8px 0;">🎯 ' + (tournamentData.mode === 'teamRep' ? '팀대표선발' : '토너먼트') + '</h3>';
        html += '<div id="home-tournament-bracket"></div>';
      }
    }

    // 팀별 점수 테이블 (점수 입력창과 동일 형태)
    if (todaySession.teams && todaySession.teams.length > 0) {
      html += '<h3 style="font-size:0.9rem;color:var(--primary);margin:8px 0;">팀전 결과</h3>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
      const numGames = todaySession.numGames;

      // 팀 순위 계산 후 정렬
      const teamsWithTotal = todaySession.teams.map(t => {
        const teamPlayers = todaySession.scores.filter(s => s.team === t.name);
        let total = 0;
        teamPlayers.forEach(p => {
          for (let g = 0; g < numGames; g++) {
            total += isTotalPin ? (p.games[g] || 0) : ((p.games[g] || 0) - (p.baseScore || 0));
          }
        });
        return { team: t, total };
      });
      teamsWithTotal.sort((a, b) => b.total - a.total);

      teamsWithTotal.forEach(({ team: t }, rank) => {
        const teamPlayers = todaySession.scores.filter(s => s.team === t.name);
        const gameSums = Array(numGames).fill(0);
        let teamTotal = 0;

        const playerRows = teamPlayers.map(p => {
          const cells = [];
          let pTotal = 0;
          for (let g = 0; g < numGames; g++) {
            const val = p.games[g] || 0;
            const cellVal = isTotalPin ? val : (val - (p.baseScore || 0));
            cells.push(cellVal);
            gameSums[g] += cellVal;
            pTotal += cellVal;
          }
          teamTotal += pTotal;
          return { name: p.name, cells, pTotal };
        });

        const baseSum = isTotalPin ? '' : ' (에버합: ' + teamPlayers.reduce((s, p) => s + (p.baseScore || 0), 0) + ')';
        const medal = rank === 0 ? '🥇 ' : rank === 1 ? '🥈 ' : rank === 2 ? '🥉 ' : (rank + 1) + '위 ';
        html += '<div style="margin-bottom:10px;">';
        html += '<h4 style="font-size:0.85rem;margin:8px 0 4px;">' + medal + esc(t.name) + baseSum + '</h4>';
        html += '<div class="table-scroll"><table class="data-table"><thead><tr>';
        html += '<th>이름</th>';
        for (let g = 0; g < numGames; g++) html += '<th>' + (g + 1) + 'G</th>';
        html += '<th>' + (isTotalPin ? '총핀' : '합계') + '</th>';
        html += '</tr></thead><tbody>';

        playerRows.forEach(pr => {
          html += '<tr><td>' + esc(pr.name) + '</td>';
          pr.cells.forEach(c => {
            if (isTotalPin) {
              html += '<td>' + c + '</td>';
            } else {
              html += '<td class="' + (c >= 0 ? 'diff-positive' : 'diff-negative') + '">' + c + '</td>';
            }
          });
          if (isTotalPin) {
            html += '<td><strong>' + pr.pTotal + '</strong></td>';
          } else {
            html += '<td class="' + (pr.pTotal >= 0 ? 'diff-positive' : 'diff-negative') + '"><strong>' + pr.pTotal + '</strong></td>';
          }
          html += '</tr>';
        });

        // 팀 합계 행
        html += '<tr style="background:var(--bg);font-weight:700;"><td>팀 합계</td>';
        for (let g = 0; g < numGames; g++) {
          if (isTotalPin) {
            html += '<td>' + gameSums[g] + '</td>';
          } else {
            html += '<td class="' + (gameSums[g] >= 0 ? 'diff-positive' : 'diff-negative') + '">' + gameSums[g] + '</td>';
          }
        }
        teamTotal = gameSums.reduce((a, b) => a + b, 0);
        if (isTotalPin) {
          html += '<td><strong>' + teamTotal + '</strong></td>';
        } else {
          html += '<td class="' + (teamTotal >= 0 ? 'diff-positive' : 'diff-negative') + '"><strong>' + teamTotal + '</strong></td>';
        }
        html += '</tr></tbody></table></div></div>';
      });
      html += '</div>';
    }

    // 개인 순위 테이블
    html += '<h3 style="font-size:0.9rem;color:var(--primary);margin:12px 0 8px;">개인 순위</h3>';
    const ranked = todaySession.scores.map(s => {
      const total = sumGames(s.games, todaySession.numGames);
      const avg = parseFloat((total / todaySession.numGames).toFixed(1));
      const base = s.baseScore || 0;
      const diffAvg = base > 0 ? parseFloat((avg - base).toFixed(1)) : null;
      const diffTotal = base > 0 ? (total - base * todaySession.numGames) : null;
      const highGame = Math.max(...s.games.filter((g, i) => i < todaySession.numGames && g > 0), 0);
      return { name: s.name, team: s.team, games: s.games, total, highGame, avg, base, diffAvg, diffTotal };
    });

    // 점수 기준에 따라 정렬
    if (isTotalPin) {
      ranked.sort((a, b) => b.total - a.total);
    } else {
      ranked.sort((a, b) => {
        if (b.diffAvg !== null && a.diffAvg !== null) return b.diffAvg - a.diffAvg;
        return b.avg - a.avg;
      });
    }

    html += '<div class="table-scroll"><table class="data-table"><thead><tr>';
    html += '<th>순위</th><th>이름</th>';
    for (let i = 0; i < todaySession.numGames; i++) html += '<th>' + (i + 1) + 'G</th>';
    html += '<th>총핀</th><th>단게임</th><th>에버</th>';
    if (!isTotalPin) html += '<th>기본</th><th>오차</th>';
    html += '</tr></thead><tbody>';
    ranked.forEach((r, idx) => {
      html += '<tr>';
      html += '<td><strong>' + (idx + 1) + '</strong></td>';
      html += '<td><strong>' + esc(r.name) + '</strong></td>';
      for (let i = 0; i < todaySession.numGames; i++) html += '<td>' + (r.games[i] || 0) + '</td>';
      html += '<td><strong>' + r.total + '</strong></td>';
      html += '<td><strong>' + r.highGame + '</strong></td>';
      html += '<td><strong>' + r.avg + '</strong></td>';
      if (!isTotalPin) {
        html += '<td>' + (r.base || '-') + '</td>';
        html += '<td>' + (r.diffAvg !== null ? diffSpan(r.diffAvg) : '-') + '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    todayEl.innerHTML = html;

    // 토너먼트 브래킷을 DOM에 렌더링
    const homeBracketEl = document.getElementById('home-tournament-bracket');
    if (homeBracketEl) {
      let tournamentData = todaySession.tournament || todaySession.teamRep || null;
      if (!tournamentData && todaySession.teamRepEnabled && todaySession.numGames === 3 && todaySession.teams && todaySession.teams.length >= 2) {
        tournamentData = buildTeamRepresentativeTournament(todaySession.teams);
      }
      if (!tournamentData && todaySession.tournamentEnabled && todaySession.numGames === 4) {
        tournamentData = buildTournamentBracket(todaySession.scores.map(s => ({ name: s.name, baseScore: s.baseScore })));
      }
      if (tournamentData) {
        // 임시 세션 객체 (점수 포함)
        const tempSession = {
          ...todaySession,
          scores: todaySession.scores.map(s => ({ ...s }))
        };
        if (tournamentData.mode === 'teamRep') {
          const summaryDiv = document.createElement('div');
          homeBracketEl.appendChild(summaryDiv);
          const bracketDiv = document.createElement('div');
          homeBracketEl.appendChild(bracketDiv);
          renderTeamRepresentativeTournament(summaryDiv, bracketDiv, tournamentData, tempSession);
        } else {
          // 일반 토너먼트
          const oldTournament = currentTournament;
          const oldSession = currentSession;
          currentTournament = tournamentData;
          currentSession = tempSession;
          const summaryDiv = document.createElement('div');
          const bracketDiv = document.createElement('div');
          homeBracketEl.appendChild(summaryDiv);
          homeBracketEl.appendChild(bracketDiv);

          const tournamentEval = evaluateTournament(tournamentData, tempSession);
          const winners = tournamentEval.winners;
          const scoreMap = tournamentEval.scoreMap;

          summaryDiv.innerHTML = '<p style="font-size:0.8rem;color:var(--text-light);margin-bottom:6px;">승리 기준: <strong>실점수 - 기준에버</strong></p>';
          let bracketHtml = '<div class="tournament-bracket">';
          tournamentData.rounds.forEach((round, roundIdx) => {
            bracketHtml += '<div class="tournament-round"><h3>' + round.name + '</h3><div class="tournament-round-matches">';
            round.matches.forEach(m => {
              if (m.players && m.players.length === 3) {
                bracketHtml += '<div class="tournament-match final-three"><div class="match-id">' + m.id + '</div>';
                m.players.forEach((p, i) => {
                  const resolved = resolveTournamentEntry(p, winners);
                  bracketHtml += '<div class="match-player">' + (i + 1) + '. ' + formatTournamentPlayer(p, scoreMap, resolved, false, roundIdx) + '</div>';
                });
                bracketHtml += '</div>';
              } else {
                const resolvedA = resolveTournamentEntry(m.a, winners);
                const resolvedB = resolveTournamentEntry(m.b, winners);
                const winner = winners[m.id];
                bracketHtml += '<div class="tournament-match"><div class="match-id">' + m.id + '</div>';
                bracketHtml += '<div class="match-player ' + (winner && resolvedA && winner.name === resolvedA.name ? 'match-winner' : '') + '">' + formatTournamentPlayer(m.a, scoreMap, resolvedA, winner && resolvedA && winner.name === resolvedA.name, roundIdx) + '</div>';
                bracketHtml += '<div class="match-vs">VS</div>';
                bracketHtml += '<div class="match-player ' + (winner && resolvedB && winner.name === resolvedB.name ? 'match-winner' : '') + '">' + formatTournamentPlayer(m.b, scoreMap, resolvedB, winner && resolvedB && winner.name === resolvedB.name, roundIdx) + '</div>';
                bracketHtml += '</div>';
              }
            });
            bracketHtml += '</div></div>';
          });
          bracketHtml += '</div>';
          bracketDiv.innerHTML = bracketHtml;

          currentTournament = oldTournament;
          currentSession = oldSession;
        }
      }
    }
  } else {
    todayCard.style.display = 'none';
    todayEl.innerHTML = '';
  }

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

  // 기존 모임 불러오기
  refreshSessionLoadDropdown();
  document.getElementById('btn-load-session').addEventListener('click', loadSessionToStep1);

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

async function refreshSessionLoadDropdown() {
  const sessions = await API.getSessions();
  const sel = document.getElementById('session-load');
  sel.innerHTML = '<option value="">-- 새 모임 --</option>' +
    sessions.map(s => '<option value="' + s.round + '">' + sessionLabel(s, sessions) + ' (' + formatDate(s.date) + ')</option>').join('');
}

async function loadSessionToStep1() {
  const sel = document.getElementById('session-load');
  const round = parseInt(sel.value);
  if (!round) {
    // 새 모임 초기화
    document.getElementById('session-date').value = todayStr();
    autoSelectWeekType();
    document.getElementById('session-score-type').value = 'average';
    document.getElementById('session-team-size').value = '5';
    document.getElementById('session-tournament').checked = false;
    document.getElementById('session-team-rep').checked = false;
    guestPlayers = [];
    renderGuestList();
    document.querySelectorAll('#session-member-checks input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateTournamentOptionState();
    updateParticipantSummary();
    return;
  }

  const sessions = await API.getSessions();
  const session = sessions.find(s => s.round === round);
  if (!session) return;

  // STEP 1 폼에 값 채우기
  document.getElementById('session-round').value = session.round;
  document.getElementById('session-date').value = session.date;
  document.getElementById('session-games').value = session.numGames;
  document.getElementById('session-score-type').value = session.scoreType || 'average';
  document.getElementById('session-team-size').value = session.teamSize;
  document.getElementById('session-tournament').checked = !!session.tournamentEnabled;
  document.getElementById('session-team-rep').checked = !!session.teamRepEnabled;
  updateTournamentOptionState();

  // 회원 체크 복원
  const members = await API.getMembers();
  const memberNames = members.map(m => m.name);
  const sessionMembers = session.scores.map(s => s.name);
  document.querySelectorAll('#session-member-checks input[type="checkbox"]').forEach(cb => {
    cb.checked = sessionMembers.includes(cb.value);
  });

  // 게스트 복원
  guestPlayers = [];
  session.scores.forEach(s => {
    if (!memberNames.includes(s.name)) {
      guestPlayers.push({ name: s.name, baseScore: s.baseScore || 0 });
    }
  });
  renderGuestList();
  updateParticipantSummary();

  // 팀 구성 복원
  if (session.teams && session.teams.length > 0) {
    currentTeams = session.teams.map(t => ({
      name: t.name,
      members: t.members.map(m => ({ name: m.name, baseScore: m.baseScore || 0 })),
      totalBase: t.totalBase || t.members.reduce((s, m) => s + (m.baseScore || 0), 0)
    }));
    renderTeamPreview();
    show('session-step2');
  }

  toast(sessionLabel(session, sessions) + ' 불러옴', 'info');
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
    refreshScoringSessionList();
  });
  document.getElementById('btn-save-session').addEventListener('click', saveCurrentSession);
  refreshScoringSessionList(true);
}

async function refreshScoringSessionList(autoLoad) {
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

  // 자동으로 최신 모임 불러오기
  if (autoLoad && sessions.length > 0) {
    loadSessionForScoring(sessions[0].round);
  }
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

  // tournament/teamRep 데이터가 없으면 재생성
  let tournament = session.tournament || null;
  let teamRep = session.teamRep || null;
  if (!tournament && session.tournamentEnabled && session.numGames === 4) {
    const allPlayers = session.scores.map(s => ({ name: s.name, baseScore: s.baseScore }));
    tournament = buildTournamentBracket(allPlayers);
  }
  if (!teamRep && session.teamRepEnabled && session.numGames === 3 && currentTeams.length >= 2) {
    teamRep = buildTeamRepresentativeTournament(currentTeams);
  }

  currentSession = {
    round: session.round,
    date: session.date,
    numGames: session.numGames,
    scoreType: session.scoreType || 'average',
    teamSize: session.teamSize,
    tournamentEnabled: !!session.tournamentEnabled,
    tournament: tournament,
    teamRepEnabled: !!session.teamRepEnabled,
    teamRep: teamRep,
    teams: currentTeams,
    scores: session.scores.map(s => ({ name: s.name, baseScore: s.baseScore, team: s.team }))
  };
  currentTournament = tournament || teamRep || null;

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

  const tournament = tournamentEnabled
    ? buildTournamentBracket(allPlayers.map(p => ({ name: p.name, baseScore: p.baseScore })))
    : null;
  const teamRep = teamRepEnabled
    ? buildTeamRepresentativeTournament(currentTeams)
    : null;

  const session = {
    round,
    date,
    numGames,
    scoreType,
    teamSize,
    tournamentEnabled,
    tournament,
    teamRepEnabled,
    teamRep,
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
  refreshSessionLoadDropdown();
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

  // tournament/teamRep 데이터가 없으면 재생성
  if (!session.tournament && session.tournamentEnabled && session.numGames === 4) {
    session.tournament = buildTournamentBracket(session.scores.map(s => ({ name: s.name, baseScore: s.baseScore })));
  }
  if (!session.teamRep && session.teamRepEnabled && session.numGames === 3 && session.teams.length >= 2) {
    session.teamRep = buildTeamRepresentativeTournament(session.teams);
  }

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
// 통계 (캔들 차트)
// ========================
function initStats() {
  const sel = document.getElementById('stats-period');
  const startSel = document.getElementById('stats-start-session');
  const memberSel = document.getElementById('stats-member');
  if (sel) sel.addEventListener('change', refreshStats);
  if (startSel) startSel.addEventListener('change', refreshStats);
  if (memberSel) memberSel.addEventListener('change', refreshStats);
}

async function populateStatsFilters() {
  const sessions = await API.getSessions();
  const members = await API.getMembers();

  // 시작 모임 드롭다운
  const startSel = document.getElementById('stats-start-session');
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  startSel.innerHTML = '<option value="">최신부터</option>' +
    sorted.map(s => '<option value="' + s.round + '">' + sessionLabel(s, sessions) + ' (' + formatDate(s.date) + ')</option>').join('');

  // 대상 회원 드롭다운
  const memberSel = document.getElementById('stats-member');
  memberSel.innerHTML = '<option value="">전체 회원</option>' +
    members.map(m => '<option value="' + esc(m.name) + '">' + esc(m.name) + '</option>').join('');
}

async function refreshStats() {
  const sessions = await API.getSessions();
  if (sessions.length === 0) {
    drawCandleChart([]);
    return;
  }

  // 현재 선택값 저장
  const prevStart = document.getElementById('stats-start-session').value;
  const prevMember = document.getElementById('stats-member').value;

  await populateStatsFilters();

  // 선택값 복원
  const startSel = document.getElementById('stats-start-session');
  const memberSel = document.getElementById('stats-member');
  if (prevStart && startSel.querySelector('option[value="' + prevStart + '"]')) startSel.value = prevStart;
  if (prevMember && memberSel.querySelector('option[value="' + CSS.escape(prevMember) + '"]')) memberSel.value = prevMember;

  const period = document.getElementById('stats-period').value;
  const startRound = parseInt(startSel.value) || 0;
  const targetMember = memberSel.value;

  // 날짜순 정렬 (오래된 순)
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  // "최신부터": 최신 세션 기준으로 기간만큼 역산, 특정 세션 선택: 해당 세션부터 기간만큼 순산
  let startIdx = 0;
  let endIdx = sorted.length - 1;

  if (startRound) {
    // 특정 세션 선택: 해당 세션부터 앞으로
    const idx = sorted.findIndex(s => s.round === startRound);
    if (idx >= 0) startIdx = idx;

    const startDate = sorted[startIdx].date;
    if (period !== 'all') {
      const parts = startDate.split('-');
      const sy = parseInt(parts[0]), sm = parseInt(parts[1]) - 1, sd = parseInt(parts[2]);
      const toDateStr = (y, m, d) => {
        const dt = new Date(y, m, d);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      };
      let endStr = null;
      if (period === '1m') endStr = toDateStr(sy, sm + 1, sd);
      else if (period === '3m') endStr = toDateStr(sy, sm + 3, sd);
      else if (period === '6m') endStr = toDateStr(sy, sm + 6, sd);
      else if (period === '1y') endStr = toDateStr(sy + 1, sm, sd);
      if (endStr) {
        for (let i = sorted.length - 1; i >= startIdx; i--) {
          if (sorted[i].date <= endStr) { endIdx = i; break; }
        }
      }
    }
  } else {
    // 최신부터: 최신 세션 기준으로 뒤로
    if (period !== 'all') {
      const latestDate = sorted[sorted.length - 1].date;
      const parts = latestDate.split('-');
      const ly = parseInt(parts[0]), lm = parseInt(parts[1]) - 1, ld = parseInt(parts[2]);
      const toDateStr = (y, m, d) => {
        const dt = new Date(y, m, d);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      };
      let beginStr = null;
      if (period === '1m') beginStr = toDateStr(ly, lm - 1, ld);
      else if (period === '3m') beginStr = toDateStr(ly, lm - 3, ld);
      else if (period === '6m') beginStr = toDateStr(ly, lm - 6, ld);
      else if (period === '1y') beginStr = toDateStr(ly - 1, lm, ld);
      if (beginStr) {
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].date >= beginStr) { startIdx = i; break; }
        }
      }
    }
  }

  // 기간 필터 + 데이터 포인트 생성
  const points = [];
  sorted.forEach((s, i) => {
    if (i < startIdx || i > endIdx) return;
    if (!s.scores || s.scores.length === 0) return;

    const targetScores = targetMember
      ? s.scores.filter(p => p.name === targetMember)
      : s.scores;

    const allScores = [];
    targetScores.forEach(p => {
      if (!p.games) return;
      for (let g = 0; g < s.numGames; g++) {
        const v = p.games[g];
        if (v && v > 0) allScores.push(v);
      }
    });
    if (allScores.length === 0) return;

    const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const max = Math.max(...allScores);
    const min = Math.min(...allScores);

    points.push({
      date: s.date,
      label: sessionLabel(s, sessions),
      avg: Math.round(avg * 10) / 10,
      max,
      min
    });
  });

  // 범례 업데이트
  const legendEl = document.getElementById('stats-legend');
  if (legendEl) {
    legendEl.textContent = (targetMember || '전체 회원') + ' · ● 평균 점수  │ 세로선: 최고~최저';
  }

  drawCandleChart(points);
}

function drawCandleChart(points) {
  const canvas = document.getElementById('stats-canvas');
  const container = document.getElementById('stats-chart-container');
  if (!canvas || !container) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // 차트 치수
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 50;
  const chartWidth = container.clientWidth;
  const chartHeight = 320;

  canvas.width = chartWidth * dpr;
  canvas.height = chartHeight * dpr;
  canvas.style.width = chartWidth + 'px';
  canvas.style.height = chartHeight + 'px';
  ctx.scale(dpr, dpr);

  // 배경
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, chartWidth, chartHeight);

  if (points.length === 0) {
    ctx.fillStyle = '#999';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('해당 기간에 데이터가 없습니다', chartWidth / 2, chartHeight / 2);
    return;
  }

  // Y축 범위
  let yMin = Infinity, yMax = -Infinity;
  points.forEach(p => {
    if (p.min < yMin) yMin = p.min;
    if (p.max > yMax) yMax = p.max;
  });
  const yPad = Math.max(10, Math.round((yMax - yMin) * 0.1));
  yMin = Math.max(0, yMin - yPad);
  yMax = yMax + yPad;

  const drawAreaW = chartWidth - paddingLeft - paddingRight;
  const drawAreaH = chartHeight - paddingTop - paddingBottom;

  function toX(i) {
    if (points.length === 1) return paddingLeft + drawAreaW / 2;
    return paddingLeft + (i / (points.length - 1)) * drawAreaW;
  }
  function toY(val) {
    return paddingTop + drawAreaH - ((val - yMin) / (yMax - yMin)) * drawAreaH;
  }

  // 그리드 라인
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const val = yMin + (yMax - yMin) * (i / gridLines);
    const y = toY(val);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(chartWidth - paddingRight, y);
    ctx.stroke();

    ctx.fillStyle = '#999';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(val), paddingLeft - 8, y + 4);
  }

  // 세로선 (최고~최저)
  points.forEach((p, i) => {
    const x = toX(i);
    const yHigh = toY(p.max);
    const yLow = toY(p.min);

    // 세로선 (위크/캔들 body)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    // 상단/하단 가로 꺾임
    ctx.beginPath();
    ctx.moveTo(x - 4, yHigh);
    ctx.lineTo(x + 4, yHigh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, yLow);
    ctx.lineTo(x + 4, yLow);
    ctx.stroke();
  });

  // 평균 연결선
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = toX(i);
    const y = toY(p.avg);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 평균 점
  points.forEach((p, i) => {
    const x = toX(i);
    const y = toY(p.avg);

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 평균 값 표시
    ctx.fillStyle = '#333';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.avg, x, y - 10);
  });

  // X축 라벨
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  points.forEach((p, i) => {
    const x = toX(i);
    // 날짜 (M/D)
    const parts = p.date.split('-');
    const dateLabel = parseInt(parts[1]) + '/' + parseInt(parts[2]);
    ctx.fillText(dateLabel, x, chartHeight - paddingBottom + 14);
    // 회차
    ctx.fillStyle = '#999';
    ctx.font = '9px sans-serif';
    ctx.fillText(p.label, x, chartHeight - paddingBottom + 26);
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
  });

  // 최고/최저 값
  ctx.font = '9px sans-serif';
  points.forEach((p, i) => {
    const x = toX(i);
    ctx.fillStyle = '#3b82f6';
    ctx.textAlign = 'center';
    ctx.fillText(p.max, x, toY(p.max) - 4);
    ctx.fillText(p.min, x, toY(p.min) + 12);
  });
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
    const gender = document.getElementById('new-member-gender').value;
    const base = parseInt(document.getElementById('new-member-base').value) || 0;
    if (!name) return;
    try {
      await API.addMember(name, base, gender);
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
      document.getElementById('new-member-gender').value = 'M';
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
    const genderLabel = m.gender === 'F' ? '여' : '남';
    return `
    <div class="member-item">
      <div>
        <div class="member-name">${esc(m.name)} <small style="color:var(--text-light);font-weight:400;">(${genderLabel})</small></div>
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

  toggle.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btn-export').addEventListener('click', async () => {
    const data = await API.exportData();
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
    reader.onload = async (ev) => {
      try { await API.importData(ev.target.result); toast('가져오기 완료', 'success'); refreshAll(); }
      catch (e) { toast(e.message || '잘못된 파일', 'error'); }
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

function renderTeamSummaryReadonly(session, isTotalPin) {
  if (!session.teams || session.teams.length === 0) return '';
  if (isTotalPin === undefined) isTotalPin = (session.scoreType === 'totalpin');
  const numGames = session.numGames;

  // 팀 순위 계산
  const teamsWithTotal = session.teams.map(t => {
    const teamPlayers = session.scores.filter(s => s.team === t.name);
    let total = 0;
    teamPlayers.forEach(p => {
      for (let g = 0; g < numGames; g++) {
        total += isTotalPin ? (p.games[g] || 0) : ((p.games[g] || 0) - (p.baseScore || 0));
      }
    });
    return { team: t, total };
  });
  teamsWithTotal.sort((a, b) => b.total - a.total);

  let html = '<div style="margin-top:12px;">';
  html += '<h3 style="font-size:0.9rem;color:var(--primary);margin-bottom:8px;">팀전 결과</h3>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';

  teamsWithTotal.forEach(({ team: t }, rank) => {
    const teamPlayers = session.scores.filter(s => s.team === t.name);
    const gameSums = Array(numGames).fill(0);
    let teamTotal = 0;

    const playerRows = teamPlayers.map(p => {
      const cells = [];
      let pTotal = 0;
      for (let g = 0; g < numGames; g++) {
        const val = p.games[g] || 0;
        const cellVal = isTotalPin ? val : (val - (p.baseScore || 0));
        cells.push(cellVal);
        gameSums[g] += cellVal;
        pTotal += cellVal;
      }
      teamTotal += pTotal;
      return { name: p.name, cells, pTotal };
    });

    const baseSum = isTotalPin ? '' : ' (에버합: ' + teamPlayers.reduce((s, p) => s + (p.baseScore || 0), 0) + ')';
    const medal = rank === 0 ? '🥇 ' : rank === 1 ? '🥈 ' : rank === 2 ? '🥉 ' : (rank + 1) + '위 ';
    html += '<div style="margin-bottom:10px;">';
    html += '<h4 style="font-size:0.85rem;margin:8px 0 4px;">' + medal + esc(t.name) + baseSum + '</h4>';
    html += '<div class="table-scroll"><table class="data-table"><thead><tr>';
    html += '<th>이름</th>';
    for (let g = 0; g < numGames; g++) html += '<th>' + (g + 1) + 'G</th>';
    html += '<th>' + (isTotalPin ? '총핀' : '합계') + '</th>';
    html += '</tr></thead><tbody>';

    playerRows.forEach(pr => {
      html += '<tr><td>' + esc(pr.name) + '</td>';
      pr.cells.forEach(c => {
        html += isTotalPin ? '<td>' + c + '</td>' : '<td class="' + (c >= 0 ? 'diff-positive' : 'diff-negative') + '">' + c + '</td>';
      });
      html += isTotalPin
        ? '<td><strong>' + pr.pTotal + '</strong></td>'
        : '<td class="' + (pr.pTotal >= 0 ? 'diff-positive' : 'diff-negative') + '"><strong>' + pr.pTotal + '</strong></td>';
      html += '</tr>';
    });

    teamTotal = gameSums.reduce((a, b) => a + b, 0);
    html += '<tr style="background:var(--bg);font-weight:700;"><td>합계</td>';
    for (let g = 0; g < numGames; g++) {
      html += isTotalPin ? '<td>' + gameSums[g] + '</td>' : '<td class="' + (gameSums[g] >= 0 ? 'diff-positive' : 'diff-negative') + '">' + gameSums[g] + '</td>';
    }
    html += isTotalPin
      ? '<td><strong>' + teamTotal + '</strong></td>'
      : '<td class="' + (teamTotal >= 0 ? 'diff-positive' : 'diff-negative') + '"><strong>' + teamTotal + '</strong></td>';
    html += '</tr></tbody></table></div></div>';
  });

  html += '</div></div>';
  return html;
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
  const sessions = await API.getSessions();
  const maxRound = sessions.reduce((max, s) => Math.max(max, s.round || 0), 0);
  document.getElementById('session-round').value = maxRound + 1;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function show(id) { document.getElementById(id).style.display = ''; }
function hide(id) { document.getElementById(id).style.display = 'none'; }       

// ========================
// 회비 관리
// ========================
const MONTHLY_FEE = 30000; // 월회비 기본금액

function initDues() {
  // 년도 셀렉터
  const yearSel = document.getElementById('dues-year');
  const curYear = new Date().getFullYear();
  yearSel.innerHTML = '';
  for (let y = curYear; y >= curYear - 3; y--) {
    yearSel.innerHTML += `<option value="${y}">${y}년</option>`;
  }
  yearSel.addEventListener('change', () => refreshDues());

  // 저장 버튼
  document.getElementById('btn-dues-save').addEventListener('click', saveDuesData);
}

async function refreshDues() {
  const year = document.getElementById('dues-year').value;
  const members = await API.getMembers();
  const allDues = await API.getDues();
  const yearData = allDues[year] || {};

  const header = document.getElementById('dues-header');
  const body = document.getElementById('dues-body');
  const footer = document.getElementById('dues-footer');

  // 헤더: 이름 | 1월~12월 | 연납 | 합계
  header.innerHTML = '<th>이름</th>';
  for (let m = 1; m <= 12; m++) header.innerHTML += `<th>${m}월</th>`;
  header.innerHTML += '<th>연납</th><th>합계</th>';

  // 바디: 회원별 행
  body.innerHTML = '';
  members.forEach(member => {
    const md = yearData[member.name] || {};
    const isAnnual = md.annual || false;
    let tr = `<tr><td class="dues-name">${esc(member.name)}</td>`;
    for (let m = 1; m <= 12; m++) {
      const val = md[m] !== undefined ? md[m] : '';
      const disabled = isAnnual ? 'disabled' : '';
      tr += `<td><input type="number" class="dues-input" data-name="${esc(member.name)}" data-month="${m}" value="${val}" min="0" step="10000" ${disabled}></td>`;
    }
    tr += `<td style="text-align:center"><input type="checkbox" class="dues-annual" data-name="${esc(member.name)}" ${isAnnual ? 'checked' : ''}></td>`;
    // 합계
    let sum = 0;
    if (isAnnual) {
      sum = md.annualAmount || (MONTHLY_FEE * 12);
    } else {
      for (let m = 1; m <= 12; m++) sum += (md[m] || 0);
    }
    tr += `<td class="dues-sum" style="font-weight:bold;text-align:right">${sum > 0 ? sum.toLocaleString() : ''}</td>`;
    tr += '</tr>';
    body.innerHTML += tr;
  });

  // 연납 체크박스 이벤트
  body.querySelectorAll('.dues-annual').forEach(cb => {
    cb.addEventListener('change', function() {
      const name = this.dataset.name;
      const row = this.closest('tr');
      const inputs = row.querySelectorAll('.dues-input');
      if (this.checked) {
        inputs.forEach(inp => {
          inp.value = MONTHLY_FEE;
          inp.disabled = true;
        });
      } else {
        inputs.forEach(inp => inp.disabled = false);
      }
      updateDuesRowSum(row);
    });
  });

  // 입력 변경 시 합계 업데이트
  body.querySelectorAll('.dues-input').forEach(inp => {
    inp.addEventListener('input', function() {
      updateDuesRowSum(this.closest('tr'));
    });
  });

  // 푸터: 월별 합계
  footer.innerHTML = '<td style="font-weight:bold">합계</td>';
  for (let m = 1; m <= 12; m++) {
    let colSum = 0;
    members.forEach(member => {
      const md = yearData[member.name] || {};
      if (md.annual) colSum += MONTHLY_FEE;
      else colSum += (md[m] || 0);
    });
    footer.innerHTML += `<td style="text-align:right;font-weight:bold">${colSum > 0 ? colSum.toLocaleString() : ''}</td>`;
  }
  // 연납 칸 비우기 + 총합계
  let totalSum = 0;
  members.forEach(member => {
    const md = yearData[member.name] || {};
    if (md.annual) {
      totalSum += md.annualAmount || (MONTHLY_FEE * 12);
    } else {
      for (let m = 1; m <= 12; m++) totalSum += (md[m] || 0);
    }
  });
  footer.innerHTML += `<td></td><td style="font-weight:bold;text-align:right">${totalSum > 0 ? totalSum.toLocaleString() : ''}</td>`;
}

function updateDuesRowSum(row) {
  const inputs = row.querySelectorAll('.dues-input');
  const annualCb = row.querySelector('.dues-annual');
  const sumCell = row.querySelector('.dues-sum');
  let sum = 0;
  if (annualCb && annualCb.checked) {
    sum = MONTHLY_FEE * 12;
  } else {
    inputs.forEach(inp => { sum += (parseInt(inp.value) || 0); });
  }
  sumCell.textContent = sum > 0 ? sum.toLocaleString() : '';
}

async function saveDuesData() {
  const year = document.getElementById('dues-year').value;
  const allDues = await API.getDues();
  const yearData = {};

  document.querySelectorAll('#dues-body tr').forEach(row => {
    const name = row.querySelector('.dues-input').dataset.name;
    const annualCb = row.querySelector('.dues-annual');
    const isAnnual = annualCb.checked;
    const md = {};

    if (isAnnual) {
      md.annual = true;
      md.annualAmount = MONTHLY_FEE * 12;
      for (let m = 1; m <= 12; m++) md[m] = MONTHLY_FEE;
    } else {
      row.querySelectorAll('.dues-input').forEach(inp => {
        const v = parseInt(inp.value) || 0;
        if (v > 0) md[inp.dataset.month] = v;
      });
    }
    if (Object.keys(md).length > 0) yearData[name] = md;
  });

  allDues[year] = yearData;
  await API.saveDues(allDues);
  alert('회비 데이터가 저장되었습니다.');
  refreshDues();
}

// ========================
// 게임비 관리 → 정산 관리
// ========================

// 기본 지출 항목
const DEFAULT_EXPENSE_ITEMS = ['올파바 시상', '에버 상승상', '팁 전 지원'];

function initSettlement() {
  document.getElementById('btn-settle-load').addEventListener('click', loadSettlement);
  document.getElementById('btn-settle-save').addEventListener('click', saveSettlement);
  document.getElementById('btn-add-expense').addEventListener('click', addExpenseRow);
  document.getElementById('settle-prev-balance').addEventListener('input', recalcSettleBalance);
}

async function refreshSettleDropdown() {
  const sel = document.getElementById('settle-session');
  const sessions = await API.getSessions();
  sel.innerHTML = '<option value="">-- 모임 선택 --</option>';
  sessions.forEach(ses => {
    const label = sessionLabel(ses, sessions);
    const dateStr = ses.date || '';
    sel.innerHTML += `<option value="${ses.round}">${dateStr} ${label}</option>`;
  });
}

async function loadSettlement() {
  const round = parseInt(document.getElementById('settle-session').value);
  if (!round) { alert('모임을 선택하세요.'); return; }

  const sessions = await API.getSessions();
  const ses = sessions.find(s => s.round === round);
  if (!ses) return;

  const settlements = await API.getSettlements();
  const saved = settlements[round] || null;
  const numGames = ses.numGames || (ses.type === '벙개' ? 4 : 3);
  const gameFeeAmt = numGames === 3 ? 14000 : 18000;

  // 게임비 헤더 업데이트
  document.getElementById('th-gamefee').innerHTML = `게임비<br><small>${gameFeeAmt.toLocaleString()}</small>`;

  // 기본 금액 정의
  const AMOUNTS = {
    monthly: 15000,
    gamefee: gameFeeAmt,
    gwangbak: 2000,
    gutterfine: 2000,
    avgpen: 0,
    olcaba: 3000,
    avgup: 3000
  };

  // 참가자 테이블 구성
  const body = document.getElementById('settle-pbody');
  body.innerHTML = '';
  const participants = ses.scores || [];

  participants.forEach((p, i) => {
    const name = p.name;
    const sp = saved ? (saved.participants || []).find(x => x.name === name) : null;

    // 에버벌금 계산: 게임 평균 vs 기준에버
    let avgPenAmt = 0;
    const base = p.baseScore || 0;
    const validGames = (p.games || []).filter(g => g !== null && g !== undefined && g !== 0);
    if (base > 0 && validGames.length > 0) {
      const avg = validGames.reduce((s, v) => s + v, 0) / validGames.length;
      const diff = base - avg; // 양수면 에버보다 낮음
      if (diff >= 20) avgPenAmt = 3000;
      else if (diff > 0) avgPenAmt = 2000;
    }

    const ck = (field) => sp && sp[field] ? 'checked' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="settle-name">${esc(name)}</td>
      <td style="text-align:center"><input type="checkbox" class="sp-cb sp-monthly" data-name="${esc(name)}" data-amt="${AMOUNTS.monthly}" ${ck('monthly')}></td>
      <td style="text-align:center"><input type="checkbox" class="sp-cb sp-gamefee" data-name="${esc(name)}" data-amt="${AMOUNTS.gamefee}" ${ck('gamefee')}></td>
      <td style="text-align:center"><input type="checkbox" class="sp-cb sp-gwangbak" data-name="${esc(name)}" data-amt="${AMOUNTS.gwangbak}" ${ck('gwangbak')}></td>
      <td style="text-align:center"><input type="checkbox" class="sp-cb sp-gutterfine" data-name="${esc(name)}" data-amt="${AMOUNTS.gutterfine}" ${ck('gutterfine')}></td>
      <td style="text-align:center">${avgPenAmt > 0 ? `<span class="avgpen-label">${avgPenAmt.toLocaleString()}</span><input type="checkbox" class="sp-cb sp-avgpen" data-name="${esc(name)}" data-amt="${avgPenAmt}" ${ck('avgpen')}>` : '-'}</td>
      <td style="text-align:center"><input type="checkbox" class="sp-cb sp-olcaba" data-name="${esc(name)}" data-amt="${AMOUNTS.olcaba}" ${ck('olcaba')}></td>
      <td style="text-align:center"><input type="checkbox" class="sp-cb sp-avgup" data-name="${esc(name)}" data-amt="${AMOUNTS.avgup}" ${ck('avgup')}></td>
    `;
    body.appendChild(tr);
  });

  // 체크박스에 recalc 이벤트 바인딩
  body.querySelectorAll('.sp-cb').forEach(cb => {
    cb.addEventListener('change', recalcSettleIncome);
  });

  // 지출: 게임 비용 행
  const expBody = document.getElementById('settle-expense-body');
  expBody.innerHTML = '';
  if (saved && saved.gameExpenses && saved.gameExpenses.length) {
    saved.gameExpenses.forEach(ge => addGameExpenseRow(ge.count, ge.games, ge.rate));
  } else {
    addGameExpenseRow(participants.length, numGames, 3500);
  }

  // 지출: 기타 항목
  const oexpBody = document.getElementById('settle-oexp-body');
  oexpBody.innerHTML = '';
  if (saved && saved.otherExpenses && saved.otherExpenses.length) {
    saved.otherExpenses.forEach(oe => addOtherExpenseRow(oe.label, oe.amount));
  } else {
    DEFAULT_EXPENSE_ITEMS.forEach(label => addOtherExpenseRow(label, 0));
  }

  // 수입: 추가 항목
  document.getElementById('si-leftover').textContent = saved ? (saved.extraIncome?.leftover || 0).toLocaleString() : '0';

  // 이전 잔액
  document.getElementById('settle-prev-balance').value = saved ? (saved.previousBalance || 0) : 0;

  // 수입 내역에 편집 가능하게 (남은돈)
  makeEditable('si-leftover');

  recalcSettleIncome();
  recalcSettleExpense();
}

function makeEditable(id) {
  const el = document.getElementById(id);
  el.style.cursor = 'pointer';
  el.title = '클릭하여 편집';
  el.onclick = function() {
    const cur = parseInt(this.textContent.replace(/,/g, '')) || 0;
    const val = prompt('금액 입력:', cur);
    if (val !== null) {
      this.textContent = (parseInt(val) || 0).toLocaleString();
      recalcSettleIncome();
    }
  };
}

function addGameExpenseRow(count, games, rate) {
  const body = document.getElementById('settle-expense-body');
  const tr = document.createElement('tr');
  const total = count * games * rate;
  tr.innerHTML = `
    <td>
      <input type="number" class="settle-input-sm ge-count" value="${count}" min="0" style="width:35px">명 x
      <input type="number" class="settle-input-sm ge-games" value="${games}" min="0" style="width:35px">게임 =
      <span class="ge-total-games">${count * games}</span>게임
    </td>
    <td class="amt">
      <span class="ge-total-games2">${count * games}</span>x
      <input type="number" class="settle-input-sm ge-rate" value="${rate}" min="0" step="100" style="width:50px"> =
      <span class="ge-total">${total.toLocaleString()}</span>
      <button class="btn-tiny btn-del-gerow" title="삭제">✕</button>
    </td>
  `;
  body.appendChild(tr);

  // 이벤트
  tr.querySelectorAll('.settle-input-sm').forEach(inp => {
    inp.addEventListener('input', () => {
      const c = parseInt(tr.querySelector('.ge-count').value) || 0;
      const g = parseInt(tr.querySelector('.ge-games').value) || 0;
      const r = parseInt(tr.querySelector('.ge-rate').value) || 0;
      tr.querySelector('.ge-total-games').textContent = c * g;
      tr.querySelector('.ge-total-games2').textContent = c * g;
      tr.querySelector('.ge-total').textContent = (c * g * r).toLocaleString();
      recalcSettleExpense();
    });
  });
  tr.querySelector('.btn-del-gerow').addEventListener('click', () => {
    tr.remove();
    recalcSettleExpense();
  });

  // 행 추가 버튼 (첫 행에만)
  if (body.children.length === 1) {
    const addBtn = document.createElement('tr');
    addBtn.innerHTML = `<td colspan="2"><button class="btn btn-small" id="btn-add-gamerow">+ 게임비 행 추가</button></td>`;
    body.appendChild(addBtn);
    addBtn.querySelector('button').addEventListener('click', () => {
      addBtn.remove();
      addGameExpenseRow(0, games, rate);
    });
  }
}

function addOtherExpenseRow(label, amount) {
  const body = document.getElementById('settle-oexp-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="settle-input oe-label" value="${esc(label)}" placeholder="항목명"></td>
    <td class="amt">
      <input type="number" class="settle-input oe-amount" value="${amount || ''}" min="0" step="1000">
      <button class="btn-tiny btn-del-oerow" title="삭제">✕</button>
    </td>
  `;
  body.appendChild(tr);
  tr.querySelector('.oe-amount').addEventListener('input', recalcSettleExpense);
  tr.querySelector('.btn-del-oerow').addEventListener('click', () => {
    tr.remove();
    recalcSettleExpense();
  });
}

function addExpenseRow() {
  addOtherExpenseRow('', 0);
}

function cbAmt(cb) { return cb && cb.checked ? (parseInt(cb.dataset.amt) || 0) : 0; }

function recalcSettleIncome() {
  let totalMonthly = 0, totalGameFee = 0, totalGwangbak = 0, totalGutterFine = 0, totalAvgPen = 0;
  let totalOlcaba = 0, totalAvgUp = 0;

  document.querySelectorAll('#settle-pbody tr').forEach(tr => {
    totalMonthly += cbAmt(tr.querySelector('.sp-monthly'));
    totalGameFee += cbAmt(tr.querySelector('.sp-gamefee'));
    totalGwangbak += cbAmt(tr.querySelector('.sp-gwangbak'));
    totalGutterFine += cbAmt(tr.querySelector('.sp-gutterfine'));
    totalAvgPen += cbAmt(tr.querySelector('.sp-avgpen'));
    totalOlcaba += cbAmt(tr.querySelector('.sp-olcaba'));
    totalAvgUp += cbAmt(tr.querySelector('.sp-avgup'));
  });

  document.getElementById('si-monthly').textContent = totalMonthly.toLocaleString();
  document.getElementById('si-gamefee').textContent = totalGameFee.toLocaleString();
  document.getElementById('si-gwangbak').textContent = totalGwangbak.toLocaleString();
  document.getElementById('si-gutterfine').textContent = totalGutterFine.toLocaleString();
  document.getElementById('si-avgpen').textContent = totalAvgPen.toLocaleString();

  const leftover = parseInt(document.getElementById('si-leftover').textContent.replace(/,/g, '')) || 0;

  const total = totalMonthly + totalGameFee + totalGwangbak + totalGutterFine + totalAvgPen + leftover;
  document.getElementById('si-total').textContent = total.toLocaleString();

  // 올카바 + 에버상승은 지출 측에 반영
  recalcSettleExpense();
  recalcSettleBalance();
}

function recalcSettleExpense() {
  let gameTotal = 0;
  document.querySelectorAll('#settle-expense-body .ge-total').forEach(el => {
    gameTotal += parseInt(el.textContent.replace(/,/g, '')) || 0;
  });

  let otherTotal = 0;
  document.querySelectorAll('#settle-oexp-body .oe-amount').forEach(inp => {
    otherTotal += parseInt(inp.value) || 0;
  });

  // 올카바 + 에버상승 (참가자 테이블의 지출 열)
  let totalOlcaba = 0, totalAvgUp = 0;
  document.querySelectorAll('#settle-pbody tr').forEach(tr => {
    totalOlcaba += cbAmt(tr.querySelector('.sp-olcaba'));
    totalAvgUp += cbAmt(tr.querySelector('.sp-avgup'));
  });

  const total = gameTotal + otherTotal + totalOlcaba + totalAvgUp;
  document.getElementById('se-total').textContent = total.toLocaleString();

  recalcSettleBalance();
}

function recalcSettleBalance() {
  const income = parseInt(document.getElementById('si-total').textContent.replace(/,/g, '')) || 0;
  const expense = parseInt(document.getElementById('se-total').textContent.replace(/,/g, '')) || 0;
  const diff = income - expense;
  const prevBalance = parseInt(document.getElementById('settle-prev-balance').value) || 0;
  const finalBalance = prevBalance + diff;

  document.getElementById('sb-income').textContent = income.toLocaleString();
  document.getElementById('sb-expense').textContent = expense.toLocaleString();
  const diffEl = document.getElementById('sb-diff');
  diffEl.textContent = (diff < 0 ? '-' : '') + Math.abs(diff).toLocaleString();
  diffEl.style.color = diff < 0 ? '#d32f2f' : '';

  document.getElementById('sb-this').textContent = (diff < 0 ? '-' : '') + Math.abs(diff).toLocaleString();
  document.getElementById('sb-this').style.color = diff < 0 ? '#d32f2f' : '';

  const finalEl = document.getElementById('sb-final');
  finalEl.textContent = finalBalance.toLocaleString();
  finalEl.style.color = finalBalance < 0 ? '#d32f2f' : '#2e7d32';
}

async function saveSettlement() {
  const round = parseInt(document.getElementById('settle-session').value);
  if (!round) { alert('모임을 선택하세요.'); return; }

  const participants = [];
  document.querySelectorAll('#settle-pbody tr').forEach(tr => {
    const name = tr.querySelector('.sp-monthly').dataset.name;
    participants.push({
      name,
      monthly: tr.querySelector('.sp-monthly').checked,
      gamefee: tr.querySelector('.sp-gamefee').checked,
      gwangbak: tr.querySelector('.sp-gwangbak').checked,
      gutterfine: tr.querySelector('.sp-gutterfine').checked,
      avgpen: tr.querySelector('.sp-avgpen') ? tr.querySelector('.sp-avgpen').checked : false,
      olcaba: tr.querySelector('.sp-olcaba').checked,
      avgup: tr.querySelector('.sp-avgup').checked
    });
  });

  const gameExpenses = [];
  document.querySelectorAll('#settle-expense-body tr').forEach(tr => {
    const countEl = tr.querySelector('.ge-count');
    if (!countEl) return;
    gameExpenses.push({
      count: parseInt(countEl.value) || 0,
      games: parseInt(tr.querySelector('.ge-games').value) || 0,
      rate: parseInt(tr.querySelector('.ge-rate').value) || 0
    });
  });

  const otherExpenses = [];
  document.querySelectorAll('#settle-oexp-body tr').forEach(tr => {
    otherExpenses.push({
      label: tr.querySelector('.oe-label').value.trim(),
      amount: parseInt(tr.querySelector('.oe-amount').value) || 0
    });
  });

  const extraIncome = {
    leftover: parseInt(document.getElementById('si-leftover').textContent.replace(/,/g, '')) || 0
  };

  const settlement = {
    round,
    participants,
    gameExpenses,
    otherExpenses,
    extraIncome,
    previousBalance: parseInt(document.getElementById('settle-prev-balance').value) || 0,
    savedAt: new Date().toISOString()
  };

  const all = await API.getSettlements();
  all[round] = settlement;
  await API.saveSettlements(all);

  // 월회비 체크 → 회비 납부현황에 반영
  const sessions = await API.getSessions();
  const ses = sessions.find(s => s.round === round);
  if (ses && ses.date) {
    const [y, m] = ses.date.split('-');
    const year = y;
    const month = parseInt(m);
    const allDues = await API.getDues();
    if (!allDues[year]) allDues[year] = {};
    participants.forEach(p => {
      if (!allDues[year][p.name]) allDues[year][p.name] = {};
      if (p.monthly) {
        allDues[year][p.name][month] = MONTHLY_FEE;
      }
    });
    await API.saveDues(allDues);
  }

  alert('정산 데이터가 저장되었습니다.');
}
