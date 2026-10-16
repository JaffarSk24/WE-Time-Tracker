// Settings of "Timer and reminders" (settings.reminders in the data file).
// The main process keeps the same defaults in reminders-utils.cjs, which the
// packaged app ships next to electron-main.cjs; a test keeps both equal.

export const REMINDER_DEFAULTS = {
  idleMinutes: 10,
  longTimerHours: 4,
  workReminder: {
    enabled: true,
    days: [1, 2, 3, 4, 5],
    from: '09:00',
    to: '18:00',
    intervalMinutes: 30
  },
  hotkeyEnabled: true
};

export const HOTKEY = 'CommandOrControl+Alt+Shift+T';

// Saved reminder settings with defaults filled in.
export function getReminderSettings(settings) {
  const saved = (settings && settings.reminders) || {};
  return {
    ...REMINDER_DEFAULTS,
    ...saved,
    workReminder: {
      ...REMINDER_DEFAULTS.workReminder,
      ...(saved.workReminder || {}),
      days: Array.isArray(saved.workReminder && saved.workReminder.days)
        ? [...saved.workReminder.days]
        : [...REMINDER_DEFAULTS.workReminder.days]
    }
  };
}

// How the hotkey reads on this system.
export function hotkeyLabel(isMac) {
  return isMac ? '⌘⌥⇧T' : 'Ctrl+Alt+Shift+T';
}

// Parts of "Вас не было 42 мин (12:10-12:52)": the length and local times.
export function absenceParts(startMs, endMs, lang) {
  const total = Math.max(1, Math.round((endMs - startMs) / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const ru = lang === 'ru';
  const duration = h === 0
    ? `${m} ${ru ? 'мин' : 'min'}`
    : `${h} ${ru ? 'ч' : 'h'}${m ? ` ${m} ${ru ? 'мин' : 'min'}` : ''}`;
  const locale = ru ? 'ru-RU' : 'en-US';
  const fmt = (ms) => new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return { duration, from: fmt(startMs), to: fmt(endMs) };
}
