// WE Time Tracker: split one entry in two, or merge several entries into
// one (Reports & Logs). Paid and locked entries are never touched, so the
// auto payment invariant stays as it is. Undo through the toast.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { toLocalDatetimeString } from './utils.js';
import { splitLog, mergeLogs, mergeBlocker } from './timesheet.js';

let splittingLogId = null;

// Lock hook from another feature (may be absent).
function isLocked(log) {
  return typeof store.isLogLocked === 'function' && !!store.isLogLocked(log);
}

// Shows the reason and returns false when the entries cannot be changed.
function checkEditable(logs) {
  if (logs.some(l => l.paid)) {
    showToast(t('toast-paid-locked'), { type: 'error' });
    return false;
  }
  if (logs.some(isLocked)) {
    showToast(t('toast-log-locked'), { type: 'error' });
    return false;
  }
  return true;
}

function findLog(id) {
  return store.getTimeLogs().find(l => l.id === id);
}

function formatMoment(iso) {
  const lang = store.getSettings().language;
  return new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

// ---------------- SPLIT ----------------
export function openSplitModal(id) {
  const log = findLog(id);
  if (!log || !checkEditable([log])) return;
  splittingLogId = id;

  const start = new Date(log.startTime).getTime();
  const end = new Date(log.endTime).getTime();
  // Default: the middle of the entry, to the minute
  const middle = new Date(Math.round((start + end) / 2 / 60000) * 60000);
  const input = document.getElementById('split-log-at');
  input.min = toLocalDatetimeString(log.startTime);
  input.max = toLocalDatetimeString(log.endTime);
  input.value = toLocalDatetimeString(middle);
  document.getElementById('split-log-info').textContent = t('split-info', {
    start: formatMoment(log.startTime),
    end: formatMoment(log.endTime)
  });
  document.getElementById('split-log-modal').classList.add('active');
}

function closeSplitModal() {
  document.getElementById('split-log-modal').classList.remove('active');
  splittingLogId = null;
}

function saveSplit() {
  const log = splittingLogId && findLog(splittingLogId);
  if (!log) {
    closeSplitModal();
    return;
  }
  if (!checkEditable([log])) return;
  const value = document.getElementById('split-log-at').value;
  const parts = value ? splitLog(log, new Date(value), store.newId('log')) : null;
  if (!parts) {
    showToast(t('split-outside'), { type: 'error' });
    return;
  }

  const original = { ...log };
  const [first, second] = parts;
  store.upsertRecord('timeLogs', first);
  store.upsertRecord('timeLogs', second);
  closeSplitModal();
  showToast(t('toast-split-done'), {
    type: 'success',
    actionLabel: t('toast-undo'),
    onAction: () => {
      store.deleteRecord('timeLogs', second.id);
      store.upsertRecord('timeLogs', original);
    }
  });
}

// ---------------- MERGE ----------------
// Whether the merge button makes sense for these entries: paid or locked
// ones keep it enabled so the click can explain why it is refused.
export function canOfferMerge(ids) {
  const logs = ids.map(findLog).filter(Boolean);
  const reason = mergeBlocker(logs);
  return reason === null || reason === 'paid';
}

export function mergeSelected(ids) {
  const logs = ids.map(findLog).filter(Boolean);
  if (logs.length < 2 || !checkEditable(logs)) return false;
  if (mergeBlocker(logs) !== null) {
    showToast(t('merge-mismatch'), { type: 'error' });
    return false;
  }

  const merged = mergeLogs(logs);
  const original = { ...logs.find(l => l.id === merged.id) };
  const others = logs.filter(l => l.id !== merged.id).map(l => l.id);
  store.upsertRecord('timeLogs', merged);
  const removed = store.deleteTimeLogs(others);
  showToast(t('toast-merge-done'), {
    type: 'success',
    actionLabel: t('toast-undo'),
    onAction: () => {
      store.upsertRecord('timeLogs', original);
      store.restoreTimeLogs(removed);
    }
  });
  return true;
}

export function initSplitMerge() {
  document.getElementById('split-log-modal-close').addEventListener('click', closeSplitModal);
  document.getElementById('split-log-modal-cancel').addEventListener('click', closeSplitModal);
  document.getElementById('split-log-modal-save').addEventListener('click', saveSplit);
}
