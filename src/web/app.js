// The phone web app: Timer and Week screens over the same store as the
// desktop app, with a status line for the Google account and sync.

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '../style.css';
import './web.css';
import {
  createIcons,
  CalendarDays, ChevronLeft, ChevronRight, LogIn, LogOut, Pause, Play, Plus,
  RefreshCw, Square, Timer, Trash2, X
} from 'lucide';
import { store } from '../store.js';
import { t, translatePage } from '../i18n.js';
import { showToast } from '../toast.js';
import {
  fillSelect, escapeHtml, toLocalDatetimeString, localDayKey,
  formatDurationHMS, formatDurationShort, logDurationMs
} from '../utils.js';
import { addWebTranslations } from './i18n-web.js';
import { weekStart, shiftWeek, summarizeWeek, formatMoney, timerElapsedMs, entryError, logAmount } from './week.js';
import { createCloud } from './cloud.js';
import { signIn, isSignedIn, getAccount, finishRedirectSignIn, signOut, validToken } from './auth.js';
import { isClientConfigured } from './config.js';

const usedIcons = {
  CalendarDays, ChevronLeft, ChevronRight, LogIn, LogOut, Pause, Play, Plus,
  RefreshCw, Square, Timer, Trash2, X
};
const icons = () => createIcons({ icons: usedIcons });

const THEME_COLORS = { dark: '#090b11', light: '#f8fafc' };
// Coming back to the app more often than this does not ask the cloud again.
const RETURN_PULL_GAP_MS = 15000;

const $ = (id) => document.getElementById(id);

let cloud = null;
let screen = 'timer';
let monday = weekStart(new Date());
let selectedDay = localDayKey(new Date());
let editingId = null;
let clockTimer = null;
let lastReturnPull = 0;

function lang() {
  return store.getSettings().language === 'ru' ? 'ru' : 'en';
}

function locale() {
  return lang() === 'ru' ? 'ru-RU' : 'en-US';
}

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

function hours(ms) {
  return formatDurationShort(ms / 3600000, lang());
}

function clientName(id) {
  const c = store.getClients().find(x => x.id === id);
  return c ? c.name : '';
}

function projectName(id) {
  const p = store.getProjects().find(x => x.id === id);
  return p ? p.name : '';
}

// ---------------- Settings: language and theme ----------------

function applySettings() {
  const theme = store.getSettings().theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('lang', lang());
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
  translatePage();
}

// ---------------- Status line ----------------

function syncTimeText(iso) {
  const d = new Date(iso);
  const sameDay = localDayKey(d) === localDayKey(new Date());
  return sameDay
    ? timeOf(iso)
    : d.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderStatus(view = cloud.status()) {
  const account = getAccount();
  $('w-email').textContent = account ? account.email : '';
  const text = view.key ? t(view.key, view.time ? { time: syncTimeText(view.time) } : null) : '';
  $('w-sync-text').textContent = text;
  $('w-account-sync').textContent = text;
  $('w-renew-btn').hidden = !view.renew;
  $('w-sync-btn').hidden = Boolean(view.renew);
  $('w-sync-btn').disabled = view.key === 'web-syncing';
  $('w-sync-btn').classList.toggle('spinning', view.key === 'web-syncing');
}

// Toasts for what a sync did. Automatic syncs stay quiet unless something
// from another device was merged in.
function report(res, asked) {
  if (!res) return;
  if (res.ok) {
    if (res.merged) showToast(t('web-merged'), { type: 'success' });
    else if (!asked) return;
    else if (res.pulled) showToast(t('web-pulled'), { type: 'success' });
    else if (res.pushed) showToast(t('gdrive-synced'), { type: 'success' });
    else showToast(t('web-up-to-date'), { type: 'info' });
    return;
  }
  if (res.scopeDenied) showToast(t('web-scope-denied'), { type: 'error', duration: 10000 });
  else if (!asked || res.error === 'busy' || res.renew) return;
  else if (res.offline) showToast(t('web-offline'), { type: 'info' });
  else showToast(t('web-sync-failed', { error: res.error || '' }), { type: 'error' });
}

function signInFailed(res) {
  if (!res || res.error === 'cancelled') return;
  if (res.error === 'drive_scope') showToast(t('web-scope-denied'), { type: 'error', duration: 10000 });
  else showToast(t('web-signin-failed', { error: res.error || '' }), { type: 'error' });
}

// ---------------- Timer screen ----------------

function fillProjects(select, clientId, selected) {
  if (clientId) {
    fillSelect(select, store.getProjects(clientId), t('timer-project-placeholder'), selected);
    select.disabled = false;
  } else {
    fillSelect(select, [], t('timer-project-placeholder'));
    select.disabled = true;
  }
}

function tickClock() {
  const timer = store.getActiveTimer();
  $('w-clock').textContent = formatDurationHMS(timerElapsedMs(timer));
}

function renderTimer() {
  const timer = store.getActiveTimer();
  const clock = $('w-clock');
  clearInterval(clockTimer);
  clockTimer = null;

  $('w-timer-fields').hidden = Boolean(timer);
  $('w-running-info').hidden = !timer;
  $('w-pause-btn').hidden = !timer;
  $('w-cancel-btn').hidden = !timer;

  const toggle = $('w-toggle-btn');
  toggle.classList.toggle('running', Boolean(timer));
  toggle.innerHTML = `<i data-lucide="${timer ? 'square' : 'play'}"></i><span>${escapeHtml(t(timer ? 'timer-stop' : 'timer-start'))}</span>`;

  if (timer) {
    $('w-running-desc').textContent = timer.description || t('no-description');
    $('w-running-meta').textContent = [clientName(timer.clientId), projectName(timer.projectId)].filter(Boolean).join(' · ');
    $('w-timer-state').textContent = timer.isPaused ? t('web-paused') : '';
    $('w-pause-btn').innerHTML = `<i data-lucide="${timer.isPaused ? 'play' : 'pause'}"></i><span>${escapeHtml(t(timer.isPaused ? 'timer-resume' : 'timer-pause'))}</span>`;
    clock.classList.toggle('running', !timer.isPaused);
    tickClock();
    if (!timer.isPaused) clockTimer = setInterval(tickClock, 500);
  } else {
    const client = $('w-client');
    const keepClient = client.value;
    fillSelect(client, store.getClients(), t('timer-client-placeholder'), keepClient);
    fillProjects($('w-project'), client.value, $('w-project').value);
    $('w-timer-state').textContent = t('web-timer-idle');
    clock.classList.remove('running');
    clock.textContent = '00:00:00';
  }
  renderToday();
}

function logRow(log, { withContinue }) {
  const row = document.createElement('div');
  row.className = 'w-log';
  row.dataset.id = log.id;
  const meta = [clientName(log.clientId), projectName(log.projectId)].filter(Boolean).join(' · ');
  const amount = logAmount(log);
  row.innerHTML = `
    <button class="w-log-main" type="button" data-edit="${escapeHtml(log.id)}">
      <span class="w-log-desc ${log.description ? '' : 'empty'}">${escapeHtml(log.description || t('no-description'))}</span>
      <span class="w-log-meta">${escapeHtml(meta)}</span>
      <span class="w-log-time">${escapeHtml(timeOf(log.startTime))} - ${escapeHtml(timeOf(log.endTime))}</span>
    </button>
    <div class="w-log-side">
      <span class="w-log-duration">${formatDurationHMS(logDurationMs(log))}</span>
      ${amount > 0 ? `<span class="w-log-amount">${formatMoney(amount)}</span>` : ''}
    </div>
    ${withContinue ? `<button class="w-icon-btn w-continue" type="button" data-continue="${escapeHtml(log.id)}" aria-label="${escapeHtml(t('web-continue'))}"><i data-lucide="play"></i></button>` : ''}
  `;
  return row;
}

function renderList(container, logs, opts) {
  container.innerHTML = '';
  if (!logs.length) {
    const empty = document.createElement('div');
    empty.className = 'w-empty';
    empty.textContent = opts.emptyText;
    container.appendChild(empty);
    return;
  }
  logs.forEach(log => container.appendChild(logRow(log, opts)));
}

function totalsText(logs) {
  const ms = logs.reduce((s, l) => s + Math.max(0, logDurationMs(l)), 0);
  const money = logs.reduce((s, l) => s + logAmount(l), 0);
  return logs.length ? `${hours(ms)}${money > 0 ? ' · ' + formatMoney(money) : ''}` : '';
}

function renderToday() {
  const today = localDayKey(new Date());
  const logs = store.getTimeLogs().filter(l => localDayKey(l.startTime) === today);
  renderList($('w-today-list'), logs, { withContinue: true, emptyText: t('today-no-logs') });
  $('w-today-totals').textContent = totalsText(logs);
  icons();
}

function stopTimer() {
  if (!store.getActiveTimer()) return;
  store.stopTimer();
  showToast(t('web-entry-saved'), { type: 'success' });
  cloud.run('stop').then(res => report(res, false));
}

function initTimerScreen() {
  $('w-client').addEventListener('change', () => fillProjects($('w-project'), $('w-client').value, null));

  $('w-toggle-btn').addEventListener('click', () => {
    if (store.getActiveTimer()) {
      stopTimer();
      $('w-desc').value = '';
      return;
    }
    const clientId = $('w-client').value;
    if (!clientId) {
      showToast(t('toast-select-client'), { type: 'error' });
      return;
    }
    store.startTimer($('w-desc').value, clientId, $('w-project').value, $('w-billable').checked);
  });

  $('w-pause-btn').addEventListener('click', () => {
    const timer = store.getActiveTimer();
    if (!timer) return;
    if (timer.isPaused) store.resumeTimer();
    else store.pauseTimer();
  });

  // No confirmation dialog: the toast offers to bring the timer back.
  $('w-cancel-btn').addEventListener('click', () => {
    const timer = store.getActiveTimer();
    if (!timer) return;
    const saved = { ...timer };
    store.cancelTimer();
    showToast(t('web-timer-cancelled'), {
      type: 'info',
      actionLabel: t('toast-undo'),
      onAction: () => {
        if (store.getActiveTimer()) return;
        store.state.activeTimer = saved;
        store.saveState();
      }
    });
  });

  $('w-manual-btn').addEventListener('click', () => openEntrySheet(null));
}

// Taps on entries of both lists: edit, or continue the task.
function initListTaps() {
  document.addEventListener('click', (e) => {
    const cont = e.target.closest('[data-continue]');
    if (cont) {
      const log = store.getTimeLogs().find(l => l.id === cont.dataset.continue);
      if (!log) return;
      if (store.getActiveTimer()) stopTimer();
      store.startTimer(log.description || '', log.clientId, log.projectId, log.billable);
      showToast(t('toast-timer-started'), { type: 'success' });
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      const log = store.getTimeLogs().find(l => l.id === edit.dataset.edit);
      if (log) openEntrySheet(log);
    }
  });
}

// ---------------- Week screen ----------------

function renderWeek() {
  const summary = summarizeWeek(store.getTimeLogs(), monday);
  const days = summary.days;
  const fmt = (d) => d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  $('w-week-range').textContent = `${fmt(days[0].date)} - ${fmt(days[6].date)}`;
  $('w-week-total').textContent = hours(summary.totalMs);
  $('w-week-billable').textContent = hours(summary.billableMs);
  $('w-week-amount').textContent = formatMoney(summary.amount);

  if (!days.some(d => d.key === selectedDay)) {
    const today = localDayKey(new Date());
    selectedDay = days.some(d => d.key === today) ? today : days[0].key;
  }
  const max = Math.max(...days.map(d => d.ms), 1);
  const today = localDayKey(new Date());
  const container = $('w-days');
  container.innerHTML = '';
  days.forEach(day => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-day' + (day.key === selectedDay ? ' selected' : '') + (day.key === today ? ' today' : '');
    btn.dataset.day = day.key;
    const name = day.date.toLocaleDateString(locale(), { weekday: 'short' });
    btn.innerHTML = `
      <span class="w-day-name">${escapeHtml(name)} <small>${day.date.getDate()}</small></span>
      <span class="w-day-bar"><span style="width:${Math.round((day.ms / max) * 100)}%"></span></span>
      <span class="w-day-hours">${day.ms ? escapeHtml(hours(day.ms)) : ''}</span>
      <span class="w-day-amount">${day.amount > 0 ? formatMoney(day.amount) : ''}</span>
    `;
    btn.addEventListener('click', () => {
      selectedDay = day.key;
      renderWeek();
    });
    container.appendChild(btn);
  });

  const day = days.find(d => d.key === selectedDay);
  const title = day.date.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  $('w-day-title').textContent = title.charAt(0).toUpperCase() + title.slice(1);
  $('w-day-totals').textContent = totalsText(day.logs);
  renderList($('w-day-list'), day.logs, { withContinue: false, emptyText: t('web-day-empty') });
  icons();
}

function initWeekScreen() {
  $('w-week-prev').addEventListener('click', () => { monday = shiftWeek(monday, -1); renderWeek(); });
  $('w-week-next').addEventListener('click', () => { monday = shiftWeek(monday, 1); renderWeek(); });
  $('w-week-prev').setAttribute('aria-label', t('web-week-prev'));
  $('w-week-next').setAttribute('aria-label', t('web-week-next'));
}

// ---------------- Entry sheet ----------------

let entryOriginal = null;

function openSheet(id) {
  $(id).hidden = false;
  document.body.classList.add('w-sheet-open');
}

function closeSheets() {
  document.querySelectorAll('.w-sheet-overlay').forEach(el => { el.hidden = true; });
  document.body.classList.remove('w-sheet-open');
  editingId = null;
}

function openEntrySheet(log) {
  editingId = log ? log.id : null;
  $('w-entry-title').textContent = log ? t('web-entry-edit') : t('timer-manual-title');
  $('w-entry-save').textContent = log ? t('save') : t('timer-manual-add');
  $('w-entry-delete').hidden = !log;
  $('w-entry-desc').value = log ? log.description || '' : '';
  const clientId = log ? log.clientId : $('w-client').value;
  fillSelect($('w-entry-client'), store.getClients(), t('timer-client-placeholder'), clientId);
  fillProjects($('w-entry-project'), $('w-entry-client').value, log ? log.projectId : null);
  let start;
  let end;
  if (log) {
    start = toLocalDatetimeString(log.startTime);
    end = toLocalDatetimeString(log.endTime);
  } else {
    const now = new Date();
    now.setSeconds(0, 0);
    end = toLocalDatetimeString(now);
    start = toLocalDatetimeString(new Date(now.getTime() - 3600000));
  }
  $('w-entry-start').value = start;
  $('w-entry-end').value = end;
  $('w-entry-billable').checked = log ? log.billable !== false : true;
  entryOriginal = { start, end };
  openSheet('w-entry-sheet');
}

function saveEntry() {
  const clientId = $('w-entry-client').value;
  const startVal = $('w-entry-start').value;
  const endVal = $('w-entry-end').value;
  const error = entryError({ clientId, start: startVal, end: endVal });
  if (error) {
    showToast(t(error), { type: 'error' });
    return;
  }
  const fields = {
    description: $('w-entry-desc').value,
    clientId,
    projectId: $('w-entry-project').value || null,
    billable: $('w-entry-billable').checked
  };
  if (editingId) {
    // Times are sent only when changed: an untouched entry keeps the worked
    // time of its pauses.
    const patch = { ...fields };
    if (startVal !== entryOriginal.start || endVal !== entryOriginal.end) {
      patch.startTime = new Date(startVal).toISOString();
      patch.endTime = new Date(endVal).toISOString();
    }
    store.updateTimeLog(editingId, patch);
    showToast(t('toast-saved'), { type: 'success' });
  } else {
    store.addTimeLog({ ...fields, startTime: new Date(startVal).toISOString(), endTime: new Date(endVal).toISOString() });
    showToast(t('toast-log-added'), { type: 'success' });
  }
  closeSheets();
}

function deleteEntry() {
  if (!editingId) return;
  const removed = store.deleteTimeLogs([editingId]);
  closeSheets();
  if (!removed.length) return;
  showToast(t('toast-log-deleted'), {
    type: 'info',
    actionLabel: t('toast-undo'),
    onAction: () => store.restoreTimeLogs(removed),
    duration: 7000
  });
}

function initSheets() {
  $('w-entry-client').addEventListener('change', () => fillProjects($('w-entry-project'), $('w-entry-client').value, null));
  $('w-entry-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveEntry();
  });
  $('w-entry-delete').addEventListener('click', deleteEntry);
  document.querySelectorAll('.w-sheet-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) closeSheets();
    });
  });
  $('w-account-btn').addEventListener('click', () => {
    const account = getAccount();
    $('w-account-email').textContent = account ? account.email : '';
    openSheet('w-account-sheet');
  });
  $('w-signout-btn').addEventListener('click', async () => {
    closeSheets();
    await signOut();
    cloud.forget();
    showToast(t('web-signed-out'), { type: 'info' });
    showScreens();
  });
}

// ---------------- Navigation and screens ----------------

function showScreen(name) {
  screen = name;
  document.querySelectorAll('.w-screen').forEach(el => { el.hidden = el.dataset.screen !== name; });
  document.querySelectorAll('.w-tab').forEach(el => el.classList.toggle('active', el.dataset.target === name));
  if (name === 'week') renderWeek();
  window.scrollTo(0, 0);
}

function showScreens() {
  const signedIn = isSignedIn();
  $('w-signin').hidden = signedIn;
  $('w-status').hidden = !signedIn;
  $('w-main').hidden = !signedIn;
  $('w-tabs').hidden = !signedIn;
  if (!signedIn) {
    const configured = isClientConfigured();
    $('w-signin-btn').disabled = !configured;
    $('w-signin-note').hidden = configured;
    $('w-signin-note').textContent = configured ? '' : t('web-not-configured');
    return;
  }
  renderStatus();
  renderTimer();
  if (screen === 'week') renderWeek();
}

function renderAll() {
  applySettings();
  if (!isSignedIn()) {
    showScreens();
    return;
  }
  renderStatus();
  renderTimer();
  if (screen === 'week') renderWeek();
  icons();
}

// The cloud copy replaced or was merged into the local data.
function reloadStore() {
  store.state = store.loadState();
  if (store.migrateAutoPaymentsForPaidLogs()) store.saveStateDirectly(store.state);
  store.notify();
}

function initSync() {
  $('w-signin-btn').addEventListener('click', () => {
    const label = $('w-signin-btn').querySelector('span');
    label.textContent = t('web-signin-waiting');
    signIn().then(res => {
      label.textContent = t('web-signin-btn');
      if (!res.ok) return signInFailed(res);
      showScreens();
      return cloud.run('open').then(r => report(r, false));
    });
  });

  // Called straight from the tap: a sign-in window may only open from one.
  $('w-sync-btn').addEventListener('click', () => {
    if (validToken()) {
      cloud.run('button').then(res => report(res, true));
      return;
    }
    signIn().then(res => {
      if (!res.ok) return signInFailed(res);
      return cloud.run('button').then(r => report(r, true));
    });
  });

  $('w-renew-btn').addEventListener('click', () => {
    signIn().then(res => {
      if (!res.ok) return signInFailed(res);
      renderStatus();
      return cloud.run('renewed').then(r => report(r, false));
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cloud.run('hide');
      return;
    }
    if (Date.now() - lastReturnPull < RETURN_PULL_GAP_MS) return;
    lastReturnPull = Date.now();
    // The day may have changed while the app was away.
    renderAll();
    cloud.run('return').then(res => report(res, false));
  });
  window.addEventListener('online', () => cloud.run('online').then(res => report(res, false)));
  window.addEventListener('offline', () => cloud.setOffline());
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker not registered:', err && err.message));
}

export async function startWebApp() {
  addWebTranslations();
  cloud = createCloud({ onLocalReplaced: reloadStore, onStatus: (view) => { if (isSignedIn()) renderStatus(view); } });

  initTimerScreen();
  initWeekScreen();
  initListTaps();
  initSheets();
  initSync();
  document.querySelectorAll('.w-tab').forEach(tab => tab.addEventListener('click', () => showScreen(tab.dataset.target)));

  store.subscribe(renderAll);
  renderAll();
  showScreens();
  icons();
  registerServiceWorker();

  // A sign-in that had to leave the page ends here.
  if (await finishRedirectSignIn()) showScreens();
  if (isSignedIn()) {
    lastReturnPull = Date.now();
    report(await cloud.run('open'), false);
  }
}
