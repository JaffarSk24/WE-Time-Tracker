// WE Time Tracker State Management Store

const STORAGE_KEY = 'we_time_tracker_data';

const DEFAULT_SETTINGS = {
  language: 'en', // 'ru' or 'en'
  currency: 'EUR',
  theme: 'dark' // 'dark' or 'light'
};

class Store {
  constructor() {
    this.state = this.loadState();
    this.listeners = [];
  }

  // In Electron, data lives in a JSON file (userData) via the weStorage preload bridge:
  // the file survives app reinstalls and version/port changes.
  // localStorage remains a fallback for browser mode and a one-time migration
  // source for data from older versions.
  hasFileStorage() {
    return typeof window !== 'undefined' && !!window.weStorage;
  }

  // Empty state (no clients, projects or logs) is not treated as data:
  // this check drives the self-healing migration below.
  isEmptyStateJson(json) {
    try {
      const p = JSON.parse(json);
      return !(p.clients?.length || p.projects?.length || p.timeLogs?.length);
    } catch (e) {
      return true;
    }
  }

  loadState() {
    let hadData = false;
    try {
      let data = null;
      if (this.hasFileStorage()) {
        data = window.weStorage.load();
        // Migration from older versions that stored data in localStorage.
        // Also runs on an empty file: if the first launch happened on a
        // "foreign" port (empty localStorage), the real data is picked up
        // on the next launch at the correct origin.
        if (!data || this.isEmptyStateJson(data)) {
          const legacy = localStorage.getItem(STORAGE_KEY);
          if (legacy && !this.isEmptyStateJson(legacy)) {
            data = legacy;
            window.weStorage.save(legacy);
            console.log('Migrated data from localStorage to file storage');
          }
        }
      } else {
        data = localStorage.getItem(STORAGE_KEY);
      }
      if (data) {
        hadData = true;
        const parsed = JSON.parse(data);
        // Ensure all top-level keys exist
        return {
          clients: (parsed.clients || []).map(c => this.normalizeClient(c)),
          projects: parsed.projects || [],
          timeLogs: (parsed.timeLogs || []).map(l => this.normalizeLog(l)),
          settings: parsed.settings || { ...DEFAULT_SETTINGS },
          activeTimer: parsed.activeTimer || null
        };
      }
    } catch (e) {
      console.error('Failed to load state', e);
    }
    const emptyState = {
      clients: [],
      projects: [],
      timeLogs: [],
      settings: { ...DEFAULT_SETTINGS },
      activeTimer: null
    };
    // Do not overwrite storage with empty state if data existed but failed to
    // parse — otherwise a read failure would destroy the database.
    if (!hadData) {
      this.saveStateDirectly(emptyState);
    }
    return emptyState;
  }

  // Payment-model migration: 'Mark as paid' used to set billable=false, which
  // dropped paid entries out of 'Total Earnings'. Now paid is a separate field;
  // legacy entries with billable=false are treated as paid
  // (that was the only meaning of billable=false in the old UI).
  normalizeLog(log) {
    if (log.paid === undefined) {
      return { ...log, billable: true, paid: log.billable === false };
    }
    return log;
  }

  // Ensure the client has a payments array (older data lacked it).
  normalizeClient(client) {
    if (!Array.isArray(client.payments)) {
      return { ...client, payments: [] };
    }
    return client;
  }

  saveState() {
    this.saveStateDirectly(this.state);
    this.notify();
  }

  saveStateDirectly(state) {
    try {
      const json = JSON.stringify(state);
      if (this.hasFileStorage()) {
        window.weStorage.save(json);
        // The file is the single source of truth: clear the legacy copy so the
        // migration doesn't 'resurrect' data after an explicit reset.
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* browser fallback unavailable — non-critical */ }
      } else {
        localStorage.setItem(STORAGE_KEY, json);
      }
    } catch (e) {
      console.error('Failed to save state', e);
    }
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  // --- Clients API ---
  getClients() {
    return this.state.clients;
  }

  addClient(name, defaultRate) {
    const id = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const newClient = { id, name: name.trim(), defaultRate: Number(defaultRate) || 0, payments: [] };
    this.state.clients.push(newClient);
    this.saveState();
    return newClient;
  }

  updateClient(id, name, defaultRate) {
    const clientIndex = this.state.clients.findIndex(c => c.id === id);
    if (clientIndex !== -1) {
      // Preserve the payments ledger — don't rebuild the object from scratch
      this.state.clients[clientIndex] = {
        ...this.state.clients[clientIndex],
        name: name.trim(),
        defaultRate: Number(defaultRate) || 0
      };
      this.saveState();
      return true;
    }
    return false;
  }

  deleteClient(id) {
    // Cascade delete projects and clear clientId in timelogs (or delete logs? let's keep logs but set client/project to null or just delete logs. Usually better to delete projects and logs or preserve logs. Let's delete project associations but keep logs with a note, or cascade delete. Let's cascade delete for clean state, or keep them with "Unknown Client/Project". Let's delete logs associated with this client to prevent inconsistencies)
    this.state.clients = this.state.clients.filter(c => c.id !== id);
    this.state.projects = this.state.projects.filter(p => p.clientId !== id);
    this.state.timeLogs = this.state.timeLogs.filter(l => l.clientId !== id);
    if (this.state.activeTimer && this.state.activeTimer.clientId === id) {
      this.state.activeTimer = null;
    }
    this.saveState();
  }

  // --- Projects API ---
  getProjects(clientId = null) {
    if (clientId) {
      return this.state.projects.filter(p => p.clientId === clientId);
    }
    return this.state.projects;
  }

  addProject(name, clientId, rate) {
    const id = 'project_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const newProject = {
      id,
      name: name.trim(),
      clientId,
      rate: rate === '' || rate === null ? 0 : Number(rate)
    };
    this.state.projects.push(newProject);
    this.saveState();
    return newProject;
  }

  updateProject(id, name, clientId, rate) {
    const projIndex = this.state.projects.findIndex(p => p.id === id);
    if (projIndex !== -1) {
      this.state.projects[projIndex] = {
        id,
        name: name.trim(),
        clientId,
        rate: rate === '' || rate === null ? 0 : Number(rate)
      };
      this.saveState();
      return true;
    }
    return false;
  }

  deleteProject(id) {
    this.state.projects = this.state.projects.filter(p => p.id !== id);
    this.state.timeLogs = this.state.timeLogs.filter(l => l.projectId !== id);
    if (this.state.activeTimer && this.state.activeTimer.projectId === id) {
      this.state.activeTimer.projectId = null;
    }
    this.saveState();
  }

  // --- Rates API ---
  getRate(clientId, projectId) {
    if (projectId) {
      const project = this.state.projects.find(p => p.id === projectId);
      if (project) {
        if (project.rate && project.rate > 0) {
          return project.rate;
        }
        // Inherit client rate
        const client = this.state.clients.find(c => c.id === project.clientId);
        return client ? client.defaultRate : 0;
      }
    }
    if (clientId) {
      const client = this.state.clients.find(c => c.id === clientId);
      return client ? client.defaultRate : 0;
    }
    return 0;
  }

  // --- Payments / Deposits API ---
  // Each client keeps a payment ledger. Balance = received − billed work.
  // balance < 0 → debt; balance > 0 → advance/deposit; ~0 → settled up.
  addPayment(clientId, amount, note = '', date = null) {
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client) return null;
    if (!Array.isArray(client.payments)) client.payments = [];
    const payment = {
      id: 'pay_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      amount: Number(amount) || 0,
      note: (note || '').trim(),
      date: date || new Date().toISOString()
    };
    client.payments.push(payment);
    this.saveState();
    return payment;
  }

  deletePayment(clientId, paymentId) {
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client || !Array.isArray(client.payments)) return;
    client.payments = client.payments.filter(p => p.id !== paymentId);
    this.saveState();
  }

  getPayments(clientId) {
    const client = this.state.clients.find(c => c.id === clientId);
    return client && Array.isArray(client.payments) ? client.payments : [];
  }

  // Billed to the client (billable), rounded up to 5-minute blocks.
  getBilledAmount(clientId) {
    const BLOCK = 5 * 60000;
    let billed = 0;
    this.state.timeLogs.forEach(log => {
      if (log.clientId === clientId && log.billable) {
        const durMs = (log.durationMs !== undefined && log.durationMs !== null)
          ? log.durationMs
          : (new Date(log.endTime) - new Date(log.startTime));
        const hrs = durMs > 0 ? (Math.ceil(durMs / BLOCK) * BLOCK) / 3600000 : 0;
        billed += hrs * (log.rateAtTime || 0);
      }
    });
    return billed;
  }

  // Client balance: {billed, paid, balance}. balance>0 advance, <0 debt.
  getClientBalance(clientId) {
    const billed = this.getBilledAmount(clientId);
    const paid = this.getPayments(clientId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return { billed, paid, balance: paid - billed };
  }

  // --- Time Logs API ---
  getTimeLogs() {
    // Sort descending by start time
    return [...this.state.timeLogs].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  }

  addTimeLog(log) {
    const id = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const rateAtTime = log.rateAtTime !== undefined ? log.rateAtTime : this.getRate(log.clientId, log.projectId);
    const newLog = {
      id,
      description: (log.description || '').trim(),
      clientId: log.clientId || null,
      projectId: log.projectId || null,
      startTime: log.startTime,
      endTime: log.endTime,
      billable: log.billable !== undefined ? log.billable : true,
      paid: log.paid !== undefined ? log.paid : false,
      rateAtTime
    };
    // Honest worked duration: if pauses make it shorter than the
    // startTime..endTime span, store it explicitly (see logDurationMs in utils).
    if (log.durationMs !== undefined && log.durationMs !== null) {
      const spanMs = new Date(log.endTime) - new Date(log.startTime);
      // Store only if it actually differs from the span (there was a pause)
      if (Math.abs(spanMs - log.durationMs) > 1000) {
        newLog.durationMs = log.durationMs;
      }
    }
    this.state.timeLogs.push(newLog);
    this.saveState();
    return newLog;
  }

  updateTimeLog(id, updatedLog) {
    const index = this.state.timeLogs.findIndex(l => l.id === id);
    if (index !== -1) {
      const existing = this.state.timeLogs[index];
      // If client/project changed, we might want to update rate, but we also allow manually editing rateAtTime if provided
      let rate = existing.rateAtTime;
      if (updatedLog.clientId !== existing.clientId || updatedLog.projectId !== existing.projectId) {
        rate = this.getRate(updatedLog.clientId, updatedLog.projectId);
      }
      if (updatedLog.rateAtTime !== undefined) {
        rate = Number(updatedLog.rateAtTime);
      }

      const merged = {
        ...existing,
        description: updatedLog.description !== undefined ? updatedLog.description.trim() : existing.description,
        clientId: updatedLog.clientId !== undefined ? updatedLog.clientId : existing.clientId,
        projectId: updatedLog.projectId !== undefined ? updatedLog.projectId : existing.projectId,
        startTime: updatedLog.startTime || existing.startTime,
        endTime: updatedLog.endTime || existing.endTime,
        billable: updatedLog.billable !== undefined ? updatedLog.billable : existing.billable,
        paid: updatedLog.paid !== undefined ? updatedLog.paid : existing.paid,
        rateAtTime: rate
      };
      // Manual time editing implies a continuous interval — clear the stored
      // durationMs (otherwise it would go stale).
      if (updatedLog.startTime || updatedLog.endTime) {
        delete merged.durationMs;
      }
      this.state.timeLogs[index] = merged;
      this.saveState();
      return true;
    }
    return false;
  }

  // Returns the removed logs — for undo via restoreTimeLogs().
  deleteTimeLog(id) {
    return this.deleteTimeLogs([id]);
  }

  deleteTimeLogs(ids) {
    const idSet = new Set(ids);
    const removed = this.state.timeLogs.filter(l => idSet.has(l.id));
    if (removed.length === 0) return [];
    this.state.timeLogs = this.state.timeLogs.filter(l => !idSet.has(l.id));
    this.saveState();
    return removed;
  }

  // Restore previously deleted logs (undo) with their original ids.
  restoreTimeLogs(logs) {
    if (!logs || logs.length === 0) return;
    const existingIds = new Set(this.state.timeLogs.map(l => l.id));
    logs.forEach(log => {
      if (!existingIds.has(log.id)) {
        this.state.timeLogs.push(log);
      }
    });
    this.saveState();
  }

  // Batch 'paid' toggle: a single state write instead of N.
  setLogsPaid(ids, paid = true) {
    const idSet = new Set(ids);
    let changed = false;
    this.state.timeLogs = this.state.timeLogs.map(l => {
      if (idSet.has(l.id) && l.paid !== paid) {
        changed = true;
        return { ...l, paid };
      }
      return l;
    });
    if (changed) this.saveState();
    return changed;
  }

  // --- Active Timer API ---
  getActiveTimer() {
    return this.state.activeTimer;
  }

  startTimer(description, clientId, projectId, billable = true) {
    const nowIso = new Date().toISOString();
    this.state.activeTimer = {
      description: description.trim(),
      clientId: clientId || null,
      projectId: projectId || null,
      startTime: nowIso,
      // Real start moment — preserved across pauses for honest timing
      originalStartTime: nowIso,
      billable,
      isPaused: false,
      accumulatedTime: 0
    };
    this.saveState();
    return this.state.activeTimer;
  }

  pauseTimer() {
    const timer = this.state.activeTimer;
    if (!timer || timer.isPaused) return;

    const duration = Date.now() - new Date(timer.startTime).getTime();
    timer.accumulatedTime = (timer.accumulatedTime || 0) + duration;
    timer.isPaused = true;
    timer.pausedAt = new Date().toISOString();
    timer.startTime = null;
    this.saveState();
  }

  resumeTimer() {
    const timer = this.state.activeTimer;
    if (!timer || !timer.isPaused) return;

    timer.isPaused = false;
    timer.startTime = new Date().toISOString();
    timer.pausedAt = null;
    this.saveState();
  }

  stopTimer() {
    const timer = this.state.activeTimer;
    if (!timer) return null;

    let totalDuration = timer.accumulatedTime || 0;
    if (!timer.isPaused && timer.startTime) {
      totalDuration += Date.now() - new Date(timer.startTime).getTime();
    }

    const endTime = new Date().toISOString();
    // The real start time is preserved (across pauses); durationMs carries the
    // actually worked time when it's shorter than the span due to pauses.
    const startTime = timer.originalStartTime
      || new Date(new Date(endTime).getTime() - totalDuration).toISOString();
    const rateAtTime = this.getRate(timer.clientId, timer.projectId);
    const newLog = this.addTimeLog({
      description: timer.description,
      clientId: timer.clientId,
      projectId: timer.projectId,
      startTime: startTime,
      endTime: endTime,
      billable: timer.billable,
      durationMs: totalDuration,
      rateAtTime
    });

    this.state.activeTimer = null;
    this.saveState();
    return newLog;
  }

  cancelTimer() {
    this.state.activeTimer = null;
    this.saveState();
  }

  // --- Settings & I18n ---
  getSettings() {
    return this.state.settings;
  }

  updateSettings(newSettings) {
    this.state.settings = {
      ...this.state.settings,
      ...newSettings
    };
    this.saveState();
  }

  // --- Export & Import ---
  exportData() {
    const dataStr = JSON.stringify(this.state, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `we_time_tracker_backup_${new Date().toISOString().slice(0,10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  importData(jsonData) {
    try {
      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      if (parsed && (parsed.clients || parsed.projects || parsed.timeLogs)) {
        this.state = {
          clients: (parsed.clients || []).map(c => this.normalizeClient(c)),
          projects: parsed.projects || [],
          timeLogs: (parsed.timeLogs || []).map(l => this.normalizeLog(l)),
          settings: parsed.settings || { ...DEFAULT_SETTINGS },
          activeTimer: parsed.activeTimer || null
        };
        this.saveState();
        return { success: true };
      }
    } catch (e) {
      console.error('Import failed', e);
      return { success: false, error: e.message };
    }
    return { success: false, error: 'Invalid data format' };
  }

  clearAllData() {
    this.state = {
      clients: [],
      projects: [],
      timeLogs: [],
      settings: { ...DEFAULT_SETTINGS },
      activeTimer: null
    };
    this.saveState();
  }
}

export const store = new Store();
