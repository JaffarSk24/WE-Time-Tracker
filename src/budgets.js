// WE Time Tracker - project budgets and retainers (pure computation).
// A project may carry budgetHours and/or budgetAmount (euros) and a
// budgetPeriod: 'total' (whole project) or 'month' (a package that resets
// every calendar month, local time). No store or DOM access here.
import { logDurationMs, billableHours } from './utils.js';

export const BUDGET_WARNING_RATIO = 0.8;
export const BUDGET_PERIODS = ['total', 'month'];

const LEVEL_RANK = { normal: 0, warning: 1, over: 2 };

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Normalized budget of a project, or null when it has none.
export function projectBudget(project) {
  if (!project) return null;
  const hours = positive(project.budgetHours);
  const amount = positive(project.budgetAmount);
  if (hours === null && amount === null) return null;
  const period = project.budgetPeriod === 'month' ? 'month' : 'total';
  return { hours, amount, period };
}

export function hasBudget(project) {
  return projectBudget(project) !== null;
}

// Key of the current budget period: 'total', or the local month 'YYYY-MM'.
export function budgetPeriodKey(period, now = new Date()) {
  if (period !== 'month') return 'total';
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Local boundaries of the current period ({ start, end }, end exclusive),
// or null for the whole project.
export function budgetPeriodRange(period, now = new Date()) {
  if (period !== 'month') return null;
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
  };
}

export function budgetLevel(ratio) {
  if (ratio >= 1) return 'over';
  if (ratio >= BUDGET_WARNING_RATIO) return 'warning';
  return 'normal';
}

export function levelRank(level) {
  return LEVEL_RANK[level] || 0;
}

// Usage of a project's budget in the current period, or null without a budget.
// Hours count every entry of the project (worked time); euros count billable
// entries at the rate frozen on the entry. options.excludeLogId leaves one
// entry out (its state before a save).
export function projectBudgetUsage(project, logs, now = new Date(), options = {}) {
  const budget = projectBudget(project);
  if (!budget) return null;
  const range = budgetPeriodRange(budget.period, now);

  let usedMs = 0;
  let usedAmount = 0;
  (logs || []).forEach(log => {
    if (!log || log.projectId !== project.id) return;
    if (options.excludeLogId && log.id === options.excludeLogId) return;
    if (range) {
      const start = new Date(log.startTime);
      if (start < range.start || start >= range.end) return;
    }
    const ms = logDurationMs(log);
    if (ms > 0) usedMs += ms;
    if (log.billable) usedAmount += billableHours(ms) * (log.rateAtTime || 0);
  });

  const usedHours = usedMs / 3600000;
  const hoursRatio = budget.hours ? usedHours / budget.hours : null;
  const amountRatio = budget.amount ? usedAmount / budget.amount : null;
  const ratio = Math.max(hoursRatio || 0, amountRatio || 0);

  return {
    period: budget.period,
    key: budgetPeriodKey(budget.period, now),
    usedHours,
    usedAmount,
    limitHours: budget.hours,
    limitAmount: budget.amount,
    hoursRatio,
    amountRatio,
    ratio,
    level: budgetLevel(ratio)
  };
}

// Which threshold toast a save should raise, or null. A toast is due when the
// save moved the project to a higher level than before, and that level was
// not already announced in this period (project.budgetAlert = { period, level }).
export function budgetAlertToRaise(project, before, after) {
  if (!after || after.level === 'normal') return null;
  const beforeRank = before && before.key === after.key ? levelRank(before.level) : 0;
  if (levelRank(after.level) <= beforeRank) return null;
  const alert = project && project.budgetAlert;
  const announcedRank = alert && alert.period === after.key ? levelRank(alert.level) : 0;
  if (levelRank(after.level) <= announcedRank) return null;
  return after.level;
}
