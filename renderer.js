const tabsContainer = document.getElementById('tabsContainer');
const tabPages = document.getElementById('tabPages');
const homeView = document.getElementById('homeView');

const btnStart = document.getElementById('btnStart');
const btnSettings = document.getElementById('btnSettings');
const cliStatusText = document.getElementById('cliStatusText');

const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const saveSettings = document.getElementById('saveSettings');

const frontendCliPath = document.getElementById('frontendCliPath');
const frontendCliArgs = document.getElementById('frontendCliArgs');
const backendCliPath = document.getElementById('backendCliPath');
const backendCliArgs = document.getElementById('backendCliArgs');
const enableGuard = document.getElementById('enableGuard');
const newTabDefaultUrl = document.getElementById('newTabDefaultUrl');
const startButtonUrl = document.getElementById('startButtonUrl');
const frontendLogs = document.getElementById('frontendLogs');
const backendLogs = document.getElementById('backendLogs');

const btnMin = document.getElementById('btnMin');
const btnMax = document.getElementById('btnMax');
const btnClose = document.getElementById('btnClose');

let settings = {
  frontendCliPath: '',
  frontendCliArgs: '',
  backendCliPath: '',
  backendCliArgs: '',
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

function updateStartButtonStatus() {
  const ready = frontendRunning && backendRunning;
  btnStart.disabled = !ready;
  btnStart.textContent = ready ? '开始使用' : '正在启动中';
  cliStatusText.textContent = ready
    ? '前后端 CLI 均已启动，可以开始使用。'
    : '正在启动中，请等待前后端 CLI 就绪...';
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

function addNewTab() {
  const id = `tab-${Date.now()}-${tabCounter}`;
  const title = `标签页${tabCounter}`;
  tabCounter += 1;

  const tab = {
    id,
    title,
    type: 'web',
    closable: true,
    url: settings.newTabDefaultUrl || 'https://www.example.com'
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
  frontendCliPath.value = settings.frontendCliPath || '';
  frontendCliArgs.value = settings.frontendCliArgs || '';
  backendCliPath.value = settings.backendCliPath || '';
  backendCliArgs.value = settings.backendCliArgs || '';
  enableGuard.checked = !!settings.enableGuard;
  newTabDefaultUrl.value = settings.newTabDefaultUrl || '';
  startButtonUrl.value = settings.startButtonUrl || '';
}

function collectSettingsForm() {
  return {
    frontendCliPath: frontendCliPath.value.trim(),
    frontendCliArgs: frontendCliArgs.value.trim(),
    backendCliPath: backendCliPath.value.trim(),
    backendCliArgs: backendCliArgs.value.trim(),
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

  frontendLogs.value = (initial.logs.frontend || []).join('\n');
  backendLogs.value = (initial.logs.backend || []).join('\n');

  frontendRunning = !!initial.state.frontendRunning;
  backendRunning = !!initial.state.backendRunning;
  updateStartButtonStatus();

  btnStart.addEventListener('click', async () => {
    if (!frontendRunning || !backendRunning) return;
    await window.appApi.openStartUrl();
  });

  btnSettings.addEventListener('click', showSettingsModal);
  closeSettings.addEventListener('click', hideSettingsModal);
  settingsModal.addEventListener('click', (event) => {
    if (event.target === settingsModal) hideSettingsModal();
  });

  saveSettings.addEventListener('click', async () => {
    const payload = collectSettingsForm();
    const result = await window.appApi.saveSettings(payload);
    settings = result.settings;
    hideSettingsModal();
  });

  window.appApi.onCliLog(({ target, line }) => {
    appendLogToView(target, line);
  });

  window.appApi.onCliState((state) => {
    frontendRunning = !!state.frontendRunning;
    backendRunning = !!state.backendRunning;
    updateStartButtonStatus();
  });
}

bootstrap();