// WE Time Tracker Settings Module
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';

export function initSettings() {
  const langSelect = document.getElementById('settings-lang-select');
  const backupBtn = document.getElementById('settings-backup-btn');
  const importBtn = document.getElementById('settings-import-btn');
  const importInput = document.getElementById('settings-import-input');
  const clearBtn = document.getElementById('settings-clear-btn');
  
  // Set initial language selection
  const currentLang = store.getSettings().language;
  langSelect.value = currentLang;
  
  // Language Change Listener
  langSelect.addEventListener('change', (e) => {
    store.updateSettings({ language: e.target.value });
  });

  const themeSelect = document.getElementById('settings-theme-select');
  const currentTheme = store.getSettings().theme || 'dark';
  themeSelect.value = currentTheme;
  
  document.documentElement.setAttribute('data-theme', currentTheme);
  
  themeSelect.addEventListener('change', (e) => {
    const selectedTheme = e.target.value;
    store.updateSettings({ theme: selectedTheme });
    document.documentElement.setAttribute('data-theme', selectedTheme);
  });
  
  // Backup Button Click
  backupBtn.addEventListener('click', () => {
    store.exportData();
  });
  
  // Import Button click triggers hidden file input
  importBtn.addEventListener('click', () => {
    importInput.click();
  });
  
  // File Import Listener
  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        const result = store.importData(data);
        
        if (result && result.success) {
          showToast(t('import-success'), { type: 'success' });
          // reload the page to refresh charts and everything clean
          setTimeout(() => window.location.reload(), 800);
        } else {
          showToast(t('import-failed') + (result.error || ''), { type: 'error' });
        }
      } catch (err) {
        showToast(t('json-read-error') + err.message, { type: 'error' });
      }
      importInput.value = ''; // clear input
    };
    
    reader.readAsText(file);
  });
  
  // Clear Database Click
  clearBtn.addEventListener('click', () => {
    if (confirm(t('settings-clear-confirm'))) {
      store.clearAllData();
      showToast(t('all-data-cleared'), { type: 'info' });
      setTimeout(() => window.location.reload(), 800);
    }
  });

  initUpdates();
  initGDrive();
}

// Google Drive sync — desktop build only (window.weGDrive present).
function initGDrive() {
  const section = document.getElementById('settings-gdrive-section');
  if (!section || !window.weGDrive) return;

  const statusTitle = document.getElementById('gdrive-status-title');
  const statusDetail = document.getElementById('gdrive-status-detail');
  const loginBtn = document.getElementById('gdrive-login-btn');
  const logoutBtn = document.getElementById('gdrive-logout-btn');
  const syncBtn = document.getElementById('gdrive-sync-btn');

  const formatSync = (iso) => {
    if (!iso) return t('gdrive-never-synced');
    const lang = store.getSettings().language;
    const d = new Date(iso);
    return t('gdrive-last-sync') + d.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');
  };

  const render = (status) => {
    if (!status) return;
    // Builds without a bundled OAuth client hide the feature entirely.
    section.style.display = status.configured ? 'block' : 'none';
    loginBtn.style.display = status.loggedIn ? 'none' : 'inline-flex';
    logoutBtn.style.display = status.loggedIn ? 'inline-flex' : 'none';
    syncBtn.style.display = status.loggedIn ? 'inline-flex' : 'none';

    if (status.loggedIn) {
      statusTitle.textContent = t('gdrive-signed-in-as') + status.email;
      statusDetail.textContent = formatSync(status.lastSync);
    } else {
      statusTitle.textContent = t('gdrive-desc');
      statusDetail.textContent = '';
    }
    if (window.lucide) window.lucide.createIcons();
  };

  window.weGDrive.getStatus().then(render);
  window.weGDrive.onStatus(render);

  // Cloud data replaced the local file: reload so the UI cannot overwrite it
  // with the stale state it still holds in memory.
  window.weGDrive.onPulled((info) => {
    showToast(info && info.conflict ? t('gdrive-conflict') : t('gdrive-pulled'), {
      type: info && info.conflict ? 'info' : 'success',
      duration: info && info.conflict ? 9000 : 4000
    });
    setTimeout(() => window.location.reload(), info && info.conflict ? 2500 : 1200);
  });

  loginBtn.addEventListener('click', async () => {
    loginBtn.disabled = true;
    const res = await window.weGDrive.login();
    loginBtn.disabled = false;
    if (res.ok) {
      showToast(t('gdrive-synced'), { type: 'success' });
      render(res.status);
      await window.weGDrive.sync();
    } else if (res.error !== 'timeout') {
      showToast(t('gdrive-login-failed') + (res.error || ''), { type: 'error' });
    }
  });

  logoutBtn.addEventListener('click', async () => {
    const res = await window.weGDrive.logout();
    showToast(t('gdrive-logged-out'), { type: 'info' });
    render(res.status);
  });

  syncBtn.addEventListener('click', async () => {
    const label = syncBtn.querySelector('span');
    const original = label.textContent;
    syncBtn.disabled = true;
    label.textContent = t('gdrive-syncing');
    const res = await window.weGDrive.sync();
    syncBtn.disabled = false;
    label.textContent = original;

    if (!res.ok) {
      // An expired or revoked token already cleared itself; ask for a new sign-in
      // instead of repeating a raw API message.
      showToast(res.reauth ? t('gdrive-reauth') : t('gdrive-sync-failed') + (res.error || ''),
        { type: res.reauth ? 'info' : 'error', duration: res.reauth ? 7000 : 4500 });
    } else if (res.upToDate) {
      showToast(t('gdrive-up-to-date'), { type: 'info' });
    } else if (res.pushed) {
      showToast(t('gdrive-synced'), { type: 'success' });
    }
    // A successful pull reports itself through onPulled (with a reload).
  });
}

// Check/download updates — desktop build only (window.weUpdates present)
function initUpdates() {
  const section = document.getElementById('settings-update-section');
  if (!section || !window.weUpdates) return;

  section.style.display = 'block';

  const btn = document.getElementById('settings-update-btn');
  const btnLabel = document.getElementById('settings-update-btn-label');
  const status = document.getElementById('settings-update-status');
  const detail = document.getElementById('settings-update-detail');

  let pendingUrl = null;

  window.weUpdates.onProgress((p) => {
    btnLabel.textContent = `${t('update-downloading')} ${Math.round(p * 100)}%`;
  });

  btn.addEventListener('click', async () => {
    // Second button mode — download the found update
    if (pendingUrl) {
      btn.disabled = true;
      btnLabel.textContent = t('update-downloading');
      const res = await window.weUpdates.download(pendingUrl);
      btn.disabled = false;
      if (res.ok) {
        status.textContent = t('update-open-hint');
        btnLabel.textContent = t('update-download');
      } else {
        showToast(t('update-error') + (res.error ? `: ${res.error}` : ''), { type: 'error' });
        btnLabel.textContent = t('update-download');
      }
      return;
    }

    // First mode — check for an available update
    btn.disabled = true;
    btnLabel.textContent = t('update-checking');
    detail.textContent = '';
    const res = await window.weUpdates.check();
    btn.disabled = false;

    if (!res.ok) {
      status.textContent = t('update-error');
      detail.textContent = res.error || '';
      btnLabel.textContent = t('update-check');
      return;
    }

    if (res.available) {
      pendingUrl = res.downloadUrl;
      status.textContent = `${t('update-available')}: v${res.latest}`;
      detail.textContent = `${t('current-label')}: v${res.current}`;
      btnLabel.textContent = t('update-download');
    } else {
      status.textContent = t('update-current');
      detail.textContent = `v${res.current}`;
      btnLabel.textContent = t('update-check');
    }
  });
}
