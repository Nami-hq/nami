'use strict';

const { app, BrowserWindow, ipcMain, Menu, nativeTheme, protocol, session, shell } = require('electron');
const path = require('node:path');

const api = require('./electron/api');
const appProtocol = require('./electron/protocol');
const store = require('./server/store');

const WINDOW_BG = { light: '#edf1fb', dark: '#0a0e16' };

function themeIsDark(theme) {
  return theme === 'dark' || (theme !== 'light' && nativeTheme.shouldUseDarkColors);
}

function windowBackground(theme) {
  return themeIsDark(theme) ? WINDOW_BG.dark : WINDOW_BG.light;
}

const isDev = Boolean(process.env.NAMI_DEV);
let win = null;

if (process.env.NAMI_DEBUG_LOG) {
  const log = (line) => {
    try {
      require('node:fs').appendFileSync(process.env.NAMI_DEBUG_LOG, `${new Date().toISOString()} ${line}\n`);
    } catch {
      /* never let logging throw */
    }
  };
  process.on('uncaughtException', (error) => log(`uncaughtException ${error.stack}`));
  process.on('unhandledRejection', (reason) => log(`unhandledRejection ${reason}`));
  log(`boot pid ${process.pid} electron ${process.versions.electron} node ${process.versions.node}`);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'nami',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    app.setName('NAMI');
    Menu.setApplicationMenu(null);

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    appProtocol.register();
    api.register(ipcMain);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

function createWindow() {
  const savedTheme = store.readSettings().theme;
  nativeTheme.themeSource = savedTheme;

  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 860,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: windowBackground(savedTheme),
    title: 'NAMI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadURL(`${appProtocol.ORIGIN}/index.html`);

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  win.on('maximize', () => win.webContents.send('nami:maximized', true));
  win.on('unmaximize', () => win.webContents.send('nami:maximized', false));
  win.on('closed', () => {
    win = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appProtocol.ORIGIN)) event.preventDefault();
  });
}

ipcMain.on('nami:window', (event, action) => {
  if (!win || event.sender !== win.webContents) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } else if (action === 'close') win.close();
});

ipcMain.on('nami:theme', (event, theme) => {
  const next = ['system', 'light', 'dark'].includes(String(theme)) ? String(theme) : 'system';
  nativeTheme.themeSource = next;
  if (win && event.sender === win.webContents) win.setBackgroundColor(windowBackground(next));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
