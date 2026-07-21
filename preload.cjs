// Preload: безопасный мост между рендерером и файловым хранилищем main-процесса.
// Данные пользователя живут в JSON-файле внутри userData (переживает
// переустановку и обновления приложения), а не в localStorage.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weStorage', {
  // Синхронное чтение при старте: store.js инициализируется до первого рендера.
  load: () => ipcRenderer.sendSync('storage:load'),
  save: (json) => ipcRenderer.send('storage:save', json)
});
