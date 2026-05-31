'use strict';
/**
 * Crypteon desktop — Electron main process.
 *
 * Boots the internal server (static renderer + provider proxy), opens the
 * window pointed straight at the Campaign front door, wires a native menu,
 * remembers window size/position, and routes external links to the default
 * browser. No remote content is ever loaded — everything is local.
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { startServer } = require('./server');

// Keep the renderer responsive even when the window is backgrounded, and let
// Chromium use the GPU for smooth scrolling/animations.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const APP_NAME = 'Crypteon';
// Land directly on the Campaign front door so we skip the home-route redirect.
const START_PATH = '/campaign/';

let mainWindow = null;
let serverHandle = null;

function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}
function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (s && typeof s.width === 'number' && typeof s.height === 'number') return s;
  } catch { /* first run / corrupt — ignore */ }
  return null;
}
function saveState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const b = mainWindow.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify(b));
  } catch { /* non-fatal */ }
}

async function createWindow() {
  if (!serverHandle) {
    try {
      serverHandle = await startServer(RENDERER_DIR);
    } catch (err) {
      dialog.showErrorBox(
        `${APP_NAME} — startup error`,
        `Could not start the internal server:\n\n${err && err.message ? err.message : err}`
      );
      app.quit();
      return;
    }
  }

  const saved = readState();
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 920,
    x: saved?.x,
    y: saved?.y,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b0b0f',
    title: APP_NAME,
    show: false,
    // Native macOS chrome: hide the OS title bar and inset the traffic-light
    // buttons over a draggable in-app header (the VS Code / Linear / Slack look).
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 19 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appOrigin = `http://127.0.0.1:${serverHandle.port}`;
    if (!url.startsWith(appOrigin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Persist window bounds (debounced).
  let saveTimer = null;
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 400);
  };
  mainWindow.on('resize', queueSave);
  mainWindow.on('move', queueSave);
  mainWindow.on('close', saveState);
  mainWindow.on('closed', () => { mainWindow = null; });

  await mainWindow.loadURL(`http://127.0.0.1:${serverHandle.port}${START_PATH}`);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { role: 'about' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' }
      ]
    }] : []),
    { label: 'File', submenu: [isMac ? { role: 'close' } : { role: 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' }] : [{ role: 'close' }])]
    },
    {
      role: 'help',
      submenu: [{
        label: 'Crypteon on GitHub',
        click: () => shell.openExternal('https://github.com/anku0669/crypteon-oss')
      }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (serverHandle) serverHandle.close();
      app.quit();
    }
  });

  app.on('before-quit', () => {
    if (serverHandle) serverHandle.close();
  });
}
