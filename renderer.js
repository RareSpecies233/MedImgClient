const tabsContainer = document.getElementById('tabsContainer');
const tabPages = document.getElementById('tabPages');
const homeView = document.getElementById('homeView');

const btnStart = document.getElementById('btnStart');
const btnSettings = document.getElementById('btnSettings');
const btnDeveloperMode = document.getElementById('btnDeveloperMode');
const btnQuickPreprocess = document.getElementById('btnQuickPreprocess');
const btnQuickAnalysis = document.getElementById('btnQuickAnalysis');
const btnQuickReconstruction = document.getElementById('btnQuickReconstruction');
const btnQuickConsult = document.getElementById('btnQuickConsult');
const cliStatusText = document.getElementById('cliStatusText');
const lanAccessLink = document.getElementById('lanAccessLink');
const defaultStartUrl = document.getElementById('defaultStartUrl');

const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const saveSettings = document.getElementById('saveSettings');

const developerModal = document.getElementById('developerModal');
const closeDeveloperMode = document.getElementById('closeDeveloperMode');
const saveDeveloperSettings = document.getElementById('saveDeveloperSettings');
const btnBackendAdvanced = document.getElementById('btnBackendAdvanced');

const enableFrontendService = document.getElementById('enableFrontendService');
const enableBackendService = document.getElementById('enableBackendService');
const autoStartServices = document.getElementById('autoStartServices');
const enableGuard = document.getElementById('enableGuard');
const guardRestartDelaySeconds = document.getElementById('guardRestartDelaySeconds');
const servicePort = document.getElementById('servicePort');
const apiPort = document.getElementById('apiPort');
const modelType = document.getElementById('modelType');
const onnxPath = document.getElementById('onnxPath');
const selectOnnxFile = document.getElementById('selectOnnxFile');

const frontendFixedPath = document.getElementById('frontendFixedPath');
const backendFixedPath = document.getElementById('backendFixedPath');
const developerFrontendFixedPath = document.getElementById('developerFrontendFixedPath');
const developerBackendFixedPath = document.getElementById('developerBackendFixedPath');
const developerFrontendArgs = document.getElementById('developerFrontendArgs');
const developerBackendArgs = document.getElementById('developerBackendArgs');
const frontendLogs = document.getElementById('frontendLogs');
const backendLogs = document.getElementById('backendLogs');

const serviceErrorPanel = document.getElementById('serviceErrorPanel');
const serviceErrorSummary = document.getElementById('serviceErrorSummary');
const serviceErrorDetails = document.getElementById('serviceErrorDetails');

const btnMin = document.getElementById('btnMin');
const btnMax = document.getElementById('btnMax');
const btnClose = document.getElementById('btnClose');

let settings = {
  enableFrontendService: true,
  enableBackendService: true,
  autoStartServices: true,
  enableGuard: false,
  guardRestartDelaySeconds: 2,
  port: 3000,
  apiPort: 3001,
  onnxPath: '',
  modelType: 'sota',
  frontendExtraArgs: '',
  backendExtraArgs: ''
};

let appMeta = {
  fixedPaths: {
    frontend: '',
    backend: ''
  },
  urls: {
    start: '',
    quickPreprocess: '',
    quickAnalysis: '',
    quickReconstruction: '',
    quickConsult: '',
    developerAbout: '',
    lan: ''
  },
  localNetworkIp: ''
};

const tabs = [
  {
    id: 'home',
    title: '主页',
    type: 'home',
    closable: false
  }
];

let activeTabId = 'home';
let tabCounter = 1;
let frontendRunning = false;
let backendRunning = false;
let frontendStatus = 'stopped';
let backendStatus = 'stopped';
let manualStartInProgress = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfiguredTabUrl(overrideUrl) {
  return typeof overrideUrl === 'string' && overrideUrl.trim()
    ? overrideUrl.trim()
    : appMeta.urls.start;
}

function applyMeta(meta = {}) {
  appMeta = {
    ...appMeta,
    ...meta,
    fixedPaths: {
      ...appMeta.fixedPaths,
      ...(meta.fixedPaths || {})
    },
    urls: {
      ...appMeta.urls,
      ...(meta.urls || {})
    }
  };

  frontendFixedPath.textContent = appMeta.fixedPaths.frontend || '未找到';
  backendFixedPath.textContent = appMeta.fixedPaths.backend || '未找到';
  developerFrontendFixedPath.textContent = appMeta.fixedPaths.frontend || '未找到';
  developerBackendFixedPath.textContent = appMeta.fixedPaths.backend || '未找到';

  defaultStartUrl.textContent = appMeta.urls.start || 'http://127.0.0.1:3000/client';
  if (appMeta.urls.lan) {
    lanAccessLink.textContent = appMeta.urls.lan;
    lanAccessLink.dataset.url = appMeta.urls.lan;
  } else {
    lanAccessLink.textContent = '暂未获取到局域网地址';
    lanAccessLink.dataset.url = '';
  }
}

function applySettingsToFormState() {
  enableBackendService.checked = !!settings.enableBackendService;
  enableFrontendService.checked = !!settings.enableFrontendService;
  enableFrontendService.disabled = !settings.enableBackendService;
  autoStartServices.checked = !!settings.autoStartServices;
  enableGuard.checked = !!settings.enableGuard;
  guardRestartDelaySeconds.value = String(settings.guardRestartDelaySeconds ?? 2);
  servicePort.value = String(settings.port ?? 3000);
  apiPort.value = String(settings.apiPort ?? 3001);
  modelType.value = settings.modelType || 'sota';
  onnxPath.value = settings.onnxPath || '';
  developerFrontendArgs.value = settings.frontendExtraArgs || '';
  developerBackendArgs.value = settings.backendExtraArgs || '';
}

function clearServiceErrorView() {
  serviceErrorPanel.classList.add('hidden');
  serviceErrorSummary.textContent = '';
  serviceErrorDetails.value = '';
}

function setServiceErrorView(errors) {
  if (!errors || errors.length === 0) {
    clearServiceErrorView();
    return;
  }

  serviceErrorPanel.classList.remove('hidden');
  serviceErrorSummary.textContent = errors.map((item) => {
    const label = item.target === 'frontend' ? '前端服务' : item.target === 'backend' ? '后端服务' : '服务';
    return `${label}：${item.summary}`;
  }).join('\n');
  serviceErrorDetails.value = errors.map((item) => {
    const label = item.target === 'frontend' ? '前端服务' : item.target === 'backend' ? '后端服务' : '服务';
    return `${label}\n${item.details || '无更多详细信息。'}`;
  }).join('\n\n');
}

function syncErrorStateFromState(state) {
  const errors = [state.backendError, state.frontendError].filter(Boolean);
  if (errors.length > 0) {
    setServiceErrorView(errors);
    return;
  }
  clearServiceErrorView();
}

function getEffectiveServiceState() {
  const backendEnabled = !!settings.enableBackendService;
  const frontendEnabled = backendEnabled && !!settings.enableFrontendService;

  return {
    backendEnabled,
    frontendEnabled,
    backendReady: !backendEnabled || backendRunning,
    frontendReady: !frontendEnabled || frontendRunning
  };
}

function getServiceStatusText() {
  const { backendEnabled, frontendEnabled, backendReady, frontendReady } = getEffectiveServiceState();
  const statusPending = manualStartInProgress
    || backendStatus === 'starting'
    || frontendStatus === 'starting'
    || backendStatus === 'stopping'
    || frontendStatus === 'stopping';

  if (statusPending) {
    return '正在启动中';
  }

  if (backendReady && frontendReady && (backendEnabled || frontendEnabled)) {
    if (backendEnabled && !frontendEnabled) {
      return '仅启动后端服务';
    }
    return '服务已启动';
  }

  if (backendRunning && !frontendRunning) {
    return '仅启动后端服务';
  }

  return '服务未启动';
}

function areRequiredServicesReady() {
  const { backendEnabled, frontendEnabled, backendReady, frontendReady } = getEffectiveServiceState();
  const anyServiceEnabled = backendEnabled || frontendEnabled;
  return anyServiceEnabled && backendReady && frontendReady;
}

function updateStartButtonStatus() {
  const ready = areRequiredServicesReady();
  btnStart.disabled = manualStartInProgress;
  btnStart.textContent = manualStartInProgress ? '正在启动中' : ready ? '开始使用' : '未启动服务';
  cliStatusText.textContent = getServiceStatusText();
}

async function persistSettings(partial) {
  const payload = {
    ...settings,
    ...partial
  };

  if (!payload.enableBackendService) {
    payload.enableFrontendService = false;
  }

  const result = await window.appApi.saveSettings(payload);
  settings = result.settings;
  applyMeta(result.meta);
  applySettingsToFormState();

  if (result.state) {
    frontendRunning = !!result.state.frontendRunning;
    backendRunning = !!result.state.backendRunning;
    frontendStatus = result.state.frontendStatus || 'stopped';
    backendStatus = result.state.backendStatus || 'stopped';
    syncErrorStateFromState(result.state);
  }

  return result;
}

async function startServicesNow() {
  const result = await window.appApi.startServices();
  if (result.meta) {
    applyMeta(result.meta);
  }

  if (result.state) {
    frontendRunning = !!result.state.frontendRunning;
    backendRunning = !!result.state.backendRunning;
    frontendStatus = result.state.frontendStatus || 'stopped';
    backendStatus = result.state.backendStatus || 'stopped';
    syncErrorStateFromState(result.state);
  }

  return result;
}

function createTabPage(tab) {
  if (tab.type !== 'web') return;
  const page = document.createElement('section');
  page.className = 'tab-page';
  page.id = `page-${tab.id}`;

  const webview = document.createElement('webview');
  webview.className = 'tab-webview';
  webview.setAttribute('src', tab.url);
  webview.setAttribute('allowpopups', 'true');
  webview.addEventListener('page-title-updated', (event) => {
    const nextTitle = (event.title || '').trim();
    if (!nextTitle) return;
    const target = tabs.find((item) => item.id === tab.id);
    if (!target) return;
    if (target.title !== nextTitle) {
      target.title = nextTitle;
      renderTabs();
    }
  });
  page.appendChild(webview);
  tabPages.appendChild(page);
}

function removeTabPage(tabId) {
  const page = document.getElementById(`page-${tabId}`);
  if (page) page.remove();
}

function switchTab(tabId) {
  activeTabId = tabId;
  const isHome = tabId === 'home';

  homeView.style.display = isHome ? 'flex' : 'none';
  tabPages.style.display = isHome ? 'none' : 'block';

  document.querySelectorAll('.tab-page').forEach((page) => {
    page.classList.toggle('active', page.id === `page-${tabId}`);
  });

  renderTabs();
}

function addNewTab(initialUrl) {
  const id = `tab-${Date.now()}-${tabCounter}`;
  tabCounter += 1;

  const tab = {
    id,
    title: '新标签页',
    type: 'web',
    closable: true,
    url: getConfiguredTabUrl(initialUrl)
  };

  tabs.push(tab);
  createTabPage(tab);
  switchTab(tab.id);
}

function closeTab(tabId) {
  const index = tabs.findIndex((item) => item.id === tabId);
  if (index <= 0) return;

  const wasActive = activeTabId === tabId;
  tabs.splice(index, 1);
  removeTabPage(tabId);

  if (wasActive) {
    const fallback = tabs[index - 1] || tabs[0];
    switchTab(fallback.id);
  } else {
    renderTabs();
  }
}

function renderTabs() {
  tabsContainer.innerHTML = '';

  tabs.forEach((tab) => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab-item ${tab.id === activeTabId ? 'active' : ''}`;
    tabEl.addEventListener('click', () => switchTab(tab.id));
    tabEl.addEventListener('mousedown', (event) => {
      if (event.button === 1 && tab.closable) {
        event.preventDefault();
      }
    });
    tabEl.addEventListener('auxclick', (event) => {
      if (event.button !== 1 || !tab.closable) return;
      event.preventDefault();
      closeTab(tab.id);
    });

    const title = document.createElement('span');
    title.textContent = tab.title;
    tabEl.appendChild(title);

    if (tab.closable) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeTab(tab.id);
      });
      tabEl.appendChild(closeBtn);
    }

    tabsContainer.appendChild(tabEl);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'tab-add';
  addBtn.textContent = '+';
  addBtn.title = '新建标签页';
  addBtn.addEventListener('click', () => {
    void openServicePage(appMeta.urls.start);
  });
  tabsContainer.appendChild(addBtn);
}

function collectSettingsForm() {
  return {
    enableFrontendService: enableFrontendService.checked,
    enableBackendService: enableBackendService.checked,
    autoStartServices: autoStartServices.checked,
    enableGuard: enableGuard.checked,
    guardRestartDelaySeconds: Number.parseInt(guardRestartDelaySeconds.value, 10),
    port: Number.parseInt(servicePort.value, 10),
    apiPort: Number.parseInt(apiPort.value, 10),
    modelType: modelType.value,
    onnxPath: onnxPath.value.trim()
  };
}

function collectDeveloperForm() {
  return {
    frontendExtraArgs: developerFrontendArgs.value.trim(),
    backendExtraArgs: developerBackendArgs.value.trim()
  };
}

function appendLogToView(target, line) {
  if (target === 'frontend') {
    frontendLogs.value += `${line}\n`;
    frontendLogs.scrollTop = frontendLogs.scrollHeight;
  } else {
    backendLogs.value += `${line}\n`;
    backendLogs.scrollTop = backendLogs.scrollHeight;
  }
}

function showSettingsModal() {
  applySettingsToFormState();
  settingsModal.classList.remove('hidden');
}

function hideSettingsModal() {
  settingsModal.classList.add('hidden');
}

function showDeveloperModal() {
  applySettingsToFormState();
  developerModal.classList.remove('hidden');
}

function hideDeveloperModal() {
  developerModal.classList.add('hidden');
}

function setupWindowControls() {
  if (window.appApi.platform === 'darwin') {
    document.body.classList.add('platform-darwin');
  }

  if (window.appApi.platform === 'win32' || window.appApi.platform === 'linux') {
    document.getElementById('windowControls').style.display = 'flex';
  }

  btnMin.addEventListener('click', () => window.appApi.windowControl.minimize());
  btnMax.addEventListener('click', () => window.appApi.windowControl.maximizeToggle());
  btnClose.addEventListener('click', () => window.appApi.windowControl.close());
}

async function openServicePage(url) {
  if (areRequiredServicesReady()) {
    addNewTab(url);
    return;
  }

  const shouldStart = window.confirm('检测到服务未启动，是否现在启用前后端服务并打开页面？');
  if (!shouldStart) return;

  manualStartInProgress = true;
  clearServiceErrorView();
  updateStartButtonStatus();

  try {
    await persistSettings({
      enableBackendService: true,
      enableFrontendService: true
    });

    const result = await startServicesNow();

    if (!result.ok) {
      setServiceErrorView(result.errors || []);
      showSettingsModal();
      window.alert('启动服务失败，请查看设置界面的详细错误信息。');
      return;
    }

    await delay(2000);

    if (!areRequiredServicesReady()) {
      showSettingsModal();
      window.alert('服务未在预期时间内就绪，请查看设置界面的详细错误信息。');
      return;
    }

    addNewTab(url);
  } catch (error) {
    setServiceErrorView([
      {
        target: 'system',
        summary: `启动服务失败：${error.message}`,
        details: error.stack || error.message
      }
    ]);
    showSettingsModal();
    window.alert(`启动服务失败：${error.message}`);
  } finally {
    manualStartInProgress = false;
    updateStartButtonStatus();
  }
}

async function bootstrap() {
  renderTabs();
  switchTab('home');
  setupWindowControls();

  const initial = await window.appApi.getSettings();
  settings = initial.settings;
  applyMeta(initial.meta);
  applySettingsToFormState();

  frontendLogs.value = (initial.logs.frontend || []).join('\n');
  backendLogs.value = (initial.logs.backend || []).join('\n');

  frontendRunning = !!initial.state.frontendRunning;
  backendRunning = !!initial.state.backendRunning;
  frontendStatus = initial.state.frontendStatus || 'stopped';
  backendStatus = initial.state.backendStatus || 'stopped';
  syncErrorStateFromState(initial.state);
  updateStartButtonStatus();

  btnStart.addEventListener('click', () => {
    void openServicePage(appMeta.urls.start);
  });

  btnQuickPreprocess.addEventListener('click', () => {
    void openServicePage(appMeta.urls.quickPreprocess);
  });

  btnQuickAnalysis.addEventListener('click', () => {
    void openServicePage(appMeta.urls.quickAnalysis);
  });

  btnQuickReconstruction.addEventListener('click', () => {
    void openServicePage(appMeta.urls.quickReconstruction);
  });

  btnQuickConsult.addEventListener('click', () => {
    void openServicePage(appMeta.urls.quickConsult);
  });

  btnDeveloperMode.addEventListener('click', showDeveloperModal);

  lanAccessLink.addEventListener('click', (event) => {
    event.preventDefault();
    const url = lanAccessLink.dataset.url;
    if (!url) return;
    void window.appApi.openExternal(url);
  });

  enableBackendService.addEventListener('change', () => {
    if (!enableBackendService.checked) {
      enableFrontendService.checked = false;
      enableFrontendService.disabled = true;
      return;
    }
    enableFrontendService.disabled = false;
  });

  btnSettings.addEventListener('click', showSettingsModal);
  closeSettings.addEventListener('click', hideSettingsModal);
  settingsModal.addEventListener('click', (event) => {
    if (event.target === settingsModal) hideSettingsModal();
  });

  closeDeveloperMode.addEventListener('click', hideDeveloperModal);
  developerModal.addEventListener('click', (event) => {
    if (event.target === developerModal) hideDeveloperModal();
  });

  selectOnnxFile.addEventListener('click', async () => {
    const result = await window.appApi.selectOnnxFile();
    if (!result.canceled && result.filePath) {
      onnxPath.value = result.filePath;
    }
  });

  saveSettings.addEventListener('click', async () => {
    try {
      const result = await persistSettings(collectSettingsForm());
      updateStartButtonStatus();

      if (!result.ok) {
        setServiceErrorView(result.errors || []);
        window.alert('保存设置成功，但服务启动失败，请查看当前弹窗中的详细错误信息。');
        return;
      }

      clearServiceErrorView();
      hideSettingsModal();
    } catch (error) {
      setServiceErrorView([
        {
          target: 'system',
          summary: `保存设置失败：${error.message}`,
          details: error.stack || error.message
        }
      ]);
      updateStartButtonStatus();
      window.alert(`保存设置失败：${error.message}`);
    }
  });

  saveDeveloperSettings.addEventListener('click', async () => {
    try {
      const result = await persistSettings(collectDeveloperForm());
      updateStartButtonStatus();
      if (!result.ok) {
        window.alert('开发者设置已保存，但当前服务状态存在错误，请查看设置界面的详细错误信息。');
        return;
      }
      hideDeveloperModal();
    } catch (error) {
      window.alert(`保存开发者设置失败：${error.message}`);
    }
  });

  btnBackendAdvanced.addEventListener('click', () => {
    void openServicePage(appMeta.urls.developerAbout);
  });

  window.appApi.onCliLog(({ target, line }) => {
    appendLogToView(target, line);
  });

  window.appApi.onCliState((state) => {
    frontendRunning = !!state.frontendRunning;
    backendRunning = !!state.backendRunning;
    frontendStatus = state.frontendStatus || 'stopped';
    backendStatus = state.backendStatus || 'stopped';
    syncErrorStateFromState(state);
    updateStartButtonStatus();
  });
}

bootstrap();