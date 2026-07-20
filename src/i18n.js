// WE Time Tracker i18n Localization Support

import { store } from './store.js';

export const translations = {
  ru: {
    // Sidebar
    'nav-dashboard': 'Дашборд',
    'nav-timer': 'Таймер',
    'nav-clients': 'Клиенты & Проекты',
    'nav-reports': 'Отчеты & Логи',
    'nav-settings': 'Настройки',

    // Timer
    'timer-placeholder': 'Над чем вы работаете в данный момент?',
    'timer-client-placeholder': 'Выберите клиента',
    'timer-project-placeholder': 'Выберите проект (опционально)',
    'timer-billable': 'Оплачиваемый',
    'timer-start': 'Старт',
    'timer-stop': 'Стоп',
    'timer-cancel': 'Отмена',
    'timer-running': 'Таймер запущен...',
    'timer-manual-title': 'Ввод вручную',
    'timer-manual-add': 'Добавить запись',

    // Dashboard
    'dash-title': 'Аналитика времени',
    'dash-total-hours': 'Всего часов',
    'dash-total-earnings': 'Всего заработано',
    'dash-active-projects': 'Активные проекты',
    'dash-active-clients': 'Клиенты',
    'dash-by-project': 'Время по проектам',
    'dash-by-client': 'Время по клиентам',
    'dash-weekly-activity': 'Активность за последние 7 дней (часы)',
    'dash-no-data': 'Нет данных за выбранный период',

    // Clients & Projects
    'clients-title': 'Управление клиентами & проектами',
    'clients-tab': 'Клиенты',
    'projects-tab': 'Проекты',
    'clients-add-btn': 'Добавить клиента',
    'projects-add-btn': 'Добавить проект',
    'client-name-label': 'Название / Имя клиента',
    'client-rate-label': 'Ставка по умолчанию (EUR/час)',
    'project-name-label': 'Название проекта',
    'project-client-label': 'Клиент',
    'project-rate-label': 'Ставка проекта (EUR/час, оставьте 0 для наследования ставки клиента)',
    'actions': 'Действия',
    'edit': 'Ред.',
    'delete': 'Удал.',
    'save': 'Сохранить',
    'cancel': 'Отмена',
    'no-clients-warning': 'Сначала создайте клиента, чтобы создавать проекты.',

    // Reports & Logs
    'reports-title': 'Детализированные отчеты',
    'filter-client': 'Клиент',
    'filter-project': 'Проект',
    'filter-billable': 'Тип оплаты',
    'filter-all': 'Все',
    'filter-billable-only': 'Только оплачиваемые',
    'filter-non-billable-only': 'Неоплачиваемые',
    'filter-range': 'Период',
    'range-today': 'Сегодня',
    'range-yesterday': 'Вчера',
    'range-week': 'Текущая неделя',
    'range-month': 'Текущий месяц',
    'range-all': 'Все время',
    'report-total-hours': 'Часы за период',
    'report-total-earnings': 'Сумма за период',
    'export-csv': 'Экспорт в CSV',
    'export-json': 'Экспорт в JSON',
    
    // Log table & form
    'col-desc': 'Описание',
    'col-project': 'Проект / Клиент',
    'col-start': 'Начало',
    'col-end': 'Конец',
    'col-duration': 'Время',
    'col-rate': 'Ставка',
    'col-amount': 'Сумма',
    'log-edit-title': 'Редактировать запись времени',
    'log-add-manual-title': 'Ручной ввод времени',
    
    // Settings
    'settings-title': 'Настройки приложения',
    'settings-lang': 'Язык интерфейса',
    'settings-currency': 'Валюта по умолчанию',
    'settings-data': 'Управление данными',
    'settings-backup-desc': 'Экспортируйте ваши проекты, клиентов и логи времени в один JSON-файл для резервной копии.',
    'settings-backup-btn': 'Экспортировать данные (JSON)',
    'settings-restore-desc': 'Импортируйте ранее сохраненный файл резервной копии.',
    'settings-restore-btn': 'Импортировать данные',
    'settings-clear-desc': 'Удалить ВСЕ данные из приложения. Это действие необратимо!',
    'settings-clear-btn': 'Сбросить все данные',
    'settings-clear-confirm': 'Вы уверены, что хотите удалить все данные? Это действие невозможно отменить!',
    
    // Footer / Promo
    'footer-promo': 'Создание современных сайтов и запуск эффективной онлайн-рекламы в Google и соцсетях — ',
    'footer-visit': 'посетить White Eagles',
    'footer-rights': 'Все права защищены.',

    // Common
    'confirm-delete-client': 'Вы уверены, что хотите удалить этого клиента? Все связанные проекты и логи времени будут удалены!',
    'confirm-delete-project': 'Вы уверены, что хотите удалить этот проект? Все связанные логи времени будут удалены!',
    'confirm-delete-log': 'Вы уверены, что хотите удалить эту запись времени?',
    'no-project': 'Без проекта',
    'no-description': '(без описания)'
  },
  en: {
    // Sidebar
    'nav-dashboard': 'Dashboard',
    'nav-timer': 'Timer',
    'nav-clients': 'Clients & Projects',
    'nav-reports': 'Reports & Logs',
    'nav-settings': 'Settings',

    // Timer
    'timer-placeholder': 'What are you working on right now?',
    'timer-client-placeholder': 'Select client',
    'timer-project-placeholder': 'Select project (optional)',
    'timer-billable': 'Billable',
    'timer-start': 'Start',
    'timer-stop': 'Stop',
    'timer-cancel': 'Cancel',
    'timer-running': 'Timer is running...',
    'timer-manual-title': 'Manual Entry',
    'timer-manual-add': 'Add Log',

    // Dashboard
    'dash-title': 'Time Analytics',
    'dash-total-hours': 'Total Hours',
    'dash-total-earnings': 'Total Earnings',
    'dash-active-projects': 'Active Projects',
    'dash-active-clients': 'Clients',
    'dash-by-project': 'Time by Project',
    'dash-by-client': 'Time by Client',
    'dash-weekly-activity': 'Weekly Activity (hours)',
    'dash-no-data': 'No data for the selected period',

    // Clients & Projects
    'clients-title': 'Manage Clients & Projects',
    'clients-tab': 'Clients',
    'projects-tab': 'Projects',
    'clients-add-btn': 'Add Client',
    'projects-add-btn': 'Add Project',
    'client-name-label': 'Client Name / Company',
    'client-rate-label': 'Default Rate (EUR/hour)',
    'project-name-label': 'Project Name',
    'project-client-label': 'Client',
    'project-rate-label': 'Project Rate (EUR/hour, leave 0 to inherit client rate)',
    'actions': 'Actions',
    'edit': 'Edit',
    'delete': 'Delete',
    'save': 'Save',
    'cancel': 'Cancel',
    'no-clients-warning': 'Please create a client first to create projects.',

    // Reports & Logs
    'reports-title': 'Detailed Reports',
    'filter-client': 'Client',
    'filter-project': 'Project',
    'filter-billable': 'Billability',
    'filter-all': 'All',
    'filter-billable-only': 'Billable Only',
    'filter-non-billable-only': 'Non-billable Only',
    'filter-range': 'Period',
    'range-today': 'Today',
    'range-yesterday': 'Yesterday',
    'range-week': 'This Week',
    'range-month': 'This Month',
    'range-all': 'All Time',
    'report-total-hours': 'Hours in Period',
    'report-total-earnings': 'Total Amount',
    'export-csv': 'Export CSV',
    'export-json': 'Export JSON',
    
    // Log table & form
    'col-desc': 'Description',
    'col-project': 'Project / Client',
    'col-start': 'Start',
    'col-end': 'End',
    'col-duration': 'Duration',
    'col-rate': 'Rate',
    'col-amount': 'Amount',
    'log-edit-title': 'Edit Time Log',
    'log-add-manual-title': 'Add Manual Log',
    
    // Settings
    'settings-title': 'Application Settings',
    'settings-lang': 'Interface Language',
    'settings-currency': 'Default Currency',
    'settings-data': 'Data Management',
    'settings-backup-desc': 'Export your projects, clients, and time logs into a single JSON file for safe backup.',
    'settings-backup-btn': 'Export Data (JSON)',
    'settings-restore-desc': 'Import data from a previously exported backup file.',
    'settings-restore-btn': 'Import Data',
    'settings-clear-desc': 'Delete ALL data from the application. This action is permanent and cannot be undone!',
    'settings-clear-btn': 'Reset All Data',
    'settings-clear-confirm': 'Are you absolutely sure you want to delete all data? This cannot be undone!',
    
    // Footer / Promo
    'footer-promo': 'Modern website creation and effective online advertising in Google & Social Media — ',
    'footer-visit': 'visit White Eagles',
    'footer-rights': 'All rights reserved.',

    // Common
    'confirm-delete-client': 'Are you sure you want to delete this client? All associated projects and time logs will be deleted!',
    'confirm-delete-project': 'Are you sure you want to delete this project? All associated time logs will be deleted!',
    'confirm-delete-log': 'Are you sure you want to delete this time log?',
    'no-project': 'No Project',
    'no-description': '(no description)'
  }
};

export function t(key) {
  const lang = store.getSettings().language;
  return translations[lang]?.[key] || translations['en']?.[key] || key;
}

export function translatePage() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = t(key);
    if (translation) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.placeholder !== undefined && el.placeholder !== '') {
          el.placeholder = translation;
        } else {
          el.value = translation;
        }
      } else {
        el.textContent = translation;
      }
    }
  });
}
