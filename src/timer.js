// WE Time Tracker Timer Module
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { addToTotals, currencyOfClient, nonZeroLines } from './currency.js';
import {
  fillSelect,
  escapeHtml,
  billableHours,
  toLocalDatetimeString,
  localDayKey,
  formatDurationHMS,
  formatDurationShort,
  logDurationMs
} from './utils.js';
import { stopTimerWithLockCheck } from './period-lock-ui.js';
import { createTagPicker, continueExtra } from './tags-ui.js';
import { renderTimerBudget, withBudgetCheck } from './budgets-ui.js';
import { renderGoalsCard } from './goals-ui.js';
import { overlapsWith } from './timesheet.js';

let timerInterval = null;
let timerTagPicker = null;
let manualTagPicker = null;
let timerWasRunning = false;

// Sync timer state with the main process (menubar/tray).
function syncTrayTimer() {
  if (!window.weTimer) return;
  const timer = store.getActiveTimer();
  if (!timer) {
    window.weTimer.sync(null);
    return;
  }
  window.weTimer.sync({
    description: timer.description || '',
    isPaused: !!timer.isPaused,
    startTime: timer.startTime,
    accumulatedTime: timer.accumulatedTime || 0,
    // For stopping the timer from the tray with the window closed (main writes the log itself)
    clientId: timer.clientId || null,
    projectId: timer.projectId || null,
    billable: timer.billable !== undefined ? timer.billable : true,
    rateAtTime: store.getRate(timer.clientId, timer.projectId)
  });
}

// Set manual inputs default times (LOCAL time, not UTC)
function setDefaultManualTimes() {
  const startEl = document.getElementById('manual-start');
  const endEl = document.getElementById('manual-end');

  if (startEl && endEl) {
    const now = new Date();
    now.setSeconds(0, 0);
    endEl.value = toLocalDatetimeString(now);

    const hourAgo = new Date(now.getTime() - 3600000);
    startEl.value = toLocalDatetimeString(hourAgo);
  }
}

// Update all client/project dropdown selections in the timer view
export function updateTimerDropdowns() {
  const timerClient = document.getElementById('timer-client-select');
  const manualClient = document.getElementById('manual-client-select');
  const clients = store.getClients();

  const clientPlaceholder = t('timer-client-placeholder');

  // Save currently selected values
  const activeTimer = store.getActiveTimer();
  const selectedTimerClient = activeTimer ? activeTimer.clientId : (timerClient ? timerClient.value : '');
  const selectedManualClient = manualClient ? manualClient.value : '';

  fillSelect(timerClient, clients, clientPlaceholder, selectedTimerClient);
  fillSelect(manualClient, clients, clientPlaceholder, selectedManualClient);

  // Trigger project updates if client was selected
  const timerProjSelect = document.getElementById('timer-project-select');
  const manualProjSelect = document.getElementById('manual-project-select');
  const selectedTimerProject = activeTimer ? activeTimer.projectId : (timerProjSelect ? timerProjSelect.value : '');
  const selectedManualProject = manualProjSelect ? manualProjSelect.value : '';

  updateProjectDropdown('timer', selectedTimerProject);
  updateProjectDropdown('manual', selectedManualProject);
}

function updateProjectDropdown(prefix, selectedProjectId = null) {
  const clientSelect = document.getElementById(`${prefix}-client-select`);
  const projSelect = document.getElementById(`${prefix}-project-select`);
  if (!clientSelect || !projSelect) return;

  const clientId = clientSelect.value;
  const projPlaceholder = t('timer-project-placeholder');

  if (clientId) {
    const projects = store.getProjects(clientId);
    fillSelect(projSelect, projects, projPlaceholder, selectedProjectId);
    projSelect.disabled = false;
  } else {
    projSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = projPlaceholder;
    projSelect.appendChild(opt);
    projSelect.disabled = true;
  }
}

// Timer tick action
function tick() {
  const timer = store.getActiveTimer();
  if (!timer) {
    stopTimerTicking();
    return;
  }

  const clockEl = document.getElementById('timer-clock');
  if (clockEl) {
    let elapsed = timer.accumulatedTime || 0;
    if (!timer.isPaused && timer.startTime) {
      elapsed += Date.now() - new Date(timer.startTime).getTime();
    }
    clockEl.textContent = formatDurationHMS(elapsed);
  }
  renderTimerBudget(true);
}

function startTimerTicking() {
  if (timerInterval) clearInterval(timerInterval);
  tick(); // immediate call
  timerInterval = setInterval(tick, 500);

  const clockEl = document.getElementById('timer-clock');
  const timer = store.getActiveTimer();
  if (clockEl) {
    if (timer && timer.isPaused) {
      clockEl.classList.remove('running');
    } else {
      clockEl.classList.add('running');
    }
  }
}

function stopTimerTicking() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const clockEl = document.getElementById('timer-clock');
  if (clockEl) {
    clockEl.textContent = '00:00:00';
    clockEl.classList.remove('running');
  }
}

// ---------------- TODAY'S ENTRIES ----------------
export function renderTodayLogs() {
  const container = document.getElementById('today-logs-list');
  if (!container) return;

  const lang = store.getSettings().language;
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const todayKey = localDayKey(new Date());
  const logs = store.getTimeLogs().filter(l => localDayKey(l.startTime) === todayKey);
  const clients = store.getClients();
  const projects = store.getProjects();

  const totalsEl = document.getElementById('today-logs-totals');

  if (logs.length === 0) {
    container.innerHTML = `<div class="today-empty">${t('today-no-logs')}</div>`;
    if (totalsEl) totalsEl.textContent = '';
    return;
  }

  let totalMs = 0;
  const totalEarnings = {};
  logs.forEach(l => {
    const dur = logDurationMs(l);
    totalMs += dur;
    if (l.billable) {
      addToTotals(totalEarnings, currencyOfClient(l.clientId), billableHours(dur) * (l.rateAtTime || 0));
    }
  });

  if (totalsEl) {
    // One amount per currency, never added together
    const money = nonZeroLines(totalEarnings);
    totalsEl.textContent = `${formatDurationShort(totalMs / 3600000, lang)}${money.map(m => ` · ${m}`).join('')}`;
  }

  container.innerHTML = '';
  logs.forEach(log => {
    const durationMs = logDurationMs(log);
    const client = clients.find(c => c.id === log.clientId);
    const proj = projects.find(p => p.id === log.projectId);

    const startStr = new Date(log.startTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const endStr = new Date(log.endTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

    const row = document.createElement('div');
    row.className = 'today-log-row';
    row.innerHTML = `
      <div class="today-log-desc ${!log.description ? 'empty' : ''}">${log.description ? escapeHtml(log.description) : t('no-description')}</div>
      <div class="today-log-meta">${escapeHtml(client ? client.name : '')}${proj ? ' · ' + escapeHtml(proj.name) : ''}</div>
      <div class="today-log-time">${startStr}–${endStr}</div>
      <div class="today-log-duration">${formatDurationHMS(durationMs)}</div>
      <button class="btn-icon today-play-btn" data-id="${log.id}" title="${t('restart-timer')}"><i data-lucide="play"></i></button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.today-play-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const log = store.getTimeLogs().find(l => l.id === btn.getAttribute('data-id'));
      if (!log) return;
      if (store.getActiveTimer()) {
        withBudgetCheck(() => stopTimerWithLockCheck());
      }
      store.startTimer(log.description || '', log.clientId, log.projectId, log.billable, continueExtra(log));
      refreshTimerUI();
      showToast(t('toast-timer-started'), { type: 'success' });
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

// Update the look of the start/stop button based on active timer status
export function refreshTimerUI() {
  const activeTimer = store.getActiveTimer();
  const toggleBtn = document.getElementById('timer-toggle-btn');
  const pauseBtn = document.getElementById('timer-pause-btn');
  const cancelBtn = document.getElementById('timer-cancel-btn');

  const descInput = document.getElementById('timer-desc');
  const clientSelect = document.getElementById('timer-client-select');
  const projSelect = document.getElementById('timer-project-select');
  const billableCheck = document.getElementById('timer-billable');

  if (activeTimer) {
    // Timer is running
    toggleBtn.textContent = t('timer-stop');
    toggleBtn.className = 'btn btn-timer btn-timer-stop';
    cancelBtn.style.display = 'inline-flex';
    pauseBtn.style.display = 'inline-flex';

    if (activeTimer.isPaused) {
      pauseBtn.textContent = t('timer-resume');
      pauseBtn.setAttribute('data-i18n', 'timer-resume');
      pauseBtn.className = 'btn btn-timer btn-timer-start';
    } else {
      pauseBtn.textContent = t('timer-pause');
      pauseBtn.setAttribute('data-i18n', 'timer-pause');
      pauseBtn.className = 'btn btn-timer btn-timer-pause';
    }

    // Sync values with active timer state
    descInput.value = activeTimer.description;

    // Disable inputs while running to protect tracking integrity
    descInput.disabled = true;
    clientSelect.disabled = true;
    projSelect.disabled = true;
    billableCheck.disabled = true;

    // Update selected client and projects dropdown
    fillSelect(clientSelect, store.getClients(), t('timer-client-placeholder'), activeTimer.clientId);
    if (activeTimer.clientId) {
      fillSelect(projSelect, store.getProjects(activeTimer.clientId), t('timer-project-placeholder'), activeTimer.projectId);
      projSelect.disabled = true;
    }
    billableCheck.checked = activeTimer.billable;

    if (timerTagPicker) {
      timerTagPicker.setValue(activeTimer.extra && activeTimer.extra.tagIds);
      timerTagPicker.setDisabled(true);
    }
    timerWasRunning = true;

    startTimerTicking();
  } else {
    // Timer is stopped
    toggleBtn.textContent = t('timer-start');
    toggleBtn.className = 'btn btn-timer btn-timer-start';
    cancelBtn.style.display = 'none';
    pauseBtn.style.display = 'none';

    // Enable inputs
    descInput.disabled = false;
    clientSelect.disabled = false;
    projSelect.disabled = !clientSelect.value;
    billableCheck.disabled = false;

    // A stopped timer leaves no tags behind for the next one.
    if (timerTagPicker) {
      if (timerWasRunning) timerTagPicker.setValue([]);
      timerTagPicker.setDisabled(false);
    }
    timerWasRunning = false;

    stopTimerTicking();
  }

  if (timerTagPicker) timerTagPicker.refresh();
  if (manualTagPicker) manualTagPicker.refresh();
  renderTimerBudget();
  renderGoalsCard('timer-goals');
  renderTodayLogs();
  syncTrayTimer();
}

export function initTimer() {
  const toggleBtn = document.getElementById('timer-toggle-btn');
  const pauseBtn = document.getElementById('timer-pause-btn');
  const cancelBtn = document.getElementById('timer-cancel-btn');

  const timerClientSelect = document.getElementById('timer-client-select');
  const manualClientSelect = document.getElementById('manual-client-select');

  const manualAddBtn = document.getElementById('manual-add-btn');

  timerTagPicker = createTagPicker(document.getElementById('timer-tags'));
  manualTagPicker = createTagPicker(document.getElementById('manual-tags'));

  // Set dropdowns
  updateTimerDropdowns();
  setDefaultManualTimes();

  // Client selection changes filter project dropdowns
  timerClientSelect.addEventListener('change', () => {
    updateProjectDropdown('timer');
    const projSelect = document.getElementById('timer-project-select');
    projSelect.disabled = !timerClientSelect.value;
    renderTimerBudget();
  });

  document.getElementById('timer-project-select').addEventListener('change', () => renderTimerBudget());

  manualClientSelect.addEventListener('change', () => {
    updateProjectDropdown('manual');
  });

  // Start / Stop Toggle Button
  toggleBtn.addEventListener('click', () => {
    const activeTimer = store.getActiveTimer();

    if (activeTimer) {
      // STOP TIMER
      withBudgetCheck(() => stopTimerWithLockCheck());
      document.getElementById('timer-desc').value = '';
    } else {
      // START TIMER
      const desc = document.getElementById('timer-desc').value;
      const clientId = timerClientSelect.value;
      const projectId = document.getElementById('timer-project-select').value;
      const billable = document.getElementById('timer-billable').checked;

      // Validation: Must select client
      if (!clientId) {
        showToast(t('toast-select-client'), { type: 'error' });
        return;
      }

      const tagIds = timerTagPicker ? timerTagPicker.getValue() : [];
      store.startTimer(desc, clientId, projectId, billable, tagIds.length ? { tagIds } : {});
    }

    refreshTimerUI();
  });

  // Pause / Resume Button
  pauseBtn.addEventListener('click', () => {
    const activeTimer = store.getActiveTimer();
    if (!activeTimer) return;

    if (activeTimer.isPaused) {
      store.resumeTimer();
    } else {
      store.pauseTimer();
    }
    refreshTimerUI();
  });

  // Cancel Timer Button
  cancelBtn.addEventListener('click', () => {
    if (confirm(t('cancel-timer-confirm'))) {
      store.cancelTimer();
      document.getElementById('timer-desc').value = '';
      refreshTimerUI();
    }
  });

  // Add Manual Entry
  manualAddBtn.addEventListener('click', () => {
    const desc = document.getElementById('manual-desc').value;
    const clientId = manualClientSelect.value;
    const projectId = document.getElementById('manual-project-select').value;
    const startVal = document.getElementById('manual-start').value;
    const endVal = document.getElementById('manual-end').value;
    const billable = document.getElementById('manual-billable').checked;

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

    const added = withBudgetCheck(() => store.addTimeLog({
      description: desc,
      clientId,
      projectId,
      startTime,
      endTime,
      billable,
      tagIds: manualTagPicker ? manualTagPicker.getValue() : []
    }));
    if (!added) {
      showToast(t('lock-add-refused'), { type: 'error' });
      return;
    }

    // Clear inputs and reset times
    document.getElementById('manual-desc').value = '';
    manualClientSelect.value = '';
    updateProjectDropdown('manual');
    setDefaultManualTimes();
    if (manualTagPicker) manualTagPicker.setValue([]);

    showToast(t('toast-log-added'), { type: 'success' });
    if (overlapsWith(added, store.getTimeLogs()).length) {
      showToast(t('toast-overlap-warning'), { type: 'info' });
    }
    renderTodayLogs();
  });

  // Stop the timer from the tray menu (main process)
  if (window.weTimer && window.weTimer.onStopRequest) {
    window.weTimer.onStopRequest(() => {
      if (store.getActiveTimer()) {
        withBudgetCheck(() => stopTimerWithLockCheck());
        document.getElementById('timer-desc').value = '';
        refreshTimerUI();
      }
    });
  }

  // Check if a timer was already running on load
  refreshTimerUI();
}
