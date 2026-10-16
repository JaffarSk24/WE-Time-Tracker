// Preload: safe bridge between the renderer and the main process.
// weStorage — file-based data storage (userData/we-tracker-data.json),
// weTimer   — syncs the active timer with the menubar (tray),
// weUpdates - GitHub release check, download and install,
// weGDrive  — Google Drive sync.
// Also weCalendar - suggestions from Google Calendar (uses the Drive sign-in).
//
// All four must stay exposed: dropping weStorage silently sends the app back
// to localStorage and stops it writing the data file at all.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weStorage', {
  // Synchronous read at startup: store.js initializes before the first render.
  load: () => ipcRenderer.sendSync('storage:load'),
  save: (json) => ipcRenderer.send('storage:save', json),
  // Keeps a copy of leftover localStorage data instead of deleting it.
  saveRecovery: (json) => ipcRenderer.send('storage:save-recovery', json)
});

contextBridge.exposeInMainWorld('weTimer', {
  sync: (state) => ipcRenderer.send('timer:sync', state),
  onStopRequest: (callback) => ipcRenderer.on('timer:stop-request', () => callback())
});

contextBridge.exposeInMainWorld('weUpdates', {
  check: () => ipcRenderer.invoke('updates:check'),
  download: () => ipcRenderer.invoke('updates:download'),
  install: () => ipcRenderer.invoke('updates:install'),
  onProgress: (callback) => ipcRenderer.on('updates:progress', (_e, p) => callback(p))
});

contextBridge.exposeInMainWorld('weGDrive', {
  getStatus: () => ipcRenderer.invoke('gdrive:status'),
  login: () => ipcRenderer.invoke('gdrive:login'),
  logout: () => ipcRenderer.invoke('gdrive:logout'),
  // { pullOnly: true } only takes data from the cloud, never uploads.
  sync: (opts) => ipcRenderer.invoke('gdrive:sync', opts || {}),
  onStatus: (callback) => ipcRenderer.on('gdrive:status', (_e, data) => callback(data)),
  onPulled: (callback) => ipcRenderer.on('gdrive:pulled', (_e, data) => callback(data))
});

contextBridge.exposeInMainWorld('weCalendar', {
  getStatus: () => ipcRenderer.invoke('calendar:status'),
  // Asks Google for the calendar permission on top of Drive.
  enable: () => ipcRenderer.invoke('calendar:enable'),
  events: (from, to) => ipcRenderer.invoke('calendar:events', from, to)
});
