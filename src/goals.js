// WE Time Tracker - weekly and monthly goals (pure computation).
// settings.goals = { weekHours, weekAmount, monthAmount }; an empty value
// turns that goal off. Weeks start on Monday, local time.
import { logDurationMs, billableHours } from './utils.js';

export const GOAL_KEYS = ['weekHours', 'weekAmount', 'monthAmount'];

// Local Monday 00:00 of the week containing now, and the next Monday.
export function weekRange(now = new Date()) {
  const diff = (now.getDay() + 6) % 7; // days since Monday
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}

export function monthRange(now = new Date()) {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
  };
}

function target(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Clean goals object (only positive numbers, the rest null).
export function normalizeGoals(goals) {
  const g = goals || {};
  return {
    weekHours: target(g.weekHours),
    weekAmount: target(g.weekAmount),
    monthAmount: target(g.monthAmount)
  };
}

export function hasGoals(goals) {
  const g = normalizeGoals(goals);
  return GOAL_KEYS.some(k => g[k] !== null);
}

// Billable hours (worked time) and amount of billable entries in a range.
// countAmount(log), optional: whether the entry's amount counts (amount goals
// are in the default currency, other currencies are left out).
export function billableTotals(logs, range, countAmount = null) {
  let ms = 0;
  let amount = 0;
  (logs || []).forEach(log => {
    if (!log || !log.billable) return;
    const start = new Date(log.startTime);
    if (start < range.start || start >= range.end) return;
    const dur = logDurationMs(log);
    if (dur <= 0) return;
    ms += dur;
    if (!countAmount || countAmount(log)) amount += billableHours(dur) * (log.rateAtTime || 0);
  });
  return { hours: ms / 3600000, amount };
}

// Progress of every active goal, in GOAL_KEYS order:
// [{ key, unit: 'h'|'eur', value, target, ratio, percent }].
export function goalProgress(logs, goals, now = new Date(), countAmount = null) {
  const g = normalizeGoals(goals);
  const result = [];
  if (g.weekHours === null && g.weekAmount === null && g.monthAmount === null) return result;
  const week = billableTotals(logs, weekRange(now), countAmount);
  const month = g.monthAmount !== null ? billableTotals(logs, monthRange(now), countAmount) : null;
  const push = (key, unit, value, goal) => {
    const ratio = value / goal;
    result.push({ key, unit, value, target: goal, ratio, percent: Math.floor(ratio * 100) });
  };
  if (g.weekHours !== null) push('weekHours', 'h', week.hours, g.weekHours);
  if (g.weekAmount !== null) push('weekAmount', 'eur', week.amount, g.weekAmount);
  if (g.monthAmount !== null) push('monthAmount', 'eur', month.amount, g.monthAmount);
  return result;
}

// Hours with at most one decimal, decimal comma in Russian: 12.5 -> "12,5".
export function formatGoalHours(hours, lang) {
  const rounded = Math.round((Number(hours) || 0) * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return lang === 'ru' ? text.replace('.', ',') : text;
}

// Whole euros, decimal comma in Russian when there are cents.
export function formatGoalAmount(amount, lang) {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return lang === 'ru' ? text.replace('.', ',') : text;
}

// Tray texts live here (not in i18n.js) so the main process can use this
// module without the renderer store, like the other tray menu labels.
const TRAY_TEXT = {
  ru: { goal: 'Цель', h: 'ч' },
  en: { goal: 'Goal', h: 'h' }
};

// Short label for the menu-bar tray, e.g. "Цель: 12,5 / 30 ч".
// Shows the first active goal (week hours, then week amount, then month
// amount); empty string when no goal is set.
export function goalTrayLabel(logs, goals, lang = 'en', now = new Date(), countAmount = null, symbol = '€') {
  const first = goalProgress(logs, goals, now, countAmount)[0];
  if (!first) return '';
  const text = TRAY_TEXT[lang] || TRAY_TEXT.en;
  if (first.unit === 'h') {
    return `${text.goal}: ${formatGoalHours(first.value, lang)} / ${formatGoalHours(first.target, lang)} ${text.h}`;
  }
  return `${text.goal}: ${formatGoalAmount(first.value, lang)} / ${formatGoalAmount(first.target, lang)} ${symbol}`;
}
