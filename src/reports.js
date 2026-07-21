// WE Time Tracker Reports Module
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import {
  fillSelect,
  escapeHtml,
  billableHours,
  logDurationMs,
  toLocalDatetimeString,
  localDayKey,
  dayKeyToLocalDate,
  formatDurationHMS,
  formatDurationShort,
  csvCell
} from './utils.js';

let editingLogId = null;

// Format date to local readable format
function formatDateReadable(dayKey, lang) {
  const d = dayKeyToLocalDate(dayKey);
  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };

  try {
    const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
    return d.toLocaleDateString(locale, options);
  } catch (e) {
    return d.toDateString();
  }
}

// Денежная сумма записи: округление длительности вверх до 5-минутных блоков.
function logAmount(log) {
  if (!log.billable) return 0;
  return billableHours(logDurationMs(log)) * (log.rateAtTime || 0);
}

// Update filter dropdowns
export function updateReportsDropdowns() {
  const clientFilter = document.getElementById('filter-client-select');
  const editClient = document.getElementById('edit-log-client');
  const clients = store.getClients();

  // Save selections
  const selectedFilterClient = clientFilter.value;
  const selectedEditClient = editClient.value;

  fillSelect(clientFilter, clients, t('filter-all'), selectedFilterClient);
  fillSelect(editClient, clients, t('timer-client-placeholder'), selectedEditClient);

  updateReportsProjectDropdown('filter');
  updateReportsProjectDropdown('edit-log');
}

function updateReportsProjectDropdown(prefix) {
  const clientSelect = document.getElementById(`${prefix}-client-select`) || document.getElementById(`${prefix}-client`);
  const projSelect = document.getElementById(`${prefix}-project-select`) || document.getElementById(`${prefix}-project`);
  if (!clientSelect || !projSelect) return;

  const clientId = clientSelect.value;
  const placeholder = prefix === 'filter' ? t('filter-all') : t('timer-project-placeholder');

  if (clientId) {
    const projects = store.getProjects(clientId);
    // Сохраняем текущий выбор: раньше фильтр проектов молча сбрасывался
    const selected = projSelect.value;
    const stillValid = projects.some(p => p.id === selected);
    fillSelect(projSelect, projects, placeholder, stillValid ? selected : null);
    projSelect.disabled = false;
  } else {
    projSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    projSelect.appendChild(opt);
    projSelect.disabled = true;
  }
}

// Показ/скрытие полей произвольного периода
function syncCustomRangeVisibility() {
  const range = document.getElementById('filter-range-select').value;
  const wrap = document.getElementById('custom-range-wrap');
  if (wrap) {
    wrap.style.display = range === 'custom' ? 'flex' : 'none';
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

  // Payment Status Filter
  if (billable === 'unpaid') {
    logs = logs.filter(l => l.billable && !l.paid);
  } else if (billable === 'paid') {
    logs = logs.filter(l => l.billable && l.paid);
  } else if (billable === 'free') {
    logs = logs.filter(l => !l.billable);
  }

  // Date Range Filter (локальные границы дней)
  const now = new Date();
  let startLimit = null;
  let endLimit = null;

  if (range === 'today') {
    startLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === 'yesterday') {
    startLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    endLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, -1);
  } else if (range === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday start
    startLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  } else if (range === 'month') {
    startLimit = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === 'custom') {
    const fromVal = document.getElementById('filter-range-from').value;
    const toVal = document.getElementById('filter-range-to').value;
    if (fromVal) {
      startLimit = dayKeyToLocalDate(fromVal);
    }
    if (toVal) {
      const toDate = dayKeyToLocalDate(toVal);
      endLimit = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1, 0, 0, 0, -1);
    }
  }

  if (startLimit) {
    logs = logs.filter(l => new Date(l.startTime) >= startLimit);
  }
  if (endLimit) {
    logs = logs.filter(l => new Date(l.startTime) <= endLimit);
  }

  return logs;
}

export function updateBulkState() {
  const selectAllCheck = document.getElementById('bulk-select-all');
  const selectedCountEl = document.getElementById('bulk-selected-count');
  const markPaidBtn = document.getElementById('bulk-mark-paid-btn');
  const deleteBtn = document.getElementById('bulk-delete-btn');
  if (!selectAllCheck) return;

  const rowCheckboxes = document.querySelectorAll('.log-row-checkbox');
  const checkedBoxes = document.querySelectorAll('.log-row-checkbox:checked');

  const count = checkedBoxes.length;
  const total = rowCheckboxes.length;
  const lang = store.getSettings().language;

  selectedCountEl.textContent = lang === 'ru' ? `Выбрано: ${count}` : `Selected: ${count}`;

  markPaidBtn.disabled = count === 0;
  deleteBtn.disabled = count === 0;

  if (total > 0 && count === total) {
    selectAllCheck.checked = true;
    selectAllCheck.indeterminate = false;
  } else if (count > 0 && count < total) {
    selectAllCheck.checked = false;
    selectAllCheck.indeterminate = true;
  } else {
    selectAllCheck.checked = false;
    selectAllCheck.indeterminate = false;
  }
}

function getCheckedIds() {
  return [...document.querySelectorAll('.log-row-checkbox:checked')].map(cb => cb.getAttribute('data-id'));
}

// Иконка и подпись статуса оплаты записи
function paymentStatus(log) {
  if (!log.billable) {
    return { icon: 'minus-circle', cls: 'free-status', title: t('not-billable') };
  }
  if (log.paid) {
    return { icon: 'check-circle', cls: 'paid-status', title: t('paid') };
  }
  return { icon: 'euro', cls: 'billable', title: t('awaiting-payment') };
}

export function renderReports() {
  const container = document.getElementById('logs-container');
  if (!container) return;

  const lang = store.getSettings().language;
  const filteredLogs = getFilteredLogs();
  const clients = store.getClients();
  const projects = store.getProjects();

  const bulkBar = document.getElementById('bulk-actions-bar');
  syncCustomRangeVisibility();

  // 1. Update Summary Stats
  let totalMs = 0;
  let totalEarnings = 0;

  filteredLogs.forEach(log => {
    totalMs += logDurationMs(log);
    totalEarnings += logAmount(log);
  });

  document.getElementById('rep-hours').textContent = formatDurationShort(totalMs / 3600000, lang);
  document.getElementById('rep-earnings').textContent = `${totalEarnings.toFixed(2)} €`;

  // 2. Clear view and rebuild daily grouped elements
  container.innerHTML = '';

  if (filteredLogs.length === 0) {
    if (bulkBar) bulkBar.style.display = 'none';
    container.innerHTML = `
      <div class="dash-empty-state card">
        <i data-lucide="calendar-x"></i>
        <span>${lang === 'ru' ? 'Записи времени не найдены' : 'No time logs found'}</span>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (bulkBar) {
    bulkBar.style.display = 'flex';
  }

  // Group logs by LOCAL day (не UTC-срез: записи у полуночи попадали не в тот день)
  const grouped = {};
  filteredLogs.forEach(log => {
    const dayKey = localDayKey(log.startTime);
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(log);
  });

  // Sort days descending
  const sortedDays = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  sortedDays.forEach(dayKey => {
    const dayLogs = grouped[dayKey];

    // Sum day totals
    let dayMs = 0;
    let dayEarnings = 0;
    dayLogs.forEach(l => {
      dayMs += logDurationMs(l);
      dayEarnings += logAmount(l);
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
      const durationMs = logDurationMs(log);
      const amount = logAmount(log);

      const client = clients.find(c => c.id === log.clientId);
      const proj = projects.find(p => p.id === log.projectId);

      const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
      const timeStartStr = new Date(log.startTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      const timeEndStr = new Date(log.endTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

      const projectBadge = proj
        ? `<div class="project-badge-tag"><i data-lucide="folder" style="width:10px; height:10px; display:inline-block; margin-right:3px;"></i>${escapeHtml(proj.name)}</div>`
        : `<div class="project-badge-tag" style="color:var(--text-muted); font-style:italic;">${t('no-project')}</div>`;

      const clientName = client ? client.name : t('unknown-client');
      const clientBadge = `<div class="client-badge-tag">${escapeHtml(clientName)}</div>`;

      const status = paymentStatus(log);

      const logRow = document.createElement('div');
      logRow.className = 'log-item-row';

      logRow.innerHTML = `
        <div class="log-item-checkbox-col">
          <input type="checkbox" class="log-row-checkbox" data-id="${log.id}" style="width: 18px; height: 18px; accent-color: var(--accent-indigo); cursor: pointer;">
        </div>
        <div class="log-item-desc ${!log.description ? 'empty' : ''}">${log.description ? escapeHtml(log.description) : t('no-description')}</div>
        <div class="log-item-project-badge">
          ${projectBadge}
          ${clientBadge}
        </div>
        <div class="log-item-time">
          <i data-lucide="clock" style="width:10px; height:10px; display:inline-block; margin-right:4px; vertical-align:middle;"></i>
          ${timeStartStr} - ${timeEndStr}
        </div>
        <div class="log-item-duration">${formatDurationHMS(durationMs)}</div>
        <div class="log-item-billable-icon ${status.cls}" title="${status.title}">
          <i data-lucide="${status.icon}"></i>
        </div>
        <div class="log-item-financial">
          <span class="log-item-amount">${amount > 0 ? `${amount.toFixed(2)} €` : '—'}</span>
          ${log.billable ? `<span class="log-item-rate">${log.rateAtTime} €/h</span>` : ''}
        </div>
        <div class="log-item-actions">
          <button class="btn-icon play-log-btn" data-id="${log.id}" title="${lang === 'ru' ? 'Запустить снова' : 'Start again'}"><i data-lucide="play"></i></button>
          <button class="btn-icon edit-log-btn" data-id="${log.id}" title="${t('edit')}"><i data-lucide="edit-2"></i></button>
          <button class="btn-icon delete delete-log-btn" data-id="${log.id}" title="${t('delete')}"><i data-lucide="trash-2"></i></button>
        </div>
      `;

      itemsList.appendChild(logRow);
    });

    container.appendChild(dayGroupDiv);
  });

  // Attach Log Row Actions
  document.querySelectorAll('.play-log-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const log = store.getTimeLogs().find(l => l.id === id);
      if (log) {
        // Сохраняем текущий активный таймер (если был) и запускаем новый
        if (store.getActiveTimer()) {
          store.stopTimer();
        }
        store.startTimer(log.description || '', log.clientId, log.projectId, log.billable);
        showToast(t('toast-timer-started'), { type: 'success' });

        // Switch to timer view
        const timerNavItem = document.querySelector('nav .nav-item[data-target="timer-view"]');
        if (timerNavItem) {
          timerNavItem.click();
        }
      }
    });
  });

  document.querySelectorAll('.edit-log-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditLogModal(btn.getAttribute('data-id'));
    });
  });

  document.querySelectorAll('.delete-log-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const removed = store.deleteTimeLog(id);
      if (removed.length) {
        showToast(t('toast-log-deleted'), {
          type: 'info',
          actionLabel: t('toast-undo'),
          onAction: () => store.restoreTimeLogs(removed)
        });
      }
      renderReports();
    });
  });

  updateBulkState();

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
  const paidCheck = document.getElementById('edit-log-paid');

  const clients = store.getClients();

  desc.value = log.description;
  fillSelect(clientSelect, clients, t('timer-client-placeholder'), log.clientId);

  if (log.clientId) {
    const projects = store.getProjects(log.clientId);
    fillSelect(projectSelect, projects, t('timer-project-placeholder'), log.projectId);
    projectSelect.disabled = false;
  } else {
    projectSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('timer-project-placeholder');
    projectSelect.appendChild(opt);
    projectSelect.disabled = true;
  }

  startInput.value = toLocalDatetimeString(log.startTime);
  endInput.value = toLocalDatetimeString(log.endTime);
  rateInput.value = log.rateAtTime;
  billableCheck.checked = log.billable;
  if (paidCheck) paidCheck.checked = !!log.paid;

  modal.classList.add('active');
}

function closeEditLogModal() {
  document.getElementById('edit-log-modal').classList.remove('active');
  editingLogId = null;
}

function saveEditLogModal() {
  if (!editingLogId) return;

  const desc = document.getElementById('edit-log-desc').value;
  const clientId = document.getElementById('edit-log-client').value;
  const projectId = document.getElementById('edit-log-project').value;
  const startVal = document.getElementById('edit-log-start').value;
  const endVal = document.getElementById('edit-log-end').value;
  const rate = document.getElementById('edit-log-rate').value;
  const billable = document.getElementById('edit-log-billable').checked;
  const paidCheck = document.getElementById('edit-log-paid');
  const paid = paidCheck ? paidCheck.checked : false;

  if (!clientId) {
    showToast(t('toast-select-client'), { type: 'error' });
    return;
  }
  if (!startVal || !endVal) {
    showToast(t('toast-fill-times'), { type: 'error' });
    return;
  }

  const startTime = new Date(startVal).toISOString();
  const endTime = new Date(endVal).toISOString();

  if (new Date(startTime) >= new Date(endTime)) {
    showToast(t('toast-end-after-start'), { type: 'error' });
    return;
  }

  store.updateTimeLog(editingLogId, {
    description: desc,
    clientId,
    projectId,
    startTime,
    endTime,
    rateAtTime: rate,
    billable,
    paid
  });

  closeEditLogModal();
  showToast(t('toast-saved'), { type: 'success' });
  renderReports();
}

// ---------------- EXPORTS ----------------
function exportToCSV() {
  const logs = getFilteredLogs();
  const clients = store.getClients();
  const projects = store.getProjects();
  const isRu = store.getSettings().language === 'ru';

  // Headers
  let csvContent = isRu
    ? 'Описание,Клиент,Проект,Начало,Конец,Длительность (Часы),Статус,Ставка (EUR/ч),Сумма (EUR)\r\n'
    : 'Description,Client,Project,Start,End,Duration (Hours),Status,Rate (EUR/h),Amount (EUR)\r\n';

  logs.forEach(log => {
    const client = clients.find(c => c.id === log.clientId);
    const proj = projects.find(p => p.id === log.projectId);

    const startStr = new Date(log.startTime).toLocaleString();
    const endStr = new Date(log.endTime).toLocaleString();
    const durationHrs = (logDurationMs(log) / 3600000).toFixed(2);
    const status = paymentStatus(log).title;
    const amount = logAmount(log).toFixed(2);

    csvContent += [
      csvCell(log.description || ''),
      csvCell(client ? client.name : ''),
      csvCell(proj ? proj.name : ''),
      csvCell(startStr),
      csvCell(endStr),
      durationHrs,
      csvCell(status),
      log.rateAtTime,
      amount
    ].join(',') + '\r\n';
  });

  // Create download link with BOM for Excel Russian Cyrillic support
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `we_time_tracker_report_${localDayKey(new Date())}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportToJSON() {
  const logs = getFilteredLogs();
  const dataStr = JSON.stringify(logs, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

  const link = document.createElement('a');
  link.setAttribute('href', dataUri);
  link.setAttribute('download', `we_time_tracker_report_${localDayKey(new Date())}.json`);
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
  const rangeFrom = document.getElementById('filter-range-from');
  const rangeTo = document.getElementById('filter-range-to');

  const editClient = document.getElementById('edit-log-client');

  // Filters events
  clientFilter.addEventListener('change', () => {
    updateReportsProjectDropdown('filter');
    renderReports();
  });

  projectFilter.addEventListener('change', renderReports);
  billableFilter.addEventListener('change', renderReports);
  rangeFilter.addEventListener('change', renderReports);
  if (rangeFrom) rangeFrom.addEventListener('change', renderReports);
  if (rangeTo) rangeTo.addEventListener('change', renderReports);

  // Edit modal event
  editClient.addEventListener('change', () => {
    updateReportsProjectDropdown('edit-log');
  });

  // Modal Close buttons
  document.getElementById('edit-log-modal-close').addEventListener('click', closeEditLogModal);
  document.getElementById('edit-log-modal-cancel').addEventListener('click', closeEditLogModal);

  // Save edited log
  document.getElementById('edit-log-modal-save').addEventListener('click', saveEditLogModal);

  // Export actions
  document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
  document.getElementById('export-json-btn').addEventListener('click', exportToJSON);

  // Bulk Actions Listeners
  const selectAllCheck = document.getElementById('bulk-select-all');
  const markPaidBtn = document.getElementById('bulk-mark-paid-btn');
  const deleteBtn = document.getElementById('bulk-delete-btn');
  const logsContainer = document.getElementById('logs-container');

  if (selectAllCheck) {
    selectAllCheck.addEventListener('change', () => {
      document.querySelectorAll('.log-row-checkbox').forEach(cb => {
        cb.checked = selectAllCheck.checked;
      });
      updateBulkState();
    });
  }

  if (markPaidBtn) {
    markPaidBtn.addEventListener('click', () => {
      const ids = getCheckedIds();
      if (ids.length === 0) return;
      store.setLogsPaid(ids, true);
      showToast(t('toast-marked-paid'), {
        type: 'success',
        actionLabel: t('toast-undo'),
        onAction: () => store.setLogsPaid(ids, false)
      });
      renderReports();
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const ids = getCheckedIds();
      if (ids.length === 0) return;
      const removed = store.deleteTimeLogs(ids);
      if (removed.length) {
        showToast(`${t('toast-logs-deleted')} (${removed.length})`, {
          type: 'info',
          actionLabel: t('toast-undo'),
          onAction: () => store.restoreTimeLogs(removed)
        });
      }
      renderReports();
    });
  }

  if (logsContainer) {
    logsContainer.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('log-row-checkbox')) {
        updateBulkState();
      }
    });
  }

  // Populates selector filters initially
  updateReportsDropdowns();
  syncCustomRangeVisibility();
}
