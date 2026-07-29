const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weGDrive', {
  login: () => ipcRenderer.invoke('gdrive:login'),
  logout: () => ipcRenderer.invoke('gdrive:logout'),
  getStatus: () => ipcRenderer.invoke('gdrive:status'),
  push: () => ipcRenderer.invoke('gdrive:push'),
  pull: () => ipcRenderer.invoke('gdrive:pull'),
  onStatusChanged: (callback) => {
    ipcRenderer.on('gdrive-status-changed', (event, data) => callback(data));
  },
  onDataPulled: (callback) => {
    ipcRenderer.on('gdrive-data-pulled', (event, data) => callback(data));
  }
});
