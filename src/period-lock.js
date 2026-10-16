// Locked periods: protects billed history from accidental changes.
// Pure helpers used by the store (enforcement) and by the UI (icons, notes).
//
// An entry is locked when:
//   - it is paid (log.paid === true): unmark it as paid first to change it;
//   - or its LOCAL start day is on or before settings.lockedUntil (YYYY-MM-DD).
//
// Rule for the running timer: the lock protects billed history, it must never
// drop new work. Stopping a timer that started inside the locked period still
// saves the entry; the UI only warns about it (see stopTimer in store.js).

import { localDayKey } from './utils.js';

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// A valid lock date or '' (lock off).
export function normalizeLockDate(value) {
  const v = String(value || '').trim();
  return DAY_KEY_RE.test(v) ? v : '';
}

// True when the local day of the given time is inside the locked period.
export function isTimeInLockedPeriod(isoOrDate, lockedUntil) {
  const lock = normalizeLockDate(lockedUntil);
  if (!lock || !isoOrDate) return false;
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return false;
  // Day keys are zero-padded, so string comparison is date order.
  return localDayKey(d) <= lock;
}

// Why an entry is locked: 'period' (date lock, wins when both apply because
// unmarking payment would not help), 'paid', or null when it can be changed.
export function logLockReason(log, lockedUntil) {
  if (!log) return null;
  if (isTimeInLockedPeriod(log.startTime, lockedUntil)) return 'period';
  if (log.paid === true) return 'paid';
  return null;
}

export function isLogLockedBy(log, lockedUntil) {
  return logLockReason(log, lockedUntil) !== null;
}
