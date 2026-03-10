const tabsContainer = document.getElementById('tabsContainer');
const tabPages = document.getElementById('tabPages');
const homeView = document.getElementById('homeView');

const btnStart = document.getElementById('btnStart');
const btnSettings = document.getElementById('btnSettings');
const cliStatusText = document.getElementById('cliStatusText');

const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const saveSettings = document.getElementById('saveSettings');

const enableFrontendService = document.getElementById('enableFrontendService');
const frontendCliPath = document.getElementById('frontendCliPath');
const frontendCliArgs = document.getElementById('frontendCliArgs');
const enableBackendService = document.getElementById('enableBackendService');
const backendCliPath = document.getElementById('backendCliPath');
const backendCliArgs = document.getElementById('backendCliArgs');
const autoStartServices = document.getElementById('autoStartServices');
const enableGuard = document.getElementById('enableGuard');
const newTabDefaultUrl = document.getElementById('newTabDefaultUrl');
const startButtonUrl = document.getElementById('startButtonUrl');
const serviceErrorPanel = document.getElementById('serviceErrorPanel');
const serviceErrorSummary = document.getElementById('serviceErrorSummary');
const serviceErrorDetails = document.getElementById('serviceErrorDetails');
const frontendLogs = document.getElementById('frontendLogs');
const backendLogs = document.getElementById('backendLogs');

const btnMin = document.getElementById('btnMin');
const btnMax = document.getElementById('btnMax');
const btnClose = document.getElementById('btnClose');

let settings = {
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

function applySettingsToFormState() {
  enableBackendService.checked = !!settings.enableBackendService;
  enableFrontendService.checked = !!settings.enableFrontendService;
  enableFrontendService.disabled = !settings.enableBackendService;
  autoStartServices.checked = !!settings.autoStartServices;
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

function getStartTargetUrl() {
  return settings.startButtonUrl || settings.newTabDefaultUrl || 'https://www.example.com';
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

async function enableServicesFromPrompt() {
  const nextSettings = {
    ...settings,
    enableBackendService: true,
    enableFrontendService: true
  };

  const saved = await window.appApi.saveSettings(nextSettings);
  settings = saved.settings;
  applySettingsToFormState();

  return window.appApi.startServices();
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
  const title = '新标签页';
  tabCounter += 1;

  const tab = {
    id,
    title,
    type: 'web',
    closable: true,
    url: initialUrl || settings.newTabDefaultUrl || 'https://www.example.com'
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
  addBtn.addEventListener('click', addNewTab);
  tabsContainer.appendChild(addBtn);
}

function fillSettingsForm() {
  enableFrontendService.checked = !!settings.enableFrontendService;
  enableFrontendService.disabled = !settings.enableBackendService;
  frontendCliPath.value = settings.frontendCliPath || '';
  frontendCliArgs.value = settings.frontendCliArgs || '';
  enableBackendService.checked = !!settings.enableBackendService;
  backendCliPath.value = settings.backendCliPath || '';
  backendCliArgs.value = settings.backendCliArgs || '';
  autoStartServices.checked = !!settings.autoStartServices;
  enableGuard.checked = !!settings.enableGuard;
  newTabDefaultUrl.value = settings.newTabDefaultUrl || '';
  startButtonUrl.value = settings.startButtonUrl || '';
}

function collectSettingsForm() {
  return {
    enableFrontendService: enableFrontendService.checked,
    frontendCliPath: frontendCliPath.value.trim(),
    frontendCliArgs: frontendCliArgs.value.trim(),
    enableBackendService: enableBackendService.checked,
    backendCliPath: backendCliPath.value.trim(),
    backendCliArgs: backendCliArgs.value.trim(),
    autoStartServices: autoStartServices.checked,
    enableGuard: enableGuard.checked,
    newTabDefaultUrl: newTabDefaultUrl.value.trim(),
    startButtonUrl: startButtonUrl.value.trim()
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
  fillSettingsForm();
  settingsModal.classList.remove('hidden');
}

function hideSettingsModal() {
  settingsModal.classList.add('hidden');
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

async function bootstrap() {
  renderTabs();
  switchTab('home');
  setupWindowControls();

  const initial = await window.appApi.getSettings();
  settings = initial.settings;
  applySettingsToFormState();

  frontendLogs.value = (initial.logs.frontend || []).join('\n');
  backendLogs.value = (initial.logs.backend || []).join('\n');

  frontendRunning = !!initial.state.frontendRunning;
  backendRunning = !!initial.state.backendRunning;
  frontendStatus = initial.state.frontendStatus || 'stopped';
  backendStatus = initial.state.backendStatus || 'stopped';
  syncErrorStateFromState(initial.state);
  updateStartButtonStatus();

  btnStart.addEventListener('click', async () => {
    if (areRequiredServicesReady()) {
      addNewTab(getStartTargetUrl());
      return;
    }

    const shouldStart = window.confirm('检测到服务未启动，是否现在启用前后端服务并打开新标签页？');
    if (!shouldStart) return;

    manualStartInProgress = true;
    clearServiceErrorView();
    updateStartButtonStatus();

    try {
      const result = await enableServicesFromPrompt();
      frontendRunning = !!result.state.frontendRunning;
      backendRunning = !!result.state.backendRunning;
      frontendStatus = result.state.frontendStatus || 'stopped';
      backendStatus = result.state.backendStatus || 'stopped';
      syncErrorStateFromState(result.state);

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

      addNewTab(getStartTargetUrl());
    } catch (error) {
      window.alert(`启动服务失败：${error.message}`);
      setServiceErrorView([
        {
          target: 'system',
          summary: `启动服务失败：${error.message}`,
          details: error.stack || error.message
        }
      ]);
      showSettingsModal();
    } finally {
      manualStartInProgress = false;
      updateStartButtonStatus();
    }
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

  saveSettings.addEventListener('click', async () => {
    const payload = collectSettingsForm();
    if (!payload.enableBackendService) {
      payload.enableFrontendService = false;
    }
    const result = await window.appApi.saveSettings(payload);
    settings = result.settings;
    applySettingsToFormState();
    clearServiceErrorView();
    updateStartButtonStatus();
    hideSettingsModal();
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