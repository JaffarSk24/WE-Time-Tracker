// Week view numbers of the phone web app: hours per day of a week (Monday
// first), totals and the billable amount. Days are local days, money is
// billableHours(logDurationMs(log)) * rate as everywhere in the app.

import { logDurationMs, billableHours, localDayKey } from '../utils.js';

// Local midnight of the Monday of the week holding the date.
export function weekStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

// The seven local days from the given Monday (calendar days, so a change to
// or from summer time does not shift them).
export function weekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

export function shiftWeek(monday, weeks) {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weeks * 7);
}

export function logAmount(log) {
  if (!log || !log.billable) return 0;
  return billableHours(logDurationMs(log)) * (log.rateAtTime || 0);
}

// { days: [{ key, date, ms, amount, logs }], totalMs, billableMs, amount }
// A log belongs to the local day it started on, as in Reports.
export function summarizeWeek(logs, monday) {
  const days = weekDays(monday).map(date => ({ key: localDayKey(date), date, ms: 0, amount: 0, logs: [] }));
  const byKey = new Map(days.map(d => [d.key, d]));
  let totalMs = 0;
  let billableMs = 0;
  let amount = 0;
  (logs || []).forEach(log => {
    const day = byKey.get(localDayKey(log.startTime));
    if (!day) return;
    const ms = Math.max(0, logDurationMs(log));
    const money = logAmount(log);
    day.ms += ms;
    day.amount += money;
    day.logs.push(log);
    totalMs += ms;
    if (log.billable) billableMs += ms;
    amount += money;
  });
  days.forEach(d => d.logs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)));
  return { days, totalMs, billableMs, amount };
}

// "12.50 €" as the app shows amounts.
export function formatMoney(value) {
  return `${(Number(value) || 0).toFixed(2)} €`;
}

// Elapsed worked time of a running timer, respecting pauses.
export function timerElapsedMs(timer, nowMs = Date.now()) {
  if (!timer) return 0;
  let elapsed = timer.accumulatedTime || 0;
  if (!timer.isPaused && timer.startTime) elapsed += nowMs - new Date(timer.startTime).getTime();
  return Math.max(0, elapsed);
}

// Checks a manual or edited entry: null when fine, else an i18n key.
export function entryError({ clientId, start, end }) {
  if (!clientId) return 'toast-select-client';
  if (!start || !end) return 'toast-fill-times';
  if (new Date(end) <= new Date(start)) return 'toast-end-after-start';
  return null;
}
