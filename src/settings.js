// WE Time Tracker Settings Module
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import {
  updateState, updateStatusText, onUpdateChange,
  checkForUpdates, downloadUpdate, installUpdate
} from './updates.js';

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

  initUpdatesSection();
  initGDrive();
}

// Sign-in used by both the Settings section and the first-run banner.
export async function signInToGDrive() {
  if (!window.weGDrive) return { ok: false, error: 'not_available' };
  const res = await window.weGDrive.login();
  if (res.ok) {
    showToast(t('gdrive-synced'), { type: 'success' });
    await window.weGDrive.sync();
  } else if (res.scopeDenied) {
    showToast(t('gdrive-scope-denied'), { type: 'error', duration: 10000 });
  } else if (res.error !== 'timeout') {
    showToast(t('gdrive-login-failed') + (res.error || ''), { type: 'error' });
  }
  return res;
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
    } else if (status.signInNeeded) {
      // Sync was on and broke: say so here too, so Settings and the banner
      // never tell the user two different things.
      statusTitle.textContent = t('gdrive-sign-in-needed');
      statusDetail.textContent = status.signInNeeded.reason === 'drive_scope'
        ? t('sync-banner-scope')
        : t('sync-banner-expired');
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
    const res = await signInToGDrive();
    loginBtn.disabled = false;
    if (res.ok) render(res.status);
  });

  logoutBtn.addEventListener('click', async () => {
    const res = await window.weGDrive.logout();
    showToast(t('gdrive-logged-out'), { type: 'info' });
    render(res.status);
  });

  // The bundled OAuth client changed, so the cloud folder is a different one.
  // Nothing is overwritten until the user says which copy to keep.
  const clientModal = document.getElementById('gdrive-client-modal');
  const askWhichCopy = () => {
    if (!clientModal) return;
    clientModal.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
  };
  const closeClientModal = () => clientModal && clientModal.classList.remove('active');
  const adopt = async (choice) => {
    closeClientModal();
    const res = await window.weGDrive.adoptClient(choice);
    if (!res.ok) {
      showToast(t('gdrive-sync-failed') + (res.error || ''), { type: 'error' });
    } else if (res.pushed) {
      showToast(t('gdrive-synced'), { type: 'success' });
    }
    // A pull reports itself through onPulled (with a reload).
  };
  if (clientModal) {
    document.getElementById('gdrive-client-modal-close').addEventListener('click', closeClientModal);
    document.getElementById('gdrive-client-use-local').addEventListener('click', () => adopt('local'));
    document.getElementById('gdrive-client-use-cloud').addEventListener('click', () => adopt('cloud'));
  }

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
      let message = t('gdrive-sync-failed') + (res.error || '');
      let type = 'error';
      let duration = 4500;
      if (res.clientChanged) {
        askWhichCopy();
        return;
      }
      if (res.scopeDenied) {
        message = t('gdrive-scope-denied');
        duration = 10000;
      } else if (res.reauth) {
        message = t('gdrive-reauth');
        type = 'info';
        duration = 7000;
      }
      showToast(message, { type, duration });
    } else if (res.upToDate) {
      showToast(t('gdrive-up-to-date'), { type: 'info' });
    } else if (res.pushed) {
      showToast(t('gdrive-synced'), { type: 'success' });
    }
    // A successful pull reports itself through onPulled (with a reload).
  });
}

// Check, download and install updates; desktop build only (window.weUpdates present).
// The state lives in updates.js, shared with the banner above the views.
function initUpdatesSection() {
  const section = document.getElementById('settings-update-section');
  if (!section || !window.weUpdates) return;

  section.style.display = 'block';

  const btn = document.getElementById('settings-update-btn');
  const btnLabel = document.getElementById('settings-update-btn-label');
  const status = document.getElementById('settings-update-status');
  const detail = document.getElementById('settings-update-detail');

  const canDownload = () => {
    const r = updateState.last;
    return updateState.phase === 'idle' && Boolean(r && r.ok && r.available);
  };

  const render = () => {
    const r = updateState.last;
    const busy = ['checking', 'downloading', 'installing'].includes(updateState.phase);
    btn.disabled = busy;
    status.textContent = updateStatusText();
    if (updateState.phase === 'downloading') {
      btnLabel.textContent = updateStatusText();
    } else if (updateState.phase === 'ready') {
      btnLabel.textContent = t('update-install');
    } else if (canDownload()) {
      btnLabel.textContent = t('update-download');
    } else {
      btnLabel.textContent = t('update-check');
    }
    if (!r) {
      detail.textContent = '';
    } else if (!r.ok) {
      detail.textContent = r.error || '';
    } else {
      detail.textContent = `${t('current-label')}: v${r.current}`;
    }
  };

  btn.addEventListener('click', async () => {
    if (updateState.phase === 'ready') {
      const res = await installUpdate();
      if (!res.ok) showToast(t('update-install-error') + (res.error ? `: ${res.error}` : ''), { type: 'error' });
      return;
    }
    if (canDownload()) {
      const res = await downloadUpdate();
      if (!res.ok) showToast(t('update-error') + (res.error ? `: ${res.error}` : ''), { type: 'error' });
      return;
    }
    const res = await checkForUpdates();
    if (res && !res.ok) showToast(t('update-error'), { type: 'error' });
  });

  onUpdateChange(render);
  render();
}
