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
});
