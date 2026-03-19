const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appApi', {
  getSettings() {
    return ipcRenderer.invoke('settings:get');
  },
  saveSettings(payload) {
    return ipcRenderer.invoke('settings:save', payload);
  },
  startServices() {
    return ipcRenderer.invoke('services:start');
  },
  controlService(action, target) {
    return ipcRenderer.invoke('services:control', { action, target });
  },
  selectOnnxFile() {
    return ipcRenderer.invoke('dialog:select-onnx');
  },
  resetDatabase() {
    return ipcRenderer.invoke('database:reset');
  },
  openExternal(url) {
    return ipcRenderer.invoke('external:open', url);
  },
  onCliLog(listener) {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('cli-log', wrapped);
    return () => ipcRenderer.removeListener('cli-log', wrapped);
  },
  onCliState(listener) {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('cli-state-updated', wrapped);
    return () => ipcRenderer.removeListener('cli-state-updated', wrapped);
  },
  onWindowState(listener) {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('window:state-changed', wrapped);
    return () => ipcRenderer.removeListener('window:state-changed', wrapped);
  },
  windowControl: {
    getState() {
      return ipcRenderer.invoke('window:get-state');
    },
    minimize() {
      return ipcRenderer.invoke('window:minimize');
    },
    maximizeToggle() {
      return ipcRenderer.invoke('window:maximize-toggle');
    },
    close() {
      return ipcRenderer.invoke('window:close');
    }
  },
  platform: process.platform
});