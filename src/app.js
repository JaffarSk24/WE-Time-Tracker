// WE Time Tracker - Main Application entry point
import { createIcons, icons } from 'lucide';
import { store } from './store.js';
import { translatePage } from './i18n.js';
import { initTimer, updateTimerDropdowns, refreshTimerUI } from './timer.js';
import { initDashboard, renderDashboard } from './dashboard.js';
import { initClients, renderClients } from './clients.js';
import { initReports, renderReports, updateReportsDropdowns } from './reports.js';
import { initSettings } from './settings.js';

// Lucide бандлится локально (без CDN); сохраняем существующий глобальный API,
// которым пользуются все модули через window.lucide.createIcons().
window.lucide = { createIcons: () => createIcons({ icons }) };

// Setup current date in header
function updateHeaderDate() {
  const dateEl = document.getElementById('timer-date-subtitle');
  if (!dateEl) return;
  
  const lang = store.getSettings().language;
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  
  try {
    const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
    let formatted = new Date().toLocaleDateString(locale, options);
    // Capitalize first letter
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    dateEl.textContent = formatted;
  } catch (e) {
    dateEl.textContent = new Date().toDateString();
  }
}

// Sidebar View Navigation
function initNavigation() {
  const navItems = document.querySelectorAll('nav .nav-item');
  const panels = document.querySelectorAll('.view-panel');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      const targetId = item.getAttribute('data-target');
      
      // Update active nav class
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update active panel class
      panels.forEach(panel => {
        if (panel.id === targetId) {
          panel.classList.add('active');
          // Trigger render for the active view
          triggerViewRender(targetId);
        } else {
          panel.classList.remove('active');
        }
      });

      // Сброс скролла: без этого при переходе с прокрученной вкладки
      // новая открывалась "в середине" (видели чёрный экран)
      window.scrollTo(0, 0);
      const main = document.querySelector('main');
      if (main) main.scrollTo(0, 0);
    });
  });
}

// Клавиатура и клик-мимо для модальных окон:
// Esc — закрыть, Enter — сохранить, клик по затемнению — закрыть.
function initModalUX() {
  const modals = document.querySelectorAll('.modal-overlay');

  modals.forEach(modal => {
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    const activeModal = document.querySelector('.modal-overlay.active');
    if (!activeModal) return;

    if (e.key === 'Escape') {
      activeModal.classList.remove('active');
    } else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      const saveBtn = activeModal.querySelector('.btn-primary');
      if (saveBtn) {
        e.preventDefault();
        saveBtn.click();
      }
    }
  });
}

// Trigger render functions for specific panels when they open
export function triggerViewRender(panelId) {
  switch (panelId) {
    case 'timer-view':
      updateHeaderDate();
      refreshTimerUI();
      break;
    case 'dashboard-view':
      renderDashboard();
      break;
    case 'clients-view':
      renderClients();
      break;
    case 'reports-view':
      renderReports();
      break;
  }
  // Refresh icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Populate dropdown selector helpers
export function populateDropdown(selectElement, items, placeholderText, selectedId = null) {
  if (!selectElement) return;
  
  selectElement.innerHTML = '';
  
  // Add placeholder
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = placeholderText;
  selectElement.appendChild(placeholderOpt);
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    if (selectedId && item.id === selectedId) {
      opt.selected = true;
    }
    selectElement.appendChild(opt);
  });
}

// Global UI updater
function updateGlobalUI() {
  // Apply theme
  const currentTheme = store.getSettings().theme || 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Translate text
  translatePage();
  
  // Update header date
  updateHeaderDate();
  
  // Refresh icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Init App
document.addEventListener('DOMContentLoaded', () => {
  // Apply theme initially
  const currentTheme = store.getSettings().theme || 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Set current year in footer
  const yearEl = document.getElementById('current-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // App version from package.json (injected by Vite)
  const versionEl = document.getElementById('app-version');
  if (versionEl && typeof __APP_VERSION__ !== 'undefined') {
    versionEl.textContent = 'v' + __APP_VERSION__;
  }

  // Navigation
  initNavigation();
  initModalUX();

  // Initialize sub modules
  initTimer();
  initDashboard();
  initClients();
  initReports();
  initSettings();
  
  // First render
  updateGlobalUI();
  
  // Subscribe to store updates
  store.subscribe((_state) => {
    updateGlobalUI();
    
    // Update all client/project selections to keep them sync'd
    updateTimerDropdowns();
    updateReportsDropdowns();
    
    // Render current active view
    const activePanel = document.querySelector('.view-panel.active');
    if (activePanel) {
      triggerViewRender(activePanel.id);
    }
  });
});
