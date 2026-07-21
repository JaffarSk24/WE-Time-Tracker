// Preload: безопасный мост между рендерером и main-процессом.
// weStorage — файловое хранилище данных (userData/we-tracker-data.json),
// weTimer — синхронизация активного таймера с menubar (tray).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weStorage', {
  // Синхронное чтение при старте: store.js инициализируется до первого рендера.
  load: () => ipcRenderer.sendSync('storage:load'),
  save: (json) => ipcRenderer.send('storage:save', json)
});

contextBridge.exposeInMainWorld('weTimer', {
  sync: (state) => ipcRenderer.send('timer:sync', state),
  onStopRequest: (callback) => ipcRenderer.on('timer:stop-request', () => callback())
});
