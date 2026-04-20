/**
 * api.js - 데이터 저장/조회 (Google Apps Script + localStorage 캐시)
 */
const API = (() => {
  const API_URL = 'https://script.google.com/macros/s/AKfycby4jmDt3-6CKldPqykdGvoyYq-M26LpORqCxi3hDVaKO4YIA6AFqwlhBFPqWcTKv10z/exec';

  const CACHE_KEYS = {
    members: 'cache_members',
    sessions: 'cache_sessions',
    dues: 'cache_dues',
    settlements: 'cache_settlements',
    tournaments: 'cache_tournaments'
  };

  function cacheGet(key) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
  }
  function cacheSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota exceeded */ }
  }

  // ===== GAS 서버 통신 =====
  async function gasGet(action) {
    const res = await fetch(API_URL + '?action=' + encodeURIComponent(action));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function gasPost(body) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // 캐시 우선 반환 + 백그라운드 갱신 헬퍼
  async function cachedGet(cacheKey, action, extract, fallback) {
    const cached = cacheGet(cacheKey);
    const fetchPromise = gasGet(action).then(r => {
      const fresh = extract(r);
      cacheSet(cacheKey, fresh);
      return fresh;
    });
    if (cached !== null) {
      fetchPromise.catch(() => {});
      return { data: cached, refresh: fetchPromise };
    }
    return { data: await fetchPromise, refresh: null };
  }

  // ===== 공개 API =====
  return {
    async getMembers() {
      const { data } = await cachedGet(CACHE_KEYS.members, 'getMembers', r => r.members || [], []);
      return data;
    },
    async addMember(name, baseScore, gender) {
      const r = await gasPost({ action: 'addMember', name, baseScore, gender });
      const members = r.members || [];
      cacheSet(CACHE_KEYS.members, members);
      return members;
    },
    async removeMember(name) {
      const r = await gasPost({ action: 'removeMember', name });
      const members = r.members || [];
      cacheSet(CACHE_KEYS.members, members);
      return members;
    },
    async updateMember(name, updates) {
      const r = await gasPost({ action: 'updateMember', name, updates });
      const members = r.members || [];
      cacheSet(CACHE_KEYS.members, members);
      return members;
    },
    async getSessions() {
      const { data } = await cachedGet(CACHE_KEYS.sessions, 'getSessions', r => r.sessions || [], []);
      return data;
    },
    async saveSession(session) {
      const r = await gasPost({ action: 'saveSession', session });
      const sessions = r.sessions || [];
      cacheSet(CACHE_KEYS.sessions, sessions);
      return sessions;
    },
    async deleteSession(round) {
      const r = await gasPost({ action: 'deleteSession', round });
      const sessions = r.sessions || [];
      cacheSet(CACHE_KEYS.sessions, sessions);
      return sessions;
    },

    async exportData() {
      const [members, sessions, dues, settlements] = await Promise.all([
        this.getMembers(), this.getSessions(), this.getDues(), this.getSettlements()
      ]);
      return JSON.stringify({ members, sessions, dues, settlements, exportDate: new Date().toISOString() }, null, 2);
    },
    async importData(json) {
      const d = JSON.parse(json);
      await gasPost({ action: 'importData', members: d.members || [], sessions: d.sessions || [], dues: d.dues, settlements: d.settlements });
      if (d.members) cacheSet(CACHE_KEYS.members, d.members);
      if (d.sessions) cacheSet(CACHE_KEYS.sessions, d.sessions);
      if (d.dues) cacheSet(CACHE_KEYS.dues, d.dues);
      if (d.settlements) cacheSet(CACHE_KEYS.settlements, d.settlements);
    },

    // 회비 데이터
    async getDues() {
      const { data } = await cachedGet(CACHE_KEYS.dues, 'getDues', r => r.dues || {}, {});
      return data;
    },
    async saveDues(data) {
      await gasPost({ action: 'saveDues', dues: data });
      cacheSet(CACHE_KEYS.dues, data);
    },

    // 정산 데이터
    async getSettlements() {
      const { data } = await cachedGet(CACHE_KEYS.settlements, 'getSettlements', r => r.settlements || {}, {});
      return data;
    },
    async saveSettlements(data) {
      await gasPost({ action: 'saveSettlements', settlements: data });
      cacheSet(CACHE_KEYS.settlements, data);
    },

    // 토너먼트 데이터
    async getTournaments() {
      const { data } = await cachedGet(CACHE_KEYS.tournaments, 'getTournaments', r => r.tournaments || [], []);
      return data;
    },
    async saveTournament(tournament) {
      const r = await gasPost({ action: 'saveTournament', tournament });
      const tournaments = r.tournaments || [];
      cacheSet(CACHE_KEYS.tournaments, tournaments);
      return tournaments;
    },
    async deleteTournament(id) {
      const r = await gasPost({ action: 'deleteTournament', id });
      const tournaments = r.tournaments || [];
      cacheSet(CACHE_KEYS.tournaments, tournaments);
      return tournaments;
    }
  };
})();
