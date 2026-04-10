const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const MODEL_TYPES = ['no_prompt', 'pts', 'box', 'box+pts', 'SCF-SAM'];

const DEFAULT_SETTINGS = {
  enableFrontendService: true,
  enableBackendService: true,
  autoStartServices: true,
  enableGuard: false,
  guardRestartDelaySeconds: 2,
  port: 3000,
  apiPort: 3001,
  onnxPath: '',
  modelType: 'SCF-SAM',
  frontendExtraArgs: '',
  backendExtraArgs: ''
};

let mainWindow = null;
let appShuttingDown = false;
let quitSequenceStarted = false;

function sendWindowState(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('window:state-changed', {
    maximized: win.isMaximized()
  });
}

const processState = {
  frontend: {
    process: null,
    running: false,
    logs: [],
    status: 'stopped',
    lastError: null,
    commandKey: '',
    stopRequested: false,
    restartTimer: null,
    stopPromise: null,
    resolveStop: null
  },
  backend: {
    process: null,
    running: false,
    logs: [],
    status: 'stopped',
    lastError: null,
    commandKey: '',
    stopRequested: false,
    restartTimer: null,
    stopPromise: null,
    resolveStop: null
  }
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function getProgramRoot() {
  return app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname;
}

function getServiceWorkingDirectory() {
  return getProgramRoot();
}

function getServiceBinaryPath(target) {
  const executableName = process.platform === 'win32'
    ? target === 'frontend' ? 'ui.exe' : 'server.exe'
    : target === 'frontend' ? 'ui' : 'server';
  return path.join(getProgramRoot(), 'bin', executableName);
}

function buildClientUrl(port, host = '127.0.0.1', pathname = '/client') {
  return `http://${host}:${port}${pathname}`;
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

function buildServiceError(target, summary, details) {
  return {
    target,
    summary,
    details: details || '无更多详细信息。',
    timestamp: new Date().toISOString()
  };
}

function setServiceError(target, summary, details) {
  processState[target].lastError = buildServiceError(target, summary, details);
}

function clearServiceError(target) {
  processState[target].lastError = null;
}

function getRecentLogs(target, count = 30) {
  return processState[target].logs.slice(-count).join('\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeGuardRestartDelaySeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.guardRestartDelaySeconds;
  }
  return Math.max(0, Math.round(parsed));
}

function normalizePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function normalizeModelType(value) {
  return MODEL_TYPES.includes(value) ? value : DEFAULT_SETTINGS.modelType;
}

function normalizeSettings(payload = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...payload
  };

  const enableBackendService = !!merged.enableBackendService;

  return {
    ...merged,
    enableFrontendService: enableBackendService ? !!merged.enableFrontendService : false,
    enableBackendService,
    autoStartServices: !!merged.autoStartServices,
    enableGuard: !!merged.enableGuard,
    guardRestartDelaySeconds: normalizeGuardRestartDelaySeconds(merged.guardRestartDelaySeconds),
    port: normalizePort(merged.port, DEFAULT_SETTINGS.port),
    apiPort: normalizePort(merged.apiPort, DEFAULT_SETTINGS.apiPort),
    onnxPath: typeof merged.onnxPath === 'string' ? merged.onnxPath.trim() : '',
    modelType: normalizeModelType(merged.modelType),
    frontendExtraArgs: typeof merged.frontendExtraArgs === 'string' ? merged.frontendExtraArgs.trim() : '',
    backendExtraArgs: typeof merged.backendExtraArgs === 'string' ? merged.backendExtraArgs.trim() : ''
  };
}

function readSettings() {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return normalizeSettings();
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    return normalizeSettings(JSON.parse(raw));
  } catch (_error) {
    return normalizeSettings();
  }
}

function writeSettings(payload) {
  const settingsPath = getSettingsPath();
  const normalized = normalizeSettings(payload);
  fs.writeFileSync(settingsPath, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

function getMetaPayload(settings) {
  return {
    urls: {
      start: buildClientUrl(settings.port, '127.0.0.1', '/client'),
      quickPreprocess: buildClientUrl(settings.port, 'localhost', '/client/temp/preprocess'),
      quickAnalysis: buildClientUrl(settings.port, 'localhost', '/client/temp/analysis'),
      quickReconstruction: buildClientUrl(settings.port, 'localhost', '/client/temp/reconstruction'),
      quickConsult: buildClientUrl(settings.port, 'localhost', '/client/temp/consult'),
      lanAccess: `http://localhost:${settings.port}`,
      lanPlaceholder: `http://本机ip:${settings.port}`
    },
    platform: process.platform
  };
}

function notifyCliState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cli-state-updated', getCliStatePayload());
  }
}

function getCliStatePayload() {
  return {
    frontendRunning: processState.frontend.running,
    backendRunning: processState.backend.running,
    frontendStatus: processState.frontend.status,
    backendStatus: processState.backend.status,
    frontendError: processState.frontend.lastError,
    backendError: processState.backend.lastError
  };
}

function makeCommandKey(cliPath = '', args = []) {
  return `${cliPath}__ARGS__${args.join('\u0001')}`;
}

function formatCommand(cliPath, args) {
  const quotedArgs = args.map((arg) => (/[\s"]/u.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg));
  return [cliPath, ...quotedArgs].join(' ').trim();
}

function clearRestartTimer(target) {
  const state = processState[target];
  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }
}

function isServiceEnabled(target, settings) {
  if (target === 'backend') return !!settings.enableBackendService;
  return !!settings.enableBackendService && !!settings.enableFrontendService;
}

function getServiceLaunchConfig(target, settings) {
  if (target === 'frontend') {
    return {
      cliPath: getServiceBinaryPath('frontend'),
      args: [
        '--port',
        String(settings.port),
        '--apiport',
        String(settings.apiPort),
        ...parseArgs(settings.frontendExtraArgs)
      ]
    };
  }

  return {
    cliPath: getServiceBinaryPath('backend'),
    args: [
      '--apiport',
      String(settings.apiPort),
      '--onnx',
      settings.onnxPath,
      '--model_type',
      settings.modelType,
      ...parseArgs(settings.backendExtraArgs)
    ]
  };
}

function collectSettingsValidationErrors(settings) {
  const errors = [];
  const frontendBinaryPath = getServiceBinaryPath('frontend');
  const backendBinaryPath = getServiceBinaryPath('backend');

  if (settings.enableBackendService && !fs.existsSync(backendBinaryPath)) {
    errors.push(buildServiceError(
      'backend',
      '后端程序不存在。',
      `固定路径应为：${backendBinaryPath}`
    ));
  }

  if (settings.enableFrontendService && !fs.existsSync(frontendBinaryPath)) {
    errors.push(buildServiceError(
      'frontend',
      '前端程序不存在。',
      `固定路径应为：${frontendBinaryPath}`
    ));
  }

  if (settings.enableBackendService && !settings.onnxPath) {
    errors.push(buildServiceError(
      'backend',
      '未选择 ONNX 文件。',
      '请在设置中选择一个 .onnx 模型文件。'
    ));
  }

  if (settings.enableBackendService && settings.onnxPath && path.extname(settings.onnxPath).toLowerCase() !== '.onnx') {
    errors.push(buildServiceError(
      'backend',
      'ONNX 文件格式不正确。',
      '仅支持 .onnx 文件。'
    ));
  }

  if (settings.enableBackendService && settings.onnxPath && !fs.existsSync(settings.onnxPath)) {
    errors.push(buildServiceError(
      'backend',
      'ONNX 文件不存在。',
      `当前路径不存在：${settings.onnxPath}`
    ));
  }

  return errors;
}

function syncValidationErrors(validationErrors) {
  const backendError = validationErrors.find((item) => item.target === 'backend') || null;
  const frontendError = validationErrors.find((item) => item.target === 'frontend') || null;

  processState.backend.lastError = backendError;
  processState.frontend.lastError = frontendError;
}

function stopProcess(target, reason = '收到停止指令') {
  const state = processState[target];
  clearRestartTimer(target);
  state.stopRequested = true;

  if (state.stopPromise) {
    return state.stopPromise;
  }

  const current = state.process;
  if (!current) {
    state.running = false;
    state.status = 'stopped';
    state.commandKey = '';
    notifyCliState();
    return Promise.resolve();
  }

  state.status = 'stopping';
  state.stopPromise = new Promise((resolve) => {
    state.resolveStop = resolve;
  });

  appendLog(target, `${reason}，发送 SIGTERM...`);

  try {
    current.kill('SIGTERM');
  } catch (_error) {
    if (state.resolveStop) {
      state.resolveStop();
      state.resolveStop = null;
    }
    state.stopPromise = null;
    state.running = false;
    state.status = 'stopped';
    state.process = null;
    state.commandKey = '';
    notifyCliState();
    return Promise.resolve();
  }

  setTimeout(() => {
    if (state.process === current && !current.killed) {
      appendLog(target, '进程未在超时时间内退出，发送 SIGKILL。');
      try {
        current.kill('SIGKILL');
      } catch (_error) {}
    }
  }, 5000);

  return state.stopPromise;
}

async function spawnCli(target, cliPath, args, enableGuard) {
  const state = processState[target];
  const commandKey = makeCommandKey(cliPath, args);
  const workingDirectory = getServiceWorkingDirectory();

  if (state.process && state.running && state.commandKey === commandKey) {
    appendLog(target, '进程已在运行，跳过重复启动。');
    return;
  }

  if (state.process) {
    await stopProcess(target, '准备重启进程');
  }

  state.running = false;
  state.status = 'starting';
  clearServiceError(target);
  notifyCliState();
  appendLog(target, `启动命令：${formatCommand(cliPath, args)}`);
  appendLog(target, `工作目录：${workingDirectory}`);

  const child = spawn(cliPath, args, {
    cwd: workingDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  state.process = child;
  state.running = true;
  state.status = 'running';
  state.commandKey = commandKey;
  state.stopRequested = false;
  clearRestartTimer(target);
  notifyCliState();

  child.stdout.on('data', (chunk) => {
    appendLog(target, String(chunk).trimEnd());
  });

  child.stderr.on('data', (chunk) => {
    appendLog(target, `[ERR] ${String(chunk).trimEnd()}`);
  });

  child.on('error', (error) => {
    state.running = false;
    state.status = 'stopped';
    state.process = null;
    state.commandKey = '';
    setServiceError(target, `启动失败：${error.message}`, getRecentLogs(target));
    appendLog(target, `启动失败：${error.message}`);

    if (state.resolveStop) {
      state.resolveStop();
      state.resolveStop = null;
    }
    state.stopPromise = null;

    notifyCliState();
  });

  child.on('exit', (code, signal) => {
    const wasStopRequested = state.stopRequested;
    state.running = false;
    state.process = null;
    state.status = 'stopped';
    state.commandKey = '';
    state.stopRequested = false;
    appendLog(target, `进程退出 code=${code} signal=${signal || 'none'}`);

    if (state.resolveStop) {
      state.resolveStop();
      state.resolveStop = null;
    }
    state.stopPromise = null;

    if (!wasStopRequested) {
      setServiceError(target, `进程已退出 code=${code} signal=${signal || 'none'}`, getRecentLogs(target));
    }

    notifyCliState();

    const latestSettings = readSettings();
    if (!appShuttingDown && !wasStopRequested && latestSettings.enableGuard && enableGuard && isServiceEnabled(target, latestSettings)) {
      const restartDelaySeconds = normalizeGuardRestartDelaySeconds(latestSettings.guardRestartDelaySeconds);
      appendLog(target, `守护功能启用，${restartDelaySeconds}秒后自动重启。`);
      state.restartTimer = setTimeout(() => {
        state.restartTimer = null;
        if (appShuttingDown) return;
        const fresh = readSettings();
        if (!isServiceEnabled(target, fresh)) return;
        const launchConfig = getServiceLaunchConfig(target, fresh);
        if (fresh.enableGuard) {
          spawnCli(target, launchConfig.cliPath, launchConfig.args, true);
        }
      }, restartDelaySeconds * 1000);
    }
  });
}

async function applyCliBySettings(settings) {
  const normalizedSettings = normalizeSettings(settings);
  const validationErrors = collectSettingsValidationErrors(normalizedSettings);
  syncValidationErrors(validationErrors);

  if (!normalizedSettings.autoStartServices) {
    await stopProcess('frontend', '自动启动关闭，停止前端服务');
    await stopProcess('backend', '自动启动关闭，停止后端服务');
    notifyCliState();
    return [];
  }

  const backendBlocked = validationErrors.some((item) => item.target === 'backend');
  const frontendBlocked = validationErrors.some((item) => item.target === 'frontend') || backendBlocked;

  if (normalizedSettings.enableBackendService && !backendBlocked) {
    const backendConfig = getServiceLaunchConfig('backend', normalizedSettings);
    await spawnCli('backend', backendConfig.cliPath, backendConfig.args, normalizedSettings.enableGuard);
  } else {
    await stopProcess('backend', '后端服务已关闭或配置无效，停止后端服务');
  }

  if (normalizedSettings.enableFrontendService && !frontendBlocked) {
    const frontendConfig = getServiceLaunchConfig('frontend', normalizedSettings);
    await spawnCli('frontend', frontendConfig.cliPath, frontendConfig.args, normalizedSettings.enableGuard);
  } else {
    await stopProcess('frontend', '前端服务已关闭或配置无效，停止前端服务');
  }

  notifyCliState();
  return validationErrors;
}

async function startServicesBySettings(settings) {
  const normalizedSettings = normalizeSettings(settings);
  const validationErrors = collectSettingsValidationErrors(normalizedSettings);
  syncValidationErrors(validationErrors);

  if (!normalizedSettings.enableBackendService && !normalizedSettings.enableFrontendService) {
    return {
      ok: false,
      errors: [buildServiceError('system', '当前没有启用任何服务。', '请至少启用后端服务。')]
    };
  }

  if (validationErrors.length > 0) {
    notifyCliState();
    return {
      ok: false,
      errors: validationErrors
    };
  }

  const errors = [];

  if (normalizedSettings.enableBackendService && !processState.backend.running) {
    const backendConfig = getServiceLaunchConfig('backend', normalizedSettings);
    await spawnCli('backend', backendConfig.cliPath, backendConfig.args, normalizedSettings.enableGuard);
    await sleep(2000);
    if (!processState.backend.running) {
      errors.push(processState.backend.lastError || buildServiceError('backend', '后端服务启动失败。', getRecentLogs('backend')));
    }
  }

  if (!errors.length && normalizedSettings.enableFrontendService && !processState.frontend.running) {
    const frontendConfig = getServiceLaunchConfig('frontend', normalizedSettings);
    await spawnCli('frontend', frontendConfig.cliPath, frontendConfig.args, normalizedSettings.enableGuard);
    await sleep(2000);
    if (!processState.frontend.running) {
      errors.push(processState.frontend.lastError || buildServiceError('frontend', '前端服务启动失败。', getRecentLogs('frontend')));
    }
  }

  notifyCliState();

  return {
    ok: errors.length === 0,
    errors
  };
}

function collectSettingsApplyErrors(settings, validationErrors = []) {
  const normalizedSettings = normalizeSettings(settings);
  if (!normalizedSettings.autoStartServices) {
    return [];
  }

  const errors = [...validationErrors];

  if (normalizedSettings.enableBackendService && !processState.backend.running && !errors.some((item) => item.target === 'backend')) {
    errors.push(processState.backend.lastError || buildServiceError('backend', '后端服务启动失败。', getRecentLogs('backend')));
  }

  if (normalizedSettings.enableFrontendService && !processState.frontend.running && !errors.some((item) => item.target === 'frontend')) {
    errors.push(processState.frontend.lastError || buildServiceError('frontend', '前端服务启动失败。', getRecentLogs('frontend')));
  }

  return errors;
}

function createMainWindow() {
  const windowOptions = {
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#f6f7fb',
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
  }

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    sendWindowState(mainWindow);
    notifyCliState();
  });

  mainWindow.on('maximize', () => {
    sendWindowState(mainWindow);
  });

  mainWindow.on('unmaximize', () => {
    sendWindowState(mainWindow);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function resetDatabase() {
  const dbPath = path.join(getProgramRoot(), 'db');

  await stopProcess('frontend', '重置数据库，停止前端服务');
  await stopProcess('backend', '重置数据库，停止后端服务');

  try {
    await fs.promises.rm(dbPath, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`删除数据库目录失败：${error.message}`);
  }

  notifyCliState();
}

async function bootstrapServicesOnStartup() {
  const settings = readSettings();

  if (!settings.autoStartServices) {
    notifyCliState();
    return;
  }

  try {
    await applyCliBySettings(settings);
  } catch (error) {
    setServiceError('backend', `自动启动失败：${error.message}`, error.stack || error.message);
    setServiceError('frontend', `自动启动失败：${error.message}`, error.stack || error.message);
    appendLog('backend', `自动启动失败：${error.message}`);
    appendLog('frontend', `自动启动失败：${error.message}`);
    notifyCliState();
  }
}

app.whenReady().then(async () => {
  createMainWindow();
  await bootstrapServicesOnStartup();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  if (!appShuttingDown) {
    appShuttingDown = true;
  }

  if (quitSequenceStarted) {
    return;
  }

  event.preventDefault();
  quitSequenceStarted = true;

  Promise.all([
    stopProcess('frontend', '应用退出，停止前端服务'),
    stopProcess('backend', '应用退出，停止后端服务')
  ]).finally(() => {
    app.exit(0);
  });
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
      ...getCliStatePayload(),
      enableFrontendService: !!settings.enableFrontendService,
      enableBackendService: !!settings.enableBackendService,
      autoStartServices: !!settings.autoStartServices
    },
    meta: getMetaPayload(settings)
  };
});

ipcMain.handle('settings:save', async (_event, payload) => {
  const saved = writeSettings(payload);
  const validationErrors = await applyCliBySettings(saved);
  const errors = collectSettingsApplyErrors(saved, validationErrors);
  return {
    ok: errors.length === 0,
    settings: saved,
    errors,
    state: getCliStatePayload(),
    meta: getMetaPayload(saved)
  };
});

ipcMain.handle('services:start', async () => {
  const settings = readSettings();
  const result = await startServicesBySettings(settings);
  return {
    ok: result.ok,
    errors: result.errors,
    state: getCliStatePayload(),
    meta: getMetaPayload(settings)
  };
});

ipcMain.handle('services:control', async (_event, payload) => {
  const { action, target } = payload || {};
  let settings = readSettings();

  if (action === 'start' && target === 'backend') {
    settings = writeSettings({
      ...settings,
      enableBackendService: true
    });
    const result = await startServicesBySettings(settings);
    return {
      ok: result.ok,
      errors: result.errors,
      settings,
      state: getCliStatePayload(),
      meta: getMetaPayload(settings)
    };
  }

  if (action === 'start' && target === 'frontend') {
    settings = writeSettings({
      ...settings,
      enableBackendService: true,
      enableFrontendService: true
    });
    const result = await startServicesBySettings(settings);
    return {
      ok: result.ok,
      errors: result.errors,
      settings,
      state: getCliStatePayload(),
      meta: getMetaPayload(settings)
    };
  }

  if (action === 'stop' && target === 'frontend') {
    settings = writeSettings({
      ...settings,
      enableFrontendService: false
    });
    await stopProcess('frontend', '用户在设置中停止前端服务');
    notifyCliState();
    return {
      ok: true,
      errors: [],
      settings,
      state: getCliStatePayload(),
      meta: getMetaPayload(settings)
    };
  }

  if (action === 'stop' && target === 'backend') {
    settings = writeSettings({
      ...settings,
      enableBackendService: false,
      enableFrontendService: false
    });
    await stopProcess('frontend', '用户在设置中停止后端服务，先停止前端服务');
    await stopProcess('backend', '用户在设置中停止后端服务');
    notifyCliState();
    return {
      ok: true,
      errors: [],
      settings,
      state: getCliStatePayload(),
      meta: getMetaPayload(settings)
    };
  }

  return {
    ok: false,
    errors: [buildServiceError('system', '未知的服务控制动作。', JSON.stringify(payload || {}))],
    settings,
    state: getCliStatePayload(),
    meta: getMetaPayload(settings)
  };
});

ipcMain.handle('dialog:select-onnx', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择 ONNX 模型文件',
    properties: ['openFile'],
    filters: [
      { name: 'ONNX Model', extensions: ['onnx'] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true, filePath: '' };
  }

  return { canceled: false, filePath: result.filePaths[0] };
});

ipcMain.handle('external:open', async (_event, url) => {
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('database:reset', async () => {
  await resetDatabase();
  return {
    ok: true,
    state: getCliStatePayload()
  };
});

ipcMain.handle('window:minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.handle('window:get-state', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  return {
    maximized: !!win && win.isMaximized()
  };
});

ipcMain.handle('window:maximize-toggle', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  sendWindowState(win);
});

ipcMain.handle('window:close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});
