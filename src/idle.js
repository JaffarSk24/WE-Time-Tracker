// "You were away" prompt. The main process notices the absence (idle input,
// sleep, lock screen) even with the window closed, opens the window and sends
// { startMs, endMs } here; the time math lives in store.discardIdle.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { refreshTimerUI } from './timer.js';
import { absenceParts } from './timer-settings.js';
import { withBudgetCheck } from './budgets-ui.js';

let current = null;

// The prompt still fits the timer: it runs, and it has been running since
// before the absence began (no pause, stop or restart meanwhile).
function applies(prompt) {
  const timer = store.getActiveTimer();
  if (!prompt || !timer || timer.isPaused || !timer.startTime) return false;
  return new Date(timer.startTime).getTime() <= prompt.startMs;
}

function resolve() {
  current = null;
  if (window.weTimer && window.weTimer.idleResolved) window.weTimer.idleResolved();
}

function close() {
  document.getElementById('idle-modal').classList.remove('active');
}

function show(prompt) {
  if (!applies(prompt)) {
    resolve();
    return;
  }
  current = prompt;
  const parts = absenceParts(prompt.startMs, prompt.endMs, store.getSettings().language);
  document.getElementById('idle-modal-text').textContent = t('idle-text', parts);
  document.getElementById('idle-modal').classList.add('active');
}

function discard(stop) {
  const prompt = current;
  close();
  if (!applies(prompt)) {
    showToast(t('idle-outdated'), { type: 'info' });
    return;
  }
  const ok = withBudgetCheck(() => store.discardIdle(prompt.startMs, { stop, endMs: prompt.endMs }));
  if (ok && stop) {
    const desc = document.getElementById('timer-desc');
    if (desc) desc.value = '';
  }
  refreshTimerUI();
  showToast(t(stop ? 'idle-discarded-stopped' : 'idle-discarded'), { type: 'success' });
}

export function initIdlePrompt() {
  const modal = document.getElementById('idle-modal');
  if (!modal || !window.weTimer || !window.weTimer.onIdlePrompt) return;

  document.getElementById('idle-keep').addEventListener('click', close);
  document.getElementById('idle-modal-close').addEventListener('click', close);
  document.getElementById('idle-discard-continue').addEventListener('click', () => discard(false));
  document.getElementById('idle-discard-stop').addEventListener('click', () => discard(true));

  // However the modal closes (a button, Esc, the backdrop), main forgets the
  // prompt; closing without a discard keeps the time.
  new window.MutationObserver(() => {
    if (!modal.classList.contains('active') && current) resolve();
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });

  window.weTimer.onIdlePrompt(show);
}
