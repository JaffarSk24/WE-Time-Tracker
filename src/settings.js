// WE Time Tracker Settings Module
import { store } from './store.js';
import { t } from './i18n.js';

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
          alert(isRu ? 'Данные успешно импортированы!' : 'Data successfully imported!');
          // reload the page to refresh charts and everything clean
          window.location.reload();
        } else {
          alert((isRu ? 'Не удалось импортировать данные: ' : 'Failed to import data: ') + (result.error || ''));
        }
      } catch (err) {
        alert((isRu ? 'Ошибка чтения файла JSON: ' : 'Error reading JSON file: ') + err.message);
      }
      importInput.value = ''; // clear input
    };
    
    reader.readAsText(file);
  });
  
  // Clear Database Click
  clearBtn.addEventListener('click', () => {
    if (confirm(t('settings-clear-confirm'))) {
      store.clearAllData();
      alert(store.getSettings().language === 'ru' ? 'Все данные стерты!' : 'All data cleared!');
      window.location.reload();
    }
  });
}
