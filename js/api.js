/**
 * api.js - 데이터 저장/조회
 * 데모 모드: localStorage / 운영 모드: Google Apps Script (Google Sheets)
 */
const API = (() => {
  const KEYS = {
    members: 'bowling_members',
    sessions: 'bowling_sessions',
    settings: 'bowling_settings',
    dues: 'bowling_dues',
    settlements: 'bowling_settlements'
  };

  function getSettings() {
    const r = localStorage.getItem(KEYS.settings);
    return r ? JSON.parse(r) : { demoMode: true, apiUrl: '' };
  }
  function saveSettings(s) { localStorage.setItem(KEYS.settings, JSON.stringify(s)); }
  function isDemoMode() { return getSettings().demoMode; }
  function getApiUrl() { return getSettings().apiUrl; }

  // ===== GAS 서버 통신 =====
  async function gasGet(action) {
    const url = getApiUrl();
    if (!url) throw new Error('GAS URL이 설정되지 않았습니다. ⚙️ 설정에서 입력하세요.');
    const res = await fetch(url + '?action=' + encodeURIComponent(action));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function gasPost(body) {
    const url = getApiUrl();
    if (!url) throw new Error('GAS URL이 설정되지 않았습니다. ⚙️ 설정에서 입력하세요.');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ===== 로컬 스토리지 =====
  const local = {
    getMembers() {
      const r = localStorage.getItem(KEYS.members);
      return r ? JSON.parse(r) : [];
    },
    saveMembers(m) { localStorage.setItem(KEYS.members, JSON.stringify(m)); },
    addMember(name, baseScore, gender) {
      const members = this.getMembers();
      if (members.find(m => m.name === name)) throw new Error('이미 존재하는 회원입니다.');
      members.push({ name, baseScore: baseScore || 0, gender: gender || 'M', joinDate: new Date().toISOString().slice(0, 10) });
      members.sort((a, b) => (b.baseScore || 0) - (a.baseScore || 0) || a.name.localeCompare(b.name, 'ko'));
      this.saveMembers(members);
      return members;
    },
    removeMember(name) {
      let members = this.getMembers();
      members = members.filter(m => m.name !== name);
      this.saveMembers(members);
      return members;
    },
    updateMember(name, updates) {
      const members = this.getMembers();
      const m = members.find(x => x.name === name);
      if (m) Object.assign(m, updates);
      this.saveMembers(members);
      return members;
    },
    getSessions() {
      const r = localStorage.getItem(KEYS.sessions);
      return r ? JSON.parse(r) : [];
    },
    saveSessions(s) { localStorage.setItem(KEYS.sessions, JSON.stringify(s)); },
    saveSession(session) {
      const sessions = this.getSessions();
      const idx = sessions.findIndex(s => s.round === session.round);
      if (idx >= 0) sessions[idx] = session;
      else sessions.push(session);
      sessions.sort((a, b) => b.round - a.round);
      this.saveSessions(sessions);
      return sessions;
    },
    deleteSession(round) {
      let sessions = this.getSessions();
      sessions = sessions.filter(s => s.round !== round);
      this.saveSessions(sessions);
      return sessions;
    },
    getDues() {
      const r = localStorage.getItem(KEYS.dues);
      return r ? JSON.parse(r) : {};
    },
    saveDues(data) { localStorage.setItem(KEYS.dues, JSON.stringify(data)); },
    getSettlements() {
      const r = localStorage.getItem(KEYS.settlements);
      return r ? JSON.parse(r) : {};
    },
    saveSettlements(data) { localStorage.setItem(KEYS.settlements, JSON.stringify(data)); }
  };

  // ===== 공개 API (자동으로 모드에 따라 로컬/GAS 분기) =====
  return {
    getSettings,
    saveSettings,

    async getMembers() {
      if (isDemoMode()) return local.getMembers();
      const r = await gasGet('getMembers');
      return r.members || [];
    },
    async addMember(name, baseScore, gender) {
      if (isDemoMode()) return local.addMember(name, baseScore, gender);
      const r = await gasPost({ action: 'addMember', name, baseScore, gender });
      return r.members || [];
    },
    async removeMember(name) {
      if (isDemoMode()) return local.removeMember(name);
      const r = await gasPost({ action: 'removeMember', name });
      return r.members || [];
    },
    async updateMember(name, updates) {
      if (isDemoMode()) return local.updateMember(name, updates);
      const r = await gasPost({ action: 'updateMember', name, updates });
      return r.members || [];
    },
    async getSessions() {
      if (isDemoMode()) return local.getSessions();
      const r = await gasGet('getSessions');
      return r.sessions || [];
    },
    async saveSession(session) {
      if (isDemoMode()) return local.saveSession(session);
      const r = await gasPost({ action: 'saveSession', session });
      return r.sessions || [];
    },
    async deleteSession(round) {
      if (isDemoMode()) return local.deleteSession(round);
      const r = await gasPost({ action: 'deleteSession', round });
      return r.sessions || [];
    },

    exportData() {
      return JSON.stringify({
        members: local.getMembers(),
        sessions: local.getSessions(),
        dues: local.getDues(),
        settlements: local.getSettlements(),
        exportDate: new Date().toISOString()
      }, null, 2);
    },
    async importData(json) {
      const d = JSON.parse(json);
      if (d.members) local.saveMembers(d.members);
      if (d.sessions) local.saveSessions(d.sessions);
      if (d.dues) local.saveDues(d.dues);
      if (d.settlements) local.saveSettlements(d.settlements);
      // 운영 모드면 GAS 서버에도 동기화
      if (!isDemoMode()) {
        await gasPost({ action: 'importData', members: d.members || [], sessions: d.sessions || [], dues: d.dues, settlements: d.settlements });
      }
    },
    // GAS 서버로 전체 데이터 동기화 (로컬 → 서버)
    async syncToServer() {
      if (isDemoMode()) throw new Error('데모 모드에서는 동기화 불가');
      const members = local.getMembers();
      const sessions = local.getSessions();
      const dues = local.getDues();
      const settlements = local.getSettlements();
      await gasPost({ action: 'importData', members, sessions, dues, settlements });
    },

    // 회비 데이터
    async getDues() {
      if (isDemoMode()) return local.getDues();
      const r = await gasGet('getDues');
      return r.dues || {};
    },
    async saveDues(data) {
      local.saveDues(data);
      if (!isDemoMode()) {
        await gasPost({ action: 'saveDues', dues: data });
      }
    },

    // 정산 데이터
    async getSettlements() {
      if (isDemoMode()) return local.getSettlements();
      const r = await gasGet('getSettlements');
      return r.settlements || {};
    },
    async saveSettlements(data) {
      local.saveSettlements(data);
      if (!isDemoMode()) {
        await gasPost({ action: 'saveSettlements', settlements: data });
      }
    }
  };
})();
