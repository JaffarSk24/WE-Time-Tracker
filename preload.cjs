// Preload: safe bridge between the renderer and the main process.
// weStorage — file-based data storage (userData/we-tracker-data.json),
// weTimer — syncs the active timer with the menubar (tray).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weStorage', {
  // Synchronous read at startup: store.js initializes before the first render.
  load: () => ipcRenderer.sendSync('storage:load'),
  save: (json) => ipcRenderer.send('storage:save', json)
});

contextBridge.exposeInMainWorld('weTimer', {
  sync: (state) => ipcRenderer.send('timer:sync', state),
  onStopRequest: (callback) => ipcRenderer.on('timer:stop-request', () => callback())
});

contextBridge.exposeInMainWorld('weUpdates', {
  check: () => ipcRenderer.invoke('updates:check'),
  download: (url) => ipcRenderer.invoke('updates:download', url),
  onProgress: (callback) => ipcRenderer.on('updates:progress', (_e, p) => callback(p))
});
