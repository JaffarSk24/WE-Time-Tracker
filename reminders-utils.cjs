// Pure logic for idle detection and reminders, used by the main process
// (electron-main.cjs). On macOS the app keeps running in the menu bar with no
// window, so none of this may depend on the renderer. Covered by
// tests/reminders-utils.test.js.

// Defaults of settings.reminders. src/timer-settings.js keeps the same object
// for the renderer; a test makes sure the two never drift apart.
const REMINDER_DEFAULTS = {
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

const HOTKEY = 'CommandOrControl+Alt+Shift+T';

// The user counts as active when the last input was less than this long ago.
const ACTIVE_IDLE_SECONDS = 60;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function numberOr(value, fallback, min, max) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function timeOr(value, fallback) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

// settings.reminders from the data file, with defaults for anything missing
// or invalid. Never throws.
function mergeReminderSettings(settings) {
  const d = REMINDER_DEFAULTS;
  const r = (settings && typeof settings.reminders === 'object' && settings.reminders) || {};
  const w = (r.workReminder && typeof r.workReminder === 'object') ? r.workReminder : {};
  const days = Array.isArray(w.days)
    ? [...new Set(w.days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
    : clone(d.workReminder.days);
  return {
    idleMinutes: numberOr(r.idleMinutes, d.idleMinutes, 0, 1440),
    longTimerHours: numberOr(r.longTimerHours, d.longTimerHours, 0, 48),
    workReminder: {
      enabled: typeof w.enabled === 'boolean' ? w.enabled : d.workReminder.enabled,
      days,
      from: timeOr(w.from, d.workReminder.from),
      to: timeOr(w.to, d.workReminder.to),
      intervalMinutes: numberOr(w.intervalMinutes, d.workReminder.intervalMinutes, 5, 1440)
    },
    hotkeyEnabled: typeof r.hotkeyEnabled === 'boolean' ? r.hotkeyEnabled : d.hotkeyEnabled
  };
}

// Worked time of the active timer at nowMs (pauses excluded).
function timerElapsedMs(timer, nowMs) {
  if (!timer) return 0;
  let elapsed = timer.accumulatedTime || 0;
  if (!timer.isPaused && timer.startTime) {
    elapsed += Math.max(0, nowMs - new Date(timer.startTime).getTime());
  }
  return elapsed;
}

function isRunning(timer) {
  return !!(timer && !timer.isPaused && timer.startTime);
}

// --- Idle / absence state machine ---
// State: { awayStartMs, segment, system, locked }.
// awayStartMs: when the absence began (null when the user is here);
// segment: startTime of the running timer when the absence began, so a pause,
// resume, stop or a new timer meanwhile cancels the absence;
// system: the absence came from sleep or the lock screen (ends only with
// resume/unlock, not by the idle counter); locked: the screen is locked.
// Each step returns { state, prompt } where prompt is { startMs, endMs } when
// the user is back from an absence worth asking about.

function createIdleState() {
  return { awayStartMs: null, segment: null, system: false, locked: false };
}

function resetAway(state) {
  return { ...state, awayStartMs: null, segment: null, system: false };
}

function absenceApplies(state, timer) {
  return state.awayStartMs !== null && isRunning(timer) && timer.startTime === state.segment;
}

function finish(state, timer, endMs, thresholdMs) {
  const ok = absenceApplies(state, timer) && endMs - state.awayStartMs >= thresholdMs;
  const prompt = ok ? { startMs: state.awayStartMs, endMs } : null;
  return { state: resetAway(state), prompt };
}

// Regular poll. input: { nowMs, idleSeconds, timer, idleMinutes }.
function idleTick(state, { nowMs, idleSeconds, timer, idleMinutes }) {
  const thresholdMs = (Number(idleMinutes) || 0) * 60000;
  if (thresholdMs <= 0 || !isRunning(timer)) {
    return { state: resetAway(state), prompt: null };
  }
  if (state.awayStartMs !== null && timer.startTime !== state.segment) {
    state = resetAway(state);
  }
  const idleMs = Math.max(0, (Number(idleSeconds) || 0) * 1000);
  const segmentStartMs = new Date(timer.startTime).getTime();

  if (state.awayStartMs === null) {
    if (idleMs >= thresholdMs) {
      // An absence cannot begin before the running stretch of the timer.
      const start = Math.max(nowMs - idleMs, segmentStartMs);
      return { state: { ...state, awayStartMs: start, segment: timer.startTime, system: false }, prompt: null };
    }
    return { state, prompt: null };
  }

  if (state.system) return { state, prompt: null };

  // The idle counter dropped: the user touched the keyboard or mouse.
  if (idleMs < thresholdMs) {
    return finish(state, timer, nowMs - idleMs, thresholdMs);
  }
  return { state, prompt: null };
}

// Sleep or lock screen. kind: 'suspend' | 'lock'.
function idleSystemAway(state, { nowMs, timer, idleMinutes, kind }) {
  const next = { ...state, locked: kind === 'lock' ? true : state.locked };
  if (!(Number(idleMinutes) > 0) || !isRunning(timer)) return { state: next, prompt: null };
  if (next.awayStartMs !== null && timer.startTime === next.segment) {
    // Already away (idle first, then the lid closed): keep the earlier start.
    return { state: { ...next, system: true }, prompt: null };
  }
  const start = Math.max(nowMs, new Date(timer.startTime).getTime());
  return { state: { ...next, awayStartMs: start, segment: timer.startTime, system: true }, prompt: null };
}

// Wake or unlock. kind: 'resume' | 'unlock'. After a wake with the screen
// still locked the user is not back yet: wait for the unlock.
function idleSystemBack(state, { nowMs, timer, idleMinutes, kind }) {
  const next = { ...state, locked: kind === 'unlock' ? false : state.locked };
  if (next.awayStartMs === null) return { state: next, prompt: null };
  if (kind === 'resume' && next.locked) return { state: next, prompt: null };
  return finish(next, timer, nowMs, (Number(idleMinutes) || 0) * 60000);
}

// --- Reminders ---

// Long-running timer: notify once every `hours` of worked time. lastLevel is
// how many such periods were already announced for this timer.
// Returns the level to announce, or 0.
function longTimerDue({ timer, nowMs, hours, lastLevel = 0 }) {
  const periodMs = (Number(hours) || 0) * 3600000;
  if (periodMs <= 0 || !isRunning(timer)) return 0;
  const level = Math.floor(timerElapsedMs(timer, nowMs) / periodMs);
  return level >= 1 && level > lastLevel ? level : 0;
}

function minutesOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Whether a local moment falls inside the working hours (days 0 = Sunday).
// A range like 22:00-02:00 wraps over midnight.
function inWorkingHours(date, work) {
  if (!work.days.includes(date.getDay())) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const from = minutesOfDay(work.from);
  const to = minutesOfDay(work.to);
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

// "No timer running" reminder. idleSince: since when nothing has been running
// (ms); lastNotifiedMs: the previous such reminder. The first one comes an
// interval after the timer stopped, never right away.
function workReminderDue({ nowMs, work, timer, idleSeconds, idleSinceMs, lastNotifiedMs = null }) {
  if (!work || !work.enabled || isRunning(timer)) return false;
  if ((Number(idleSeconds) || 0) >= ACTIVE_IDLE_SECONDS) return false;
  if (!inWorkingHours(new Date(nowMs), work)) return false;
  const intervalMs = work.intervalMinutes * 60000;
  const since = Math.max(idleSinceMs || 0, lastNotifiedMs || 0);
  return nowMs - since >= intervalMs;
}

// --- Texts shown by the main process (it cannot use src/i18n.js) ---
const TEXTS = {
  ru: {
    longTitle: 'Таймер идёт уже {hours}',
    longBody: '{task}. Не забыли остановить?',
    workTitle: 'Таймер не запущен',
    workBody: 'Сейчас рабочее время. Начать отслеживание?',
    startedTitle: 'Таймер запущен',
    stoppedTitle: 'Таймер остановлен',
    nothingTitle: 'Нечего продолжить',
    nothingBody: 'Пока нет записей для продолжения.',
    noDescription: 'Без описания',
    recentHeader: 'Начать снова',
    hours: '{n} ч'
  },
  en: {
    longTitle: 'The timer has been running for {hours}',
    longBody: '{task}. Forgot to stop it?',
    workTitle: 'No timer running',
    workBody: 'It is working time. Start tracking?',
    startedTitle: 'Timer started',
    stoppedTitle: 'Timer stopped',
    nothingTitle: 'Nothing to continue',
    nothingBody: 'There are no entries to continue yet.',
    noDescription: 'No description',
    recentHeader: 'Start again',
    hours: '{n} h'
  }
};

function mainText(lang, key, params = null) {
  const dict = TEXTS[lang === 'ru' ? 'ru' : 'en'];
  const text = dict[key] || TEXTS.en[key] || key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

module.exports = {
  REMINDER_DEFAULTS,
  HOTKEY,
  ACTIVE_IDLE_SECONDS,
  mergeReminderSettings,
  timerElapsedMs,
  isRunning,
  createIdleState,
  idleTick,
  idleSystemAway,
  idleSystemBack,
  longTimerDue,
  inWorkingHours,
  workReminderDue,
  mainText
};
