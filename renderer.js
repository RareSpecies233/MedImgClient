const tabsContainer = document.getElementById('tabsContainer');
const tabPages = document.getElementById('tabPages');
const homeView = document.getElementById('homeView');

const btnStart = document.getElementById('btnStart');
const btnSettings = document.getElementById('btnSettings');
const btnQuickPreprocess = document.getElementById('btnQuickPreprocess');
const btnQuickAnalysis = document.getElementById('btnQuickAnalysis');
const btnQuickReconstruction = document.getElementById('btnQuickReconstruction');
const btnQuickConsult = document.getElementById('btnQuickConsult');
const cliStatusText = document.getElementById('cliStatusText');
const lanAccessLink = document.getElementById('lanAccessLink');
const lanAddressText = document.getElementById('lanAddressText');

const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const saveSettings = document.getElementById('saveSettings');
const openDeveloperMode = document.getElementById('openDeveloperMode');
const resetDatabase = document.getElementById('resetDatabase');
const frontendRuntimeStatus = document.getElementById('frontendRuntimeStatus');
const backendRuntimeStatus = document.getElementById('backendRuntimeStatus');
const toggleFrontendRuntime = document.getElementById('toggleFrontendRuntime');
const toggleBackendRuntime = document.getElementById('toggleBackendRuntime');

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
  urls: {
    start: '',
    quickPreprocess: '',
    quickAnalysis: '',
    quickReconstruction: '',
    quickConsult: '',
    lanAccess: '',
    lanPlaceholder: ''
  },
  platform: ''
};

let cliLogs = {
  frontend: [],
  backend: []
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
    urls: {
      ...appMeta.urls,
      ...(meta.urls || {})
    }
  };

  lanAddressText.textContent = appMeta.urls.lanPlaceholder || 'http://本机局ip:3000';
  lanAccessLink.dataset.url = appMeta.urls.lanAccess || '';
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
}

function getRuntimeStatusLabel(target) {
  const running = target === 'frontend' ? frontendRunning : backendRunning;
  return running ? '已启动' : '未启动';
}

function updateServiceRuntimeControls() {
  frontendRuntimeStatus.textContent = getRuntimeStatusLabel('frontend');
  backendRuntimeStatus.textContent = getRuntimeStatusLabel('backend');

  frontendRuntimeStatus.classList.toggle('running', frontendRunning);
  backendRuntimeStatus.classList.toggle('running', backendRunning);

  toggleFrontendRuntime.textContent = frontendRunning ? '停止前端服务' : '启动前端服务';
  toggleBackendRuntime.textContent = backendRunning ? '停止后端服务' : '启动后端服务';
}

async function handleRuntimeToggle(target) {
  try {
    const running = target === 'frontend' ? frontendRunning : backendRunning;
    const action = running ? 'stop' : 'start';
    const result = await window.appApi.controlService(action, target);

    settings = result.settings || settings;
    applyMeta(result.meta || {});
    applySettingsToFormState();
    frontendRunning = !!result.state.frontendRunning;
    backendRunning = !!result.state.backendRunning;
    frontendStatus = result.state.frontendStatus || 'stopped';
    backendStatus = result.state.backendStatus || 'stopped';
    syncErrorStateFromState(result.state);
    updateServiceRuntimeControls();
    updateStartButtonStatus();
    syncDeveloperTabState();

    if (!result.ok) {
      window.alert('服务操作失败，请查看设置中的错误详情。');
    }
  } catch (error) {
    window.alert(`服务操作失败：${error.message}`);
  }
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

function getDeveloperTab() {
  return tabs.find((item) => item.type === 'developer') || null;
}

function applyDeveloperContent(page) {
  if (!page) return;

  page.innerHTML = `
    <section class="developer-tab-shell">
      <div class="developer-toolbar">
        <button type="button" class="secondary-action" data-action="advanced">后端高级设置</button>
        <button type="button" data-action="save">保存开发者设置</button>
      </div>
      <div class="developer-compact-grid">
        <div class="setting-group">
          <label>前端附加参数</label>
          <textarea id="developerFrontendArgs-${page.dataset.tabId}" placeholder="会附加在 --port 和 --apiport 后面">${settings.frontendExtraArgs || ''}</textarea>
        </div>
        <div class="setting-group">
          <label>后端附加参数</label>
          <textarea id="developerBackendArgs-${page.dataset.tabId}" placeholder="会附加在 --apiport、--onnx、--model_type 后面">${settings.backendExtraArgs || ''}</textarea>
        </div>
      </div>
      <div class="developer-log-grid">
        <div>
          <h3>前端 CLI 输出</h3>
          <textarea id="developerFrontendLogs-${page.dataset.tabId}" readonly></textarea>
        </div>
        <div>
          <h3>后端 CLI 输出</h3>
          <textarea id="developerBackendLogs-${page.dataset.tabId}" readonly></textarea>
        </div>
      </div>
    </section>
  `;

  const frontendArgs = page.querySelector(`#developerFrontendArgs-${page.dataset.tabId}`);
  const backendArgs = page.querySelector(`#developerBackendArgs-${page.dataset.tabId}`);
  const frontendLogs = page.querySelector(`#developerFrontendLogs-${page.dataset.tabId}`);
  const backendLogs = page.querySelector(`#developerBackendLogs-${page.dataset.tabId}`);

  frontendLogs.value = cliLogs.frontend.join('\n');
  backendLogs.value = cliLogs.backend.join('\n');

  page.querySelector('[data-action="advanced"]').addEventListener('click', () => {
    void window.appApi.openExternal(`http://localhost:${settings.port}/client/about`);
  });

  page.querySelector('[data-action="save"]').addEventListener('click', async () => {
    try {
      const result = await persistSettings({
        frontendExtraArgs: frontendArgs.value.trim(),
        backendExtraArgs: backendArgs.value.trim()
      });
      updateStartButtonStatus();
      if (!result.ok) {
        window.alert('开发者设置已保存，但当前服务状态存在错误，请查看设置界面的详细错误信息。');
        return;
      }
      window.alert('开发者设置已保存。');
    } catch (error) {
      window.alert(`保存开发者设置失败：${error.message}`);
    }
  });
}

function syncDeveloperTabState() {
  const developerTab = getDeveloperTab();
  if (!developerTab) return;

  const page = document.getElementById(`page-${developerTab.id}`);
  if (!page) return;

  const frontendArgs = page.querySelector(`#developerFrontendArgs-${developerTab.id}`);
  const backendArgs = page.querySelector(`#developerBackendArgs-${developerTab.id}`);
  const frontendLogs = page.querySelector(`#developerFrontendLogs-${developerTab.id}`);
  const backendLogs = page.querySelector(`#developerBackendLogs-${developerTab.id}`);

  if (frontendArgs && document.activeElement !== frontendArgs) {
    frontendArgs.value = settings.frontendExtraArgs || '';
  }
  if (backendArgs && document.activeElement !== backendArgs) {
    backendArgs.value = settings.backendExtraArgs || '';
  }
  if (frontendLogs) {
    frontendLogs.value = cliLogs.frontend.join('\n');
    frontendLogs.scrollTop = frontendLogs.scrollHeight;
  }
  if (backendLogs) {
    backendLogs.value = cliLogs.backend.join('\n');
    backendLogs.scrollTop = backendLogs.scrollHeight;
  }
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
  const page = document.createElement('section');
  page.className = 'tab-page';
  page.id = `page-${tab.id}`;
  page.dataset.tabId = tab.id;

  if (tab.type === 'developer') {
    applyDeveloperContent(page);
    tabPages.appendChild(page);
    return;
  }

  if (tab.type !== 'web') return;

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

  const activeTab = tabs.find((item) => item.id === tabId);
  if (activeTab && activeTab.type === 'developer') {
    syncDeveloperTabState();
  }

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

function openDeveloperTab() {
  const existing = getDeveloperTab();
  if (existing) {
    switchTab(existing.id);
    return;
  }

  const id = `tab-developer-${Date.now()}`;
  const tab = {
    id,
    title: '开发者模式',
    type: 'developer',
    closable: true
  };

  tabs.push(tab);
  createTabPage(tab);
  switchTab(tab.id);
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

function showSettingsModal() {
  applySettingsToFormState();
  settingsModal.classList.remove('hidden');
}

function hideSettingsModal() {
  settingsModal.classList.add('hidden');
}

function setupWindowControls() {
  document.body.classList.add(`platform-${window.appApi.platform}`);

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
  cliLogs.frontend = [...(initial.logs.frontend || [])];
  cliLogs.backend = [...(initial.logs.backend || [])];

  frontendRunning = !!initial.state.frontendRunning;
  backendRunning = !!initial.state.backendRunning;
  frontendStatus = initial.state.frontendStatus || 'stopped';
  backendStatus = initial.state.backendStatus || 'stopped';
  syncErrorStateFromState(initial.state);
  updateServiceRuntimeControls();
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

  openDeveloperMode.addEventListener('click', async () => {
    hideSettingsModal();
    openDeveloperTab();
  });

  toggleFrontendRuntime.addEventListener('click', () => {
    void handleRuntimeToggle('frontend');
  });

  toggleBackendRuntime.addEventListener('click', () => {
    void handleRuntimeToggle('backend');
  });

  resetDatabase.addEventListener('click', async () => {
    const confirmed = window.confirm('重置数据库后会丢失所有数据，是否继续？');
    if (!confirmed) return;

    try {
      const result = await window.appApi.resetDatabase();
      frontendRunning = !!result.state.frontendRunning;
      backendRunning = !!result.state.backendRunning;
      frontendStatus = result.state.frontendStatus || 'stopped';
      backendStatus = result.state.backendStatus || 'stopped';
      syncErrorStateFromState(result.state);
      updateStartButtonStatus();
      window.alert('数据库已重置。');
    } catch (error) {
      window.alert(`重置数据库失败：${error.message}`);
    }
  });

  window.appApi.onCliState((state) => {
    frontendRunning = !!state.frontendRunning;
    backendRunning = !!state.backendRunning;
    frontendStatus = state.frontendStatus || 'stopped';
    backendStatus = state.backendStatus || 'stopped';
    syncErrorStateFromState(state);
    updateServiceRuntimeControls();
    updateStartButtonStatus();
    syncDeveloperTabState();
  });

  window.appApi.onCliLog(({ target, line }) => {
    if (!Array.isArray(cliLogs[target])) {
      cliLogs[target] = [];
    }
    cliLogs[target].push(line);
    if (cliLogs[target].length > 500) {
      cliLogs[target].shift();
    }
    syncDeveloperTabState();
  });
}

bootstrap();