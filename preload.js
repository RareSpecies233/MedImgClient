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
  windowControl: {
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