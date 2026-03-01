const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const DEFAULT_SETTINGS = {
  enableFrontendService: true,
  frontendCliPath: '',
  frontendCliArgs: '',
  enableBackendService: true,
  backendCliPath: '',
  backendCliArgs: '',
  autoStartServices: true,
  enableGuard: false,
  newTabDefaultUrl: 'https://www.example.com',
  startButtonUrl: 'https://www.example.com'
};

let mainWindow = null;
let startupWindow = null;

const processState = {
  frontend: { process: null, running: false, logs: [] },
  backend: { process: null, running: false, logs: [] }
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function parseArgs(argsText = '') {
  const pieces = argsText.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return pieces.map((item) => item.replace(/^"|"$/g, ''));
}

function appendLog(target, message) {
  const line = `[${new Date().toLocaleString()}] ${message}`;
  processState[target].logs.push(line);
  if (processState[target].logs.length > 500) {
    processState[target].logs.shift();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cli-log', { target, line });
  }
}

function readSettings() {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (_error) {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(payload) {
  const settingsPath = getSettingsPath();
  const merged = { ...DEFAULT_SETTINGS, ...payload };
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

function notifyCliState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cli-state-updated', {
      frontendRunning: processState.frontend.running,
      backendRunning: processState.backend.running
    });
  }
}

function killProcess(target) {
  const current = processState[target].process;
  if (current && !current.killed) {
    try {
      current.kill();
    } catch (_error) {}
  }
  processState[target].process = null;
  processState[target].running = false;
  notifyCliState();
}

function spawnCli(target, cliPath, argsText, enableGuard) {
  if (!cliPath) {
    processState[target].running = false;
    appendLog(target, '未配置路径，未启动。');
    notifyCliState();
    return;
  }

  killProcess(target);

  const args = parseArgs(argsText);
  appendLog(target, `启动命令：${cliPath} ${args.join(' ')}`.trim());

  const child = spawn(cliPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  processState[target].process = child;
  processState[target].running = true;
  notifyCliState();

  child.stdout.on('data', (chunk) => {
    appendLog(target, String(chunk).trimEnd());
  });

  child.stderr.on('data', (chunk) => {
    appendLog(target, `[ERR] ${String(chunk).trimEnd()}`);
  });

  child.on('error', (error) => {
    processState[target].running = false;
    appendLog(target, `启动失败：${error.message}`);
    notifyCliState();
  });

  child.on('exit', (code, signal) => {
    processState[target].running = false;
    processState[target].process = null;
    appendLog(target, `进程退出 code=${code} signal=${signal || 'none'}`);
    notifyCliState();

    const latestSettings = readSettings();
    if (latestSettings.enableGuard && enableGuard) {
      appendLog(target, '守护功能启用，2秒后自动重启。');
      setTimeout(() => {
        const fresh = readSettings();
        const p = target === 'frontend' ? fresh.frontendCliPath : fresh.backendCliPath;
        const a = target === 'frontend' ? fresh.frontendCliArgs : fresh.backendCliArgs;
        if (fresh.enableGuard) {
          spawnCli(target, p, a, true);
        }
      }, 2000);
    }
  });
}

function applyCliBySettings(settings) {
  if (!settings.autoStartServices) {
    killProcess('frontend');
    killProcess('backend');
    appendLog('frontend', '已关闭“启动时自动启动服务”，未自动启动。');
    appendLog('backend', '已关闭“启动时自动启动服务”，未自动启动。');
    return;
  }

  if (settings.enableFrontendService) {
    spawnCli('frontend', settings.frontendCliPath, settings.frontendCliArgs, settings.enableGuard);
  } else {
    killProcess('frontend');
    appendLog('frontend', '前端服务已关闭。');
  }

  if (settings.enableBackendService) {
    spawnCli('backend', settings.backendCliPath, settings.backendCliArgs, settings.enableGuard);
  } else {
    killProcess('backend');
    appendLog('backend', '后端服务已关闭。');
  }

  notifyCliState();
}

function createMainWindow() {
  const windowOptions = {
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
  } else {
    windowOptions.frame = false;
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#111827',
      symbolColor: '#ffffff',
      height: 38
    };
  }

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    notifyCliState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createStartupWindow(url) {
  if (startupWindow && !startupWindow.isDestroyed()) {
    startupWindow.focus();
    return;
  }

  startupWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  startupWindow.loadURL(url || DEFAULT_SETTINGS.startButtonUrl);
  startupWindow.on('closed', () => {
    startupWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();
  const settings = readSettings();
  applyCliBySettings(settings);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  killProcess('frontend');
  killProcess('backend');
});

ipcMain.handle('settings:get', () => {
  const settings = readSettings();
  return {
    settings,
    logs: {
      frontend: [...processState.frontend.logs],
      backend: [...processState.backend.logs]
    },
    state: {
      frontendRunning: processState.frontend.running,
      backendRunning: processState.backend.running,
      enableFrontendService: !!settings.enableFrontendService,
      enableBackendService: !!settings.enableBackendService,
      autoStartServices: !!settings.autoStartServices
    }
  };
});

ipcMain.handle('settings:save', (_event, payload) => {
  const saved = writeSettings(payload);
  applyCliBySettings(saved);
  return { ok: true, settings: saved };
});

ipcMain.handle('app:open-start-url', async () => {
  const settings = readSettings();
  createStartupWindow(settings.startButtonUrl);
  return { ok: true };
});

ipcMain.handle('window:minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.handle('window:maximize-toggle', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.handle('window:close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});