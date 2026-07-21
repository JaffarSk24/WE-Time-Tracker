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
