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

  loadState() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Ensure all top-level keys exist
        return {
          clients: parsed.clients || [],
          projects: parsed.projects || [],
          timeLogs: parsed.timeLogs || [],
          settings: parsed.settings || { ...DEFAULT_SETTINGS },
          activeTimer: parsed.activeTimer || null
        };
      }
    } catch (e) {
      console.error('Failed to load state from localStorage', e);
    }
    const emptyState = {
      clients: [],
      projects: [],
      timeLogs: [],
      settings: { ...DEFAULT_SETTINGS },
      activeTimer: null
    };
    this.saveStateDirectly(emptyState);
    return emptyState;
  }

  saveState() {
    this.saveStateDirectly(this.state);
    this.notify();
  }

  saveStateDirectly(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state to localStorage', e);
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
    const newClient = { id, name: name.trim(), defaultRate: Number(defaultRate) || 0 };
    this.state.clients.push(newClient);
    this.saveState();
    return newClient;
  }

  updateClient(id, name, defaultRate) {
    const clientIndex = this.state.clients.findIndex(c => c.id === id);
    if (clientIndex !== -1) {
      this.state.clients[clientIndex] = {
        id,
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
      rateAtTime
    };
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

      this.state.timeLogs[index] = {
        ...existing,
        description: updatedLog.description !== undefined ? updatedLog.description.trim() : existing.description,
        clientId: updatedLog.clientId !== undefined ? updatedLog.clientId : existing.clientId,
        projectId: updatedLog.projectId !== undefined ? updatedLog.projectId : existing.projectId,
        startTime: updatedLog.startTime || existing.startTime,
        endTime: updatedLog.endTime || existing.endTime,
        billable: updatedLog.billable !== undefined ? updatedLog.billable : existing.billable,
        rateAtTime: rate
      };
      this.saveState();
      return true;
    }
    return false;
  }

  deleteTimeLog(id) {
    this.state.timeLogs = this.state.timeLogs.filter(l => l.id !== id);
    this.saveState();
  }

  // --- Active Timer API ---
  getActiveTimer() {
    return this.state.activeTimer;
  }

  startTimer(description, clientId, projectId, billable = true) {
    this.state.activeTimer = {
      description: description.trim(),
      clientId: clientId || null,
      projectId: projectId || null,
      startTime: new Date().toISOString(),
      billable
    };
    this.saveState();
    return this.state.activeTimer;
  }

  stopTimer() {
    const timer = this.state.activeTimer;
    if (!timer) return null;

    const endTime = new Date().toISOString();
    const rateAtTime = this.getRate(timer.clientId, timer.projectId);
    const newLog = this.addTimeLog({
      description: timer.description,
      clientId: timer.clientId,
      projectId: timer.projectId,
      startTime: timer.startTime,
      endTime: endTime,
      billable: timer.billable,
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
          clients: parsed.clients || [],
          projects: parsed.projects || [],
          timeLogs: parsed.timeLogs || [],
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
