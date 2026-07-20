// WE Time Tracker Reports Module
import { store } from './store.js';
import { t } from './i18n.js';

let editingLogId = null;

// Helper to fill select elements
function fillSelect(element, items, placeholderText, selectedId = null) {
  if (!element) return;
  element.innerHTML = '';
  
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = placeholderText;
  element.appendChild(placeholder);
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    if (selectedId && item.id === selectedId) {
      opt.selected = true;
    }
    element.appendChild(opt);
  });
}

// Convert ISO string to local datetime-local format
function toLocalDatetimeString(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

// Format duration into HH:MM:SS
function formatDuration(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  
  return [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

// Format duration into short text (e.g. 2h 15m)
function formatDurationShort(decimalHours, lang) {
  const hrs = Math.floor(decimalHours);
  const mins = Math.round((decimalHours - hrs) * 60);
  return lang === 'ru' ? `${hrs}ч ${mins}м` : `${hrs}h ${mins}m`;
}

// Format date to local readable format
function formatDateReadable(dateStr, lang) {
  const d = new Date(dateStr);
  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  
  try {
    const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
    return d.toLocaleDateString(locale, options);
  } catch (e) {
    return d.toDateString();
  }
}

// Update filter dropdowns
export function updateReportsDropdowns() {
  const clientFilter = document.getElementById('filter-client-select');
  const editClient = document.getElementById('edit-log-client');
  const clients = store.getClients();
  
  const currentLang = store.getSettings().language;
  const clientPlaceholder = currentLang === 'ru' ? 'Все клиенты' : 'All Clients';
  const editClientPlaceholder = currentLang === 'ru' ? 'Выберите клиента' : 'Select Client';
  
  // Save selections
  const selectedFilterClient = clientFilter.value;
  const selectedEditClient = editClient.value;
  
  fillSelect(clientFilter, clients, clientPlaceholder, selectedFilterClient);
  fillSelect(editClient, clients, editClientPlaceholder, selectedEditClient);
  
  updateReportsProjectDropdown('filter');
  updateReportsProjectDropdown('edit-log');
}

function updateReportsProjectDropdown(prefix) {
  const clientSelect = document.getElementById(`${prefix}-client-select`) || document.getElementById(`${prefix}-client`);
  const projSelect = document.getElementById(`${prefix}-project-select`) || document.getElementById(`${prefix}-project`);
  if (!clientSelect || !projSelect) return;
  
  const clientId = clientSelect.value;
  const currentLang = store.getSettings().language;
  const projPlaceholder = currentLang === 'ru' ? 'Все проекты' : 'All Projects';
  const editProjPlaceholder = currentLang === 'ru' ? 'Выберите проект (опционально)' : 'Select project (optional)';
  
  const placeholder = prefix === 'filter' ? projPlaceholder : editProjPlaceholder;
  
  if (clientId) {
    const projects = store.getProjects(clientId);
    fillSelect(projSelect, projects, placeholder);
    projSelect.disabled = false;
  } else {
    projSelect.innerHTML = `<option value="">${placeholder}</option>`;
    projSelect.disabled = true;
  }
}

// Filter current logs based on selected filters
function getFilteredLogs() {
  let logs = store.getTimeLogs();
  
  const clientId = document.getElementById('filter-client-select').value;
  const projectId = document.getElementById('filter-project-select').value;
  const billable = document.getElementById('filter-billable-select').value;
  const range = document.getElementById('filter-range-select').value;
  
  // Client Filter
  if (clientId) {
    logs = logs.filter(l => l.clientId === clientId);
  }
  
  // Project Filter
  if (projectId) {
    logs = logs.filter(l => l.projectId === projectId);
  }
  
  // Billable Filter
  if (billable !== 'all') {
    const isBillable = billable === 'billable';
    logs = logs.filter(l => l.billable === isBillable);
  }
  
  // Date Range Filter
  const now = new Date();
  let startLimit = null;
  let endLimit = null;
  
  if (range === 'today') {
    startLimit = new Date(now.setHours(0, 0, 0, 0));
  } else if (range === 'yesterday') {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    startLimit = new Date(yest.setHours(0, 0, 0, 0));
    endLimit = new Date(yest.setHours(23, 59, 59, 999));
  } else if (range === 'week') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    startLimit = new Date(now.setDate(diff));
    startLimit.setHours(0, 0, 0, 0);
  } else if (range === 'month') {
    startLimit = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }
  
  if (startLimit) {
    logs = logs.filter(l => new Date(l.startTime) >= startLimit);
  }
  if (endLimit) {
    logs = logs.filter(l => new Date(l.startTime) <= endLimit);
  }
  
  return logs;
}

export function renderReports() {
  const container = document.getElementById('logs-container');
  if (!container) return;
  
  const lang = store.getSettings().language;
  const filteredLogs = getFilteredLogs();
  const clients = store.getClients();
  const projects = store.getProjects();
  
  // 1. Update Summary Stats
  let totalMs = 0;
  let totalEarnings = 0;
  
  filteredLogs.forEach(log => {
    const duration = new Date(log.endTime) - new Date(log.startTime);
    totalMs += duration;
    if (log.billable) {
      totalEarnings += (duration / 3600000) * (log.rateAtTime || 0);
    }
  });
  
  const totalHrs = totalMs / 3600000;
  document.getElementById('rep-hours').textContent = formatDurationShort(totalHrs, lang);
  document.getElementById('rep-earnings').textContent = `${totalEarnings.toFixed(2)} €`;
  
  // 2. Clear view and rebuild daily grouped elements
  container.innerHTML = '';
  
  if (filteredLogs.length === 0) {
    container.innerHTML = `
      <div class="dash-empty-state card">
        <i data-lucide="calendar-x"></i>
        <span>${lang === 'ru' ? 'Записи времени не найдены' : 'No time logs found'}</span>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }
  
  // Group logs by Day (YYYY-MM-DD)
  const grouped = {};
  filteredLogs.forEach(log => {
    const dayKey = log.startTime.slice(0, 10);
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(log);
  });
  
  // Sort days descending
  const sortedDays = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
  
  sortedDays.forEach(dayKey => {
    const dayLogs = grouped[dayKey];
    
    // Sum day totals
    let dayMs = 0;
    let dayEarnings = 0;
    dayLogs.forEach(l => {
      const dur = new Date(l.endTime) - new Date(l.startTime);
      dayMs += dur;
      if (l.billable) {
        dayEarnings += (dur / 3600000) * (l.rateAtTime || 0);
      }
    });
    
    const dayGroupDiv = document.createElement('div');
    dayGroupDiv.className = 'log-group-day';
    
    // Header for the day group
    dayGroupDiv.innerHTML = `
      <div class="log-group-header">
        <div class="log-group-date">${formatDateReadable(dayKey, lang)}</div>
        <div class="log-group-totals">
          <span class="log-group-total-time">${formatDurationShort(dayMs / 3600000, lang)}</span>
          ${dayEarnings > 0 ? `<span class="log-group-total-earnings">${dayEarnings.toFixed(2)} €</span>` : ''}
        </div>
      </div>
      <div class="log-items-list"></div>
    `;
    
    const itemsList = dayGroupDiv.querySelector('.log-items-list');
    
    // Render individual log items
    dayLogs.forEach(log => {
      const durationMs = new Date(log.endTime) - new Date(log.startTime);
      const amount = log.billable ? (durationMs / 3600000) * (log.rateAtTime || 0) : 0;
      
      const client = clients.find(c => c.id === log.clientId);
      const proj = projects.find(p => p.id === log.projectId);
      
      const timeStartStr = new Date(log.startTime).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
      const timeEndStr = new Date(log.endTime).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
      
      const projectBadge = proj 
        ? `<div class="project-badge-tag"><i data-lucide="folder" style="width:10px; height:10px; display:inline-block; margin-right:3px;"></i>${proj.name}</div>`
        : `<div class="project-badge-tag" style="color:var(--text-muted); font-style:italic;">${t('no-project')}</div>`;
        
      const clientName = client ? client.name : (lang === 'ru' ? 'Неизвестный клиент' : 'Unknown Client');
      const clientBadge = `<div class="client-badge-tag">${clientName}</div>`;
      
      const logRow = document.createElement('div');
      logRow.className = 'log-item-row';
      
      logRow.innerHTML = `
        <div class="log-item-desc ${!log.description ? 'empty' : ''}">${log.description || t('no-description')}</div>
        <div class="log-item-project-badge">
          ${projectBadge}
          ${clientBadge}
        </div>
        <div class="log-item-time">
          <i data-lucide="clock" style="width:10px; height:10px; display:inline-block; margin-right:4px; vertical-align:middle;"></i>
          ${timeStartStr} - ${timeEndStr}
        </div>
        <div class="log-item-duration">${formatDuration(durationMs)}</div>
        <div class="log-item-billable-icon ${log.billable ? 'billable' : ''}" title="${log.billable ? t('timer-billable') : ''}">
          <i data-lucide="${log.billable ? 'euro' : 'eye-off'}"></i>
        </div>
        <div class="log-item-financial">
          <span class="log-item-amount">${amount > 0 ? `${amount.toFixed(2)} €` : '—'}</span>
          ${log.billable ? `<span class="log-item-rate">${log.rateAtTime} €/h</span>` : ''}
        </div>
        <div class="log-item-actions">
          <button class="btn-icon edit-log-btn" data-id="${log.id}" title="Edit"><i data-lucide="edit-2"></i></button>
          <button class="btn-icon delete delete-log-btn" data-id="${log.id}" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      `;
      
      itemsList.appendChild(logRow);
    });
    
    container.appendChild(dayGroupDiv);
  });
  
  // Attach Log Row Actions
  document.querySelectorAll('.edit-log-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditLogModal(btn.getAttribute('data-id'));
    });
  });
  
  document.querySelectorAll('.delete-log-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (confirm(t('confirm-delete-log'))) {
        store.deleteTimeLog(id);
        renderReports();
      }
    });
  });
  
  if (window.lucide) window.lucide.createIcons();
}

// ---------------- EDIT LOG MODAL ----------------
function openEditLogModal(id) {
  editingLogId = id;
  const log = store.getTimeLogs().find(l => l.id === id);
  if (!log) return;
  
  const modal = document.getElementById('edit-log-modal');
  const desc = document.getElementById('edit-log-desc');
  const clientSelect = document.getElementById('edit-log-client');
  const projectSelect = document.getElementById('edit-log-project');
  const startInput = document.getElementById('edit-log-start');
  const endInput = document.getElementById('edit-log-end');
  const rateInput = document.getElementById('edit-log-rate');
  const billableCheck = document.getElementById('edit-log-billable');
  
  const clients = store.getClients();
  const currentLang = store.getSettings().language;
  
  desc.value = log.description;
  fillSelect(clientSelect, clients, currentLang === 'ru' ? 'Выберите клиента' : 'Select Client', log.clientId);
  
  if (log.clientId) {
    const projects = store.getProjects(log.clientId);
    fillSelect(projectSelect, projects, currentLang === 'ru' ? 'Выберите проект (опционально)' : 'Select project (optional)', log.projectId);
    projectSelect.disabled = false;
  } else {
    projectSelect.innerHTML = `<option value="">${currentLang === 'ru' ? 'Выберите проект' : 'Select project'}</option>`;
    projectSelect.disabled = true;
  }
  
  startInput.value = toLocalDatetimeString(log.startTime);
  endInput.value = toLocalDatetimeString(log.endTime);
  rateInput.value = log.rateAtTime;
  billableCheck.checked = log.billable;
  
  modal.classList.add('active');
}

function closeEditLogModal() {
  document.getElementById('edit-log-modal').classList.remove('active');
  editingLogId = null;
}

// ---------------- EXPORTS ----------------
function exportToCSV() {
  const logs = getFilteredLogs();
  const clients = store.getClients();
  const projects = store.getProjects();
  const isRu = store.getSettings().language === 'ru';
  
  // Headers
  let csvContent = isRu
    ? 'Описание,Клиент,Проект,Начало,Конец,Длительность (Часы),Оплачиваемый,Ставка (EUR/ч),Сумма (EUR)\r\n'
    : 'Description,Client,Project,Start,End,Duration (Hours),Billable,Rate (EUR/h),Amount (EUR)\r\n';
    
  logs.forEach(log => {
    const client = clients.find(c => c.id === log.clientId);
    const proj = projects.find(p => p.id === log.projectId);
    
    const clientName = client ? client.name : '';
    const projName = proj ? proj.name : '';
    
    const startStr = new Date(log.startTime).toLocaleString();
    const endStr = new Date(log.endTime).toLocaleString();
    const durationHrs = ((new Date(log.endTime) - new Date(log.startTime)) / 3600000).toFixed(2);
    const isBillable = log.billable ? (isRu ? 'Да' : 'Yes') : (isRu ? 'Нет' : 'No');
    const amount = log.billable ? (durationHrs * log.rateAtTime).toFixed(2) : '0.00';
    
    // Clean description to avoid CSV breaks
    const cleanDesc = (log.description || '').replace(/"/g, '""');
    
    csvContent += `"${cleanDesc}","${clientName}","${projName}","${startStr}","${endStr}",${durationHrs},"${isBillable}",${log.rateAtTime},${amount}\r\n`;
  });
  
  // Create download link with BOM for Excel Russian Cyrillic support
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `we_time_tracker_report_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportToJSON() {
  const logs = getFilteredLogs();
  const dataStr = JSON.stringify(logs, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const link = document.createElement('a');
  link.setAttribute('href', dataUri);
  link.setAttribute('download', `we_time_tracker_report_${new Date().toISOString().slice(0,10)}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function initReports() {
  const clientFilter = document.getElementById('filter-client-select');
  const projectFilter = document.getElementById('filter-project-select');
  const billableFilter = document.getElementById('filter-billable-select');
  const rangeFilter = document.getElementById('filter-range-select');
  
  const editClient = document.getElementById('edit-log-client');
  const editProj = document.getElementById('edit-log-project');
  
  // Filters events
  clientFilter.addEventListener('change', () => {
    updateReportsProjectDropdown('filter');
    renderReports();
  });
  
  projectFilter.addEventListener('change', renderReports);
  billableFilter.addEventListener('change', renderReports);
  rangeFilter.addEventListener('change', renderReports);
  
  // Edit modal event
  editClient.addEventListener('change', () => {
    updateReportsProjectDropdown('edit-log');
  });
  
  // Modal Close buttons
  document.getElementById('edit-log-modal-close').addEventListener('click', closeEditLogModal);
  document.getElementById('edit-log-modal-cancel').addEventListener('click', closeEditLogModal);
  
  // Save edited log
  document.getElementById('edit-log-modal-save').addEventListener('click', () => {
    if (!editingLogId) return;
    
    const desc = document.getElementById('edit-log-desc').value;
    const clientId = editClient.value;
    const projectId = editProj.value;
    const startVal = document.getElementById('edit-log-start').value;
    const endVal = document.getElementById('edit-log-end').value;
    const rate = document.getElementById('edit-log-rate').value;
    const billable = document.getElementById('edit-log-billable').checked;
    
    const isRu = store.getSettings().language === 'ru';
    
    if (!clientId) {
      alert(isRu ? 'Выберите клиента!' : 'Select a client!');
      return;
    }
    if (!startVal || !endVal) {
      alert(isRu ? 'Заполните время начала и окончания!' : 'Fill start and end times!');
      return;
    }
    
    const startTime = new Date(startVal).toISOString();
    const endTime = new Date(endVal).toISOString();
    
    if (new Date(startTime) >= new Date(endTime)) {
      alert(isRu ? 'Время окончания должно быть позже времени начала!' : 'End time must be after start time!');
      return;
    }
    
    store.updateTimeLog(editingLogId, {
      description: desc,
      clientId,
      projectId,
      startTime,
      endTime,
      rateAtTime: rate,
      billable
    });
    
    closeEditLogModal();
    renderReports();
  });
  
  // Export actions
  document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
  document.getElementById('export-json-btn').addEventListener('click', exportToJSON);
  
  // Populates selector filters initially
  updateReportsDropdowns();
}
