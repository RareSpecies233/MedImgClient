const developerFrontendArgs = document.getElementById('developerFrontendArgs');
const developerBackendArgs = document.getElementById('developerBackendArgs');
const frontendLogs = document.getElementById('frontendLogs');
const backendLogs = document.getElementById('backendLogs');
const saveDeveloperSettings = document.getElementById('saveDeveloperSettings');
const btnBackendAdvanced = document.getElementById('btnBackendAdvanced');

const btnMin = document.getElementById('btnMin');
const btnMax = document.getElementById('btnMax');
const btnClose = document.getElementById('btnClose');

let settings = {
  frontendExtraArgs: '',
  backendExtraArgs: '',
  port: 3000
};

function appendLog(target, line) {
  if (target === 'frontend') {
    frontendLogs.value += `${line}\n`;
    frontendLogs.scrollTop = frontendLogs.scrollHeight;
    return;
  }

  backendLogs.value += `${line}\n`;
  backendLogs.scrollTop = backendLogs.scrollHeight;
}

function applySettings(nextSettings) {
  settings = {
    ...settings,
    ...nextSettings
  };

  developerFrontendArgs.value = settings.frontendExtraArgs || '';
  developerBackendArgs.value = settings.backendExtraArgs || '';
}

function setupWindowControls() {
  document.body.classList.add(`platform-${window.appApi.platform}`);
  btnMin.addEventListener('click', () => window.appApi.windowControl.minimize());
  btnMax.addEventListener('click', () => window.appApi.windowControl.maximizeToggle());
  btnClose.addEventListener('click', () => window.appApi.windowControl.close());
}

async function bootstrap() {
  setupWindowControls();

  const initial = await window.appApi.getSettings();
  applySettings(initial.settings);
  frontendLogs.value = (initial.logs.frontend || []).join('\n');
  backendLogs.value = (initial.logs.backend || []).join('\n');

  saveDeveloperSettings.addEventListener('click', async () => {
    try {
      await window.appApi.saveSettings({
        ...settings,
        frontendExtraArgs: developerFrontendArgs.value.trim(),
        backendExtraArgs: developerBackendArgs.value.trim()
      });
      window.alert('开发者设置已保存。');
    } catch (error) {
      window.alert(`保存开发者设置失败：${error.message}`);
    }
  });

  btnBackendAdvanced.addEventListener('click', () => {
    void window.appApi.openExternal(`http://localhost:${settings.port}/client/about`);
  });

  window.appApi.onCliLog(({ target, line }) => {
    appendLog(target, line);
  });

  window.appApi.onCliState(() => {
    void window.appApi.getSettings().then((next) => {
      applySettings(next.settings);
    });
  });
}

bootstrap();