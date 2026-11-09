'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nami', {
  platform: process.platform,
  api: {
    call: (method, payload) => ipcRenderer.invoke('nami:api', { method, payload }),
  },
  window: {
    minimize: () => ipcRenderer.send('nami:window', 'minimize'),
    maximize: () => ipcRenderer.send('nami:window', 'maximize'),
    close: () => ipcRenderer.send('nami:window', 'close'),
    setTheme: (theme) => ipcRenderer.send('nami:theme', theme),
    onMaximized: (callback) => {
      const listener = (_event, value) => callback(Boolean(value));
      ipcRenderer.on('nami:maximized', listener);
      return () => ipcRenderer.removeListener('nami:maximized', listener);
    },
  },
  runtime: {
    onProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('nami:runtime', listener);
      return () => ipcRenderer.removeListener('nami:runtime', listener);
    },
  },
  skipTimes: {
    onReady: (callback) => {
      const listener = (_event, message) => callback(message);
      ipcRenderer.on('nami:skip-times', listener);
      return () => ipcRenderer.removeListener('nami:skip-times', listener);
    },
  },
});
