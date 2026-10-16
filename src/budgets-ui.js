// WE Time Tracker - project budgets in the UI: progress bars on project cards
// and in the Timer view, and one toast per threshold per period after a save.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { projectBudgetUsage, hasBudget, budgetLevel, budgetAlertToRaise } from './budgets.js';
import { formatGoalHours } from './goals.js';
import { formatMoney } from './utils.js';
import { currencyOfClient } from './currency.js';

function formatHours(hours, lang) {
  return `${formatGoalHours(hours, lang)} ${t('unit-hours-short')}`;
}

function barHtml(used, limit, ratio) {
  const percent = Math.floor(ratio * 100);
  const width = Math.min(100, Math.max(0, ratio * 100));
  return `
    <div class="budget-line level-${budgetLevel(ratio)}">
      <div class="budget-line-text"><span>${used} / ${limit}</span><span class="budget-line-percent">${percent}%</span></div>
      <div class="budget-bar"><div class="budget-bar-fill" style="width: ${width}%;"></div></div>
    </div>`;
}

// Bars (hours and/or euros) of a budget usage; empty string without a budget.
// currency: the project's client currency (amount budgets are in it).
export function budgetBarsHtml(usage, currency) {
  if (!usage) return '';
  const lang = store.getSettings().language;
  const lines = [];
  if (usage.limitHours) {
    lines.push(barHtml(formatHours(usage.usedHours, lang), formatHours(usage.limitHours, lang), usage.hoursRatio));
  }
  if (usage.limitAmount) {
    lines.push(barHtml(formatMoney(usage.usedAmount, currency), formatMoney(usage.limitAmount, currency), usage.amountRatio));
  }
  const periodText = usage.period === 'month' ? t('budget-this-month') : t('budget-in-total');
  return `
    <div class="budget-block">
      <div class="budget-block-title">${t('budget-section')} · ${periodText}</div>
      ${lines.join('')}
    </div>`;
}

export function projectUsage(project, extraLogs = []) {
  return projectBudgetUsage(project, [...store.getCollection('timeLogs'), ...extraLogs]);
}

// The running timer as a not yet saved entry, so the Timer view bar moves
// while the timer runs.
function runningEntry(timer) {
  let elapsed = timer.accumulatedTime || 0;
  if (!timer.isPaused && timer.startTime) {
    elapsed += Date.now() - new Date(timer.startTime).getTime();
  }
  const start = timer.originalStartTime || timer.startTime || new Date().toISOString();
  return {
    id: '__running__',
    projectId: timer.projectId,
    startTime: start,
    endTime: new Date(new Date(start).getTime() + elapsed).toISOString(),
    durationMs: elapsed,
    billable: timer.billable !== false,
    rateAtTime: store.getRate(timer.clientId, timer.projectId)
  };
}

let lastTimerBudgetRender = 0;

// Budget of the project selected (or running) in the Timer view.
// throttle: called from the clock tick, redraw at most every 15 seconds.
export function renderTimerBudget(throttle = false) {
  const el = document.getElementById('timer-budget');
  if (!el) return;
  if (throttle && Date.now() - lastTimerBudgetRender < 15000) return;
  lastTimerBudgetRender = Date.now();

  const timer = store.getActiveTimer();
  const select = document.getElementById('timer-project-select');
  const projectId = timer ? timer.projectId : (select ? select.value : '');
  const project = projectId ? store.getProjects().find(p => p.id === projectId) : null;

  if (!project || !hasBudget(project)) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  const usage = projectUsage(project, timer && timer.projectId === project.id ? [runningEntry(timer)] : []);
  el.hidden = false;
  el.innerHTML = budgetBarsHtml(usage, currencyOfClient(project.clientId));
}

// Runs a save (timer stop, manual entry, edit) and announces any budget
// threshold it crossed for the current period. Returns what fn returns.
export function withBudgetCheck(fn) {
  const before = new Map();
  store.getProjects().forEach(project => {
    if (hasBudget(project)) before.set(project.id, projectUsage(project));
  });

  const result = fn();

  store.getProjects().forEach(project => {
    if (!hasBudget(project)) return;
    const after = projectUsage(project);
    const level = budgetAlertToRaise(project, before.get(project.id), after);
    if (!level) return;
    store.patchRecord('projects', project.id, { budgetAlert: { period: after.key, level } });
    const key = level === 'over' ? 'budget-toast-over' : 'budget-toast-warning';
    showToast(t(key, { name: project.name, percent: Math.floor(after.ratio * 100) }), {
      type: level === 'over' ? 'error' : 'info',
      duration: 7000
    });
  });
  return result;
}

// Budget fields of the project modal.
export function fillBudgetFields(project) {
  document.getElementById('project-modal-budget-hours').value = project && project.budgetHours ? project.budgetHours : '';
  document.getElementById('project-modal-budget-amount').value = project && project.budgetAmount ? project.budgetAmount : '';
  document.getElementById('project-modal-budget-period').value = project && project.budgetPeriod === 'month' ? 'month' : 'total';
}

function readNumber(id) {
  const value = document.getElementById(id).value;
  const n = Number(value);
  return value === '' || !Number.isFinite(n) || n <= 0 ? null : n;
}

// Saves the budget fields onto the project. A changed budget forgets the
// thresholds already announced, so the new limits get their own toasts.
export function saveBudgetFields(projectId) {
  const project = store.getProjects().find(p => p.id === projectId);
  if (!project) return;
  const patch = {
    budgetHours: readNumber('project-modal-budget-hours'),
    budgetAmount: readNumber('project-modal-budget-amount'),
    budgetPeriod: document.getElementById('project-modal-budget-period').value === 'month' ? 'month' : 'total'
  };
  const changed = (project.budgetHours ?? null) !== patch.budgetHours
    || (project.budgetAmount ?? null) !== patch.budgetAmount
    || (project.budgetPeriod || 'total') !== patch.budgetPeriod;
  if (!changed) return;
  if (project.budgetAlert) patch.budgetAlert = null;
  store.patchRecord('projects', projectId, patch);
}
