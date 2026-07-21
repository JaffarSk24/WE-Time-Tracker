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
    
    const isRu = store.getSettings().language === 'ru';
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        const result = store.importData(data);
        
        if (result && result.success) {
          showToast(isRu ? 'Данные успешно импортированы!' : 'Data successfully imported!', { type: 'success' });
          // reload the page to refresh charts and everything clean
          setTimeout(() => window.location.reload(), 800);
        } else {
          showToast((isRu ? 'Не удалось импортировать данные: ' : 'Failed to import data: ') + (result.error || ''), { type: 'error' });
        }
      } catch (err) {
        showToast((isRu ? 'Ошибка чтения файла JSON: ' : 'Error reading JSON file: ') + err.message, { type: 'error' });
      }
      importInput.value = ''; // clear input
    };
    
    reader.readAsText(file);
  });
  
  // Clear Database Click
  clearBtn.addEventListener('click', () => {
    if (confirm(t('settings-clear-confirm'))) {
      store.clearAllData();
      showToast(store.getSettings().language === 'ru' ? 'Все данные стерты!' : 'All data cleared!', { type: 'info' });
      setTimeout(() => window.location.reload(), 800);
    }
  });
}
