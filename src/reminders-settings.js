// Settings section "Timer and reminders". Everything here is carried out by
// the main process (it works with the window closed), so the section is shown
// only in the desktop build (window.weTimer present).
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { getReminderSettings, hotkeyLabel } from './timer-settings.js';

// Monday first, as calendars in both languages show it.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function intIn(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (value === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function notifyMain() {
  if (window.weTimer && window.weTimer.settingsChanged) window.weTimer.settingsChanged();
}

function save(patch) {
  const current = getReminderSettings(store.getSettings());
  const next = {
    ...current,
    ...patch,
    workReminder: { ...current.workReminder, ...(patch.workReminder || {}) }
  };
  // The store subscription below tells main about the change.
  store.updateSettings({ reminders: next });
  return next;
}

export function initReminderSettings() {
  const section = document.getElementById('settings-reminders-section');
  if (!section || !window.weTimer) return;
  section.style.display = 'block';

  const idleInput = document.getElementById('rem-idle-minutes');
  const longInput = document.getElementById('rem-long-hours');
  const workToggle = document.getElementById('rem-work-enabled');
  const workDetails = document.getElementById('rem-work-details');
  const daysBox = document.getElementById('rem-work-days');
  const fromInput = document.getElementById('rem-work-from');
  const toInput = document.getElementById('rem-work-to');
  const intervalInput = document.getElementById('rem-work-interval');
  const hotkeyToggle = document.getElementById('rem-hotkey-enabled');
  const hotkeyKeys = document.getElementById('rem-hotkey-keys');
  const loginRow = document.getElementById('rem-login-row');
  const loginToggle = document.getElementById('rem-login-enabled');

  hotkeyKeys.textContent = hotkeyLabel(window.weTimer.platform === 'darwin');

  // Day chips: labels come from i18n, so they follow the language.
  DAY_ORDER.forEach(day => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'rem-day-chip';
    chip.setAttribute('data-day', String(day));
    chip.setAttribute('data-i18n', `rem-day-${day}`);
    chip.textContent = t(`rem-day-${day}`);
    chip.addEventListener('click', () => {
      const days = new Set(getReminderSettings(store.getSettings()).workReminder.days);
      if (days.has(day)) days.delete(day);
      else days.add(day);
      save({ workReminder: { days: [...days].sort((a, b) => a - b) } });
      render();
    });
    daysBox.appendChild(chip);
  });

  const render = () => {
    const r = getReminderSettings(store.getSettings());
    idleInput.value = r.idleMinutes;
    longInput.value = r.longTimerHours;
    workToggle.checked = r.workReminder.enabled;
    workDetails.classList.toggle('disabled', !r.workReminder.enabled);
    daysBox.querySelectorAll('.rem-day-chip').forEach(chip => {
      chip.classList.toggle('active', r.workReminder.days.includes(Number(chip.getAttribute('data-day'))));
    });
    fromInput.value = r.workReminder.from;
    toInput.value = r.workReminder.to;
    intervalInput.value = r.workReminder.intervalMinutes;
    hotkeyToggle.checked = r.hotkeyEnabled;
  };

  idleInput.addEventListener('change', () => {
    save({ idleMinutes: intIn(idleInput.value, 0, 240, 10) });
    render();
  });
  longInput.addEventListener('change', () => {
    save({ longTimerHours: intIn(longInput.value, 0, 24, 4) });
    render();
  });
  workToggle.addEventListener('change', () => {
    save({ workReminder: { enabled: workToggle.checked } });
    render();
  });
  [fromInput, toInput].forEach(input => {
    input.addEventListener('change', () => {
      if (!/^\d{2}:\d{2}$/.test(input.value)) {
        render();
        return;
      }
      save({ workReminder: { from: fromInput.value, to: toInput.value } });
      render();
    });
  });
  intervalInput.addEventListener('change', () => {
    save({ workReminder: { intervalMinutes: intIn(intervalInput.value, 5, 240, 30) } });
    render();
  });
  hotkeyToggle.addEventListener('change', () => {
    save({ hotkeyEnabled: hotkeyToggle.checked });
    render();
  });

  // Launch at login lives in the OS, so it is read from there every time.
  if (window.weTimer.getOpenAtLogin && window.weTimer.setOpenAtLogin) {
    loginRow.style.display = '';
    window.weTimer.getOpenAtLogin().then(res => {
      loginToggle.checked = !!(res && res.ok && res.openAtLogin);
    });
    loginToggle.addEventListener('change', async () => {
      const res = await window.weTimer.setOpenAtLogin(loginToggle.checked);
      if (!res || !res.ok) {
        showToast(t('rem-login-failed'), { type: 'error' });
        loginToggle.checked = !loginToggle.checked;
        return;
      }
      loginToggle.checked = !!res.openAtLogin;
    });
  } else {
    loginRow.style.display = 'none';
  }

  render();
  // A cloud pull or an import can bring other settings: keep the controls
  // and main in step with the store.
  let last = JSON.stringify(store.getSettings());
  store.subscribe(() => {
    const now = JSON.stringify(store.getSettings());
    if (now === last) return;
    last = now;
    render();
    notifyMain();
  });
  notifyMain();
}
