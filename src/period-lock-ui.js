// Locked periods: UI glue (settings block, toasts, read-only edit modal).
// The rules themselves live in period-lock.js and are enforced by the store.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { normalizeLockDate } from './period-lock.js';
import { dayKeyToLocalDate } from './utils.js';

function formatLockDate(dayKey) {
  const lang = store.getSettings().language;
  try {
    return dayKeyToLocalDate(dayKey).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US');
  } catch (e) {
    return dayKey;
  }
}

export function lockReasonText(reason) {
  return reason === 'paid' ? t('lock-reason-paid') : t('lock-reason-period');
}

// Shows why the last store call was refused. Returns true when it was.
export function toastLastLockError() {
  const err = store.lastLockError;
  if (!err) return false;
  showToast(lockReasonText(err.reason), { type: 'error' });
  return true;
}

// For bulk actions: "N locked entries skipped", nothing when none were.
export function toastSkippedLocked() {
  const err = store.lastLockError;
  if (!err || !err.count) return;
  showToast(`${t('lock-skipped', { count: err.count })}. ${lockReasonText(err.reason)}`, { type: 'info' });
}

// Stops the running timer. The period lock protects billed history and must
// never drop new work: the entry is saved even when it starts inside the
// locked period, the user only gets a warning to check it.
export function stopTimerWithLockCheck() {
  const log = store.stopTimer();
  if (log && store.isLogLocked(log)) {
    showToast(t('lock-timer-saved'), { type: 'info', duration: 7000 });
  }
  return log;
}

// ---------------- Settings block ----------------
function refreshLockSettings() {
  const input = document.getElementById('settings-lock-date');
  const clearBtn = document.getElementById('settings-lock-clear-btn');
  if (!input) return;
  const value = store.getLockedUntil();
  if (document.activeElement !== input) input.value = value;
  if (clearBtn) clearBtn.disabled = !value;
}

export function initLockSettings() {
  const input = document.getElementById('settings-lock-date');
  const clearBtn = document.getElementById('settings-lock-clear-btn');
  if (!input) return;

  input.addEventListener('change', () => {
    const value = normalizeLockDate(input.value);
    if (value === store.getLockedUntil()) return;
    store.updateSettings({ lockedUntil: value });
    showToast(value ? t('lock-set-toast', { date: formatLockDate(value) }) : t('lock-cleared-toast'), { type: 'success' });
    refreshLockSettings();
  });

  clearBtn.addEventListener('click', () => {
    if (!store.getLockedUntil()) return;
    store.updateSettings({ lockedUntil: '' });
    showToast(t('lock-cleared-toast'), { type: 'success' });
    refreshLockSettings();
  });

  refreshLockSettings();
  // Import or a sync can change the setting while Settings is open.
  store.subscribe(refreshLockSettings);
}

// ---------------- Edit log modal ----------------
const EDIT_FIELDS = [
  'edit-log-desc', 'edit-log-client', 'edit-log-project', 'edit-log-start',
  'edit-log-end', 'edit-log-rate', 'edit-log-billable', 'edit-log-paid'
];

// Puts the edit modal into read-only mode for a locked entry (or back).
// onChange runs after the lock was lifted from the modal, to reopen it.
export function applyEditLogLock(log, onChange) {
  const note = document.getElementById('edit-log-lock-note');
  const noteText = document.getElementById('edit-log-lock-text');
  const openBtn = document.getElementById('edit-log-lock-open-btn');
  const unmarkBtn = document.getElementById('edit-log-lock-unmark-btn');
  const confirmBox = document.getElementById('edit-log-lock-confirm');
  const confirmText = document.getElementById('edit-log-lock-confirm-text');
  const confirmYes = document.getElementById('edit-log-lock-confirm-yes');
  const confirmNo = document.getElementById('edit-log-lock-confirm-no');
  const saveBtn = document.getElementById('edit-log-modal-save');
  if (!note) return;

  const reason = log ? store.logLockReason(log) : null;
  const locked = reason !== null;

  EDIT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (locked) el.disabled = true;
    // The project select's enabled state depends on the client and is set by
    // openEditLogModal before this runs, so it is left alone here.
    else if (id !== 'edit-log-project') el.disabled = false;
  });
  if (saveBtn) saveBtn.style.display = locked ? 'none' : '';

  note.hidden = !locked;
  confirmBox.hidden = true;
  if (!locked) return;

  const lockedUntil = store.getLockedUntil();
  noteText.textContent = reason === 'period'
    ? t('lock-note-period', { date: formatLockDate(lockedUntil) })
    : t('lock-note-paid');
  // "Unlock period" only when the date is the only lock on this entry.
  openBtn.hidden = !(reason === 'period' && !log.paid);
  unmarkBtn.hidden = reason !== 'paid';

  openBtn.onclick = () => {
    confirmText.textContent = t('lock-open-confirm', { date: formatLockDate(lockedUntil) });
    confirmBox.hidden = false;
  };
  confirmNo.onclick = () => {
    confirmBox.hidden = true;
  };
  confirmYes.onclick = () => {
    store.updateSettings({ lockedUntil: '' });
    showToast(t('lock-cleared-toast'), { type: 'success' });
    refreshLockSettings();
    if (onChange) onChange();
  };
  unmarkBtn.onclick = () => {
    if (store.setLogsPaid([log.id], false)) {
      showToast(t('lock-unmarked-toast'), { type: 'success' });
      if (onChange) onChange();
    } else {
      toastLastLockError();
    }
  };
}
