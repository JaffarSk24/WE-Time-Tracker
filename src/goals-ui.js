// WE Time Tracker - goals in the UI: the Settings block and the compact
// progress cards at the top of the Timer view and the Dashboard.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { goalProgress, normalizeGoals, formatGoalHours } from './goals.js';

function formatValue(value, unit, lang) {
  return unit === 'h'
    ? `${formatGoalHours(value, lang)} ${t('unit-hours-short')}`
    : `${value.toFixed(2)} €`;
}

export function renderGoalsCard(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const lang = store.getSettings().language;
  const progress = goalProgress(store.getCollection('timeLogs'), store.getSettings().goals);
  if (progress.length === 0) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = progress.map(g => `
    <div class="goal-item ${g.ratio >= 1 ? 'done' : ''}">
      <div class="goal-item-head">
        <span class="goal-item-label">${t('goal-' + g.key)}</span>
        <span class="goal-item-percent">${g.percent}%</span>
      </div>
      <div class="goal-item-value">${formatValue(g.value, g.unit, lang)} / ${formatValue(g.target, g.unit, lang)}</div>
      <div class="goal-bar"><div class="goal-bar-fill" style="width: ${Math.min(100, g.ratio * 100)}%;"></div></div>
    </div>
  `).join('');
}

const FIELDS = {
  weekHours: 'settings-goal-week-hours',
  weekAmount: 'settings-goal-week-amount',
  monthAmount: 'settings-goal-month-amount'
};

export function initGoalsSettings() {
  const goals = normalizeGoals(store.getSettings().goals);
  Object.entries(FIELDS).forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = goals[key] === null ? '' : goals[key];
    input.addEventListener('change', () => {
      const next = normalizeGoals({ ...store.getSettings().goals, [key]: input.value });
      if (input.value !== '' && next[key] === null) input.value = '';
      store.updateSettings({ goals: next });
      showToast(t('toast-saved'), { type: 'success', duration: 2000 });
    });
  });
}
