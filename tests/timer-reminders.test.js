import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { store } from '../src/store.js';
import { REMINDER_DEFAULTS as RENDERER_DEFAULTS, HOTKEY as RENDERER_HOTKEY, getReminderSettings, absenceParts } from '../src/timer-settings.js';
import { logDurationMs } from '../src/utils.js';

const require = createRequire(import.meta.url);
const R = require('../reminders-utils.cjs');
const T = require('../tray-utils.cjs');

const MIN = 60000;
const HOUR = 3600000;
const T0 = new Date(2026, 9, 14, 12, 0, 0).getTime(); // Wednesday 12:00 local

beforeEach(() => {
  store.clearAllData();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('settings defaults', () => {
  it('renderer and main agree', () => {
    expect(RENDERER_DEFAULTS).toEqual(R.REMINDER_DEFAULTS);
    expect(RENDERER_HOTKEY).toBe(R.HOTKEY);
    expect(getReminderSettings({})).toEqual(R.mergeReminderSettings({}));
  });

  it('merges saved values over the defaults', () => {
    const saved = { reminders: { idleMinutes: 0, workReminder: { days: [6, 0], to: '17:30' } } };
    const merged = R.mergeReminderSettings(saved);
    expect(merged.idleMinutes).toBe(0);
    expect(merged.longTimerHours).toBe(4);
    expect(merged.workReminder).toEqual({ enabled: true, days: [0, 6], from: '09:00', to: '17:30', intervalMinutes: 30 });
    expect(getReminderSettings(saved).workReminder.to).toBe('17:30');
    expect(getReminderSettings(saved).workReminder.from).toBe('09:00');
  });

  it('falls back to defaults for broken values', () => {
    const merged = R.mergeReminderSettings({ reminders: { idleMinutes: 'x', longTimerHours: -3, workReminder: { from: '25:00', days: 'Mon' }, hotkeyEnabled: 'yes' } });
    expect(merged.idleMinutes).toBe(10);
    expect(merged.longTimerHours).toBe(0);
    expect(merged.workReminder.from).toBe('09:00');
    expect(merged.workReminder.days).toEqual([1, 2, 3, 4, 5]);
    expect(merged.hotkeyEnabled).toBe(true);
    expect(R.mergeReminderSettings(null).idleMinutes).toBe(10);
  });

  it('formats an absence', () => {
    expect(absenceParts(T0, T0 + 42 * MIN, 'ru').duration).toBe('42 мин');
    expect(absenceParts(T0, T0 + 95 * MIN, 'en').duration).toBe('1 h 35 min');
    expect(absenceParts(T0, T0 + 60 * MIN, 'ru').duration).toBe('1 ч');
  });
});

describe('store: stop at a given moment and discard idle time', () => {
  function runningTimer() {
    const c = store.addClient('Acme', 60);
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    store.startTimer('Work', c.id, null, true);
    return c;
  }

  it('stopTimer ends the entry at the given moment', () => {
    runningTimer();
    vi.setSystemTime(T0 + 90 * MIN);
    const log = store.stopTimer(T0 + 30 * MIN);
    expect(log.endTime).toBe(new Date(T0 + 30 * MIN).toISOString());
    expect(logDurationMs(log)).toBe(30 * MIN);
  });

  it('stopTimer never ends in the future', () => {
    runningTimer();
    vi.setSystemTime(T0 + 10 * MIN);
    const log = store.stopTimer(T0 + 60 * MIN);
    expect(logDurationMs(log)).toBe(10 * MIN);
  });

  it('discard and stop: the entry ends when the absence started', () => {
    runningTimer();
    vi.setSystemTime(T0 + 80 * MIN);
    const log = store.discardIdle(T0 + 20 * MIN, { stop: true });
    expect(log.startTime).toBe(new Date(T0).toISOString());
    expect(log.endTime).toBe(new Date(T0 + 20 * MIN).toISOString());
    expect(logDurationMs(log)).toBe(20 * MIN);
    expect(store.getActiveTimer()).toBeNull();
  });

  it('discard and continue keeps the original start and drops the absence', () => {
    runningTimer();
    vi.setSystemTime(T0 + 62 * MIN);
    expect(store.discardIdle(T0 + 20 * MIN, { endMs: T0 + 60 * MIN })).toBe(true);
    const timer = store.getActiveTimer();
    expect(timer.isPaused).toBe(false);
    expect(R.timerElapsedMs(timer, T0 + 62 * MIN)).toBe(22 * MIN);
    vi.setSystemTime(T0 + 70 * MIN);
    const log = store.stopTimer();
    expect(log.startTime).toBe(new Date(T0).toISOString());
    expect(log.endTime).toBe(new Date(T0 + 70 * MIN).toISOString());
    expect(log.durationMs).toBe(30 * MIN);
  });

  it('works with pauses before the absence', () => {
    runningTimer();
    vi.setSystemTime(T0 + 10 * MIN);
    store.pauseTimer();
    vi.setSystemTime(T0 + 20 * MIN);
    store.resumeTimer();
    vi.setSystemTime(T0 + 60 * MIN);
    const log = store.discardIdle(T0 + 30 * MIN, { stop: true });
    expect(log.durationMs).toBe(20 * MIN);
    expect(log.endTime).toBe(new Date(T0 + 30 * MIN).toISOString());
  });

  it('refuses when the timer was paused, restarted or stopped meanwhile', () => {
    runningTimer();
    vi.setSystemTime(T0 + 40 * MIN);
    store.pauseTimer();
    expect(store.discardIdle(T0 + 20 * MIN)).toBe(false);
    store.resumeTimer();
    expect(store.discardIdle(T0 + 20 * MIN)).toBe(false); // the absence began before this run
    store.stopTimer();
    expect(store.discardIdle(T0 + 20 * MIN, { stop: true })).toBe(false);
  });
});

describe('idle state machine', () => {
  const timer = { startTime: new Date(T0).toISOString(), isPaused: false, accumulatedTime: 0 };
  const tick = (st, at, idleSec, tm = timer, idleMinutes = 10) =>
    R.idleTick(st, { nowMs: T0 + at, idleSeconds: idleSec, timer: tm, idleMinutes });

  it('asks after an absence longer than the threshold', () => {
    let st = R.createIdleState();
    ({ state: st } = tick(st, 20 * MIN, 0));
    expect(st.awayStartMs).toBeNull();
    let r = tick(st, 41 * MIN, 11 * 60); // idle since 30 min
    expect(r.state.awayStartMs).toBe(T0 + 30 * MIN);
    expect(r.prompt).toBeNull();
    r = tick(r.state, 72 * MIN, 2); // back at 71:58
    expect(r.prompt).toEqual({ startMs: T0 + 30 * MIN, endMs: T0 + 72 * MIN - 2000 });
    expect(r.state.awayStartMs).toBeNull();
  });

  it('ignores short idleness and a disabled threshold', () => {
    let r = tick(R.createIdleState(), 30 * MIN, 5 * 60);
    expect(r.state.awayStartMs).toBeNull();
    r = tick(R.createIdleState(), 30 * MIN, 50 * 60, timer, 0);
    expect(r.state.awayStartMs).toBeNull();
  });

  it('forgets the absence when the timer stops or is paused meanwhile', () => {
    let r = tick(R.createIdleState(), 41 * MIN, 11 * 60);
    expect(r.state.awayStartMs).not.toBeNull();
    let r2 = tick(r.state, 50 * MIN, 20 * 60, null);
    expect(r2.state.awayStartMs).toBeNull();
    r2 = tick(r.state, 50 * MIN, 20 * 60, { ...timer, isPaused: true, startTime: null });
    expect(r2.state.awayStartMs).toBeNull();
    // Paused and resumed: a different running stretch, the old absence is gone.
    const resumed = { ...timer, startTime: new Date(T0 + 55 * MIN).toISOString(), accumulatedTime: 40 * MIN };
    r2 = tick(r.state, 56 * MIN, 0, resumed);
    expect(r2.prompt).toBeNull();
  });

  it('the absence never starts before the timer', () => {
    const r = tick(R.createIdleState(), 15 * MIN, 30 * 60);
    expect(r.state.awayStartMs).toBe(T0);
  });

  it('sleep and lock start an absence that ends on wake or unlock', () => {
    const args = (at, kind) => ({ nowMs: T0 + at, timer, idleMinutes: 10, kind });
    let r = R.idleSystemAway(R.createIdleState(), args(10 * MIN, 'suspend'));
    expect(r.state.awayStartMs).toBe(T0 + 10 * MIN);
    // The idle counter is small right after a wake; it must not end the absence.
    r = tick(r.state, 15 * MIN, 0);
    expect(r.prompt).toBeNull();
    r = R.idleSystemBack(r.state, args(55 * MIN, 'resume'));
    expect(r.prompt).toEqual({ startMs: T0 + 10 * MIN, endMs: T0 + 55 * MIN });
  });

  it('a wake on the lock screen waits for the unlock', () => {
    const args = (at, kind) => ({ nowMs: T0 + at, timer, idleMinutes: 10, kind });
    let r = R.idleSystemAway(R.createIdleState(), args(10 * MIN, 'lock'));
    r = R.idleSystemAway(r.state, args(11 * MIN, 'suspend'));
    expect(r.state.awayStartMs).toBe(T0 + 10 * MIN);
    r = R.idleSystemBack(r.state, args(50 * MIN, 'resume'));
    expect(r.prompt).toBeNull();
    r = R.idleSystemBack(r.state, args(52 * MIN, 'unlock'));
    expect(r.prompt).toEqual({ startMs: T0 + 10 * MIN, endMs: T0 + 52 * MIN });
  });

  it('idle first, then sleep keeps the earlier start', () => {
    let r = tick(R.createIdleState(), 41 * MIN, 11 * 60);
    r = R.idleSystemAway(r.state, { nowMs: T0 + 45 * MIN, timer, idleMinutes: 10, kind: 'suspend' });
    r = R.idleSystemBack(r.state, { nowMs: T0 + 90 * MIN, timer, idleMinutes: 10, kind: 'resume' });
    expect(r.prompt).toEqual({ startMs: T0 + 30 * MIN, endMs: T0 + 90 * MIN });
  });

  it('a short sleep or no running timer asks nothing', () => {
    let r = R.idleSystemAway(R.createIdleState(), { nowMs: T0 + 10 * MIN, timer, idleMinutes: 10, kind: 'suspend' });
    r = R.idleSystemBack(r.state, { nowMs: T0 + 15 * MIN, timer, idleMinutes: 10, kind: 'resume' });
    expect(r.prompt).toBeNull();
    r = R.idleSystemAway(R.createIdleState(), { nowMs: T0, timer: null, idleMinutes: 10, kind: 'suspend' });
    expect(r.state.awayStartMs).toBeNull();
  });
});

describe('reminders', () => {
  const running = { startTime: new Date(T0).toISOString(), isPaused: false, accumulatedTime: 0 };
  const work = R.mergeReminderSettings({}).workReminder;
  const at = (day, h, m = 0) => new Date(2026, 9, day, h, m).getTime(); // Oct 2026: 12 = Monday

  it('long timer: once per period of worked time', () => {
    expect(R.longTimerDue({ timer: running, nowMs: T0 + 3 * HOUR, hours: 4 })).toBe(0);
    expect(R.longTimerDue({ timer: running, nowMs: T0 + 4 * HOUR + MIN, hours: 4 })).toBe(1);
    expect(R.longTimerDue({ timer: running, nowMs: T0 + 5 * HOUR, hours: 4, lastLevel: 1 })).toBe(0);
    expect(R.longTimerDue({ timer: running, nowMs: T0 + 8 * HOUR, hours: 4, lastLevel: 1 })).toBe(2);
    expect(R.longTimerDue({ timer: running, nowMs: T0 + 8 * HOUR, hours: 0 })).toBe(0);
    expect(R.longTimerDue({ timer: { ...running, isPaused: true, startTime: null, accumulatedTime: 9 * HOUR }, nowMs: T0, hours: 4 })).toBe(0);
  });

  it('working hours in local time, with wrap over midnight', () => {
    expect(R.inWorkingHours(new Date(at(12, 9, 0)), work)).toBe(true);
    expect(R.inWorkingHours(new Date(at(12, 8, 59)), work)).toBe(false);
    expect(R.inWorkingHours(new Date(at(12, 18, 0)), work)).toBe(false);
    expect(R.inWorkingHours(new Date(at(17, 12, 0)), work)).toBe(false); // Saturday
    const night = { ...work, days: [0, 1, 2, 3, 4, 5, 6], from: '22:00', to: '02:00' };
    expect(R.inWorkingHours(new Date(at(12, 23, 0)), night)).toBe(true);
    expect(R.inWorkingHours(new Date(at(13, 1, 30)), night)).toBe(true);
    expect(R.inWorkingHours(new Date(at(13, 3, 0)), night)).toBe(false);
  });

  it('no-timer reminder: active user, working hours, an interval after the stop', () => {
    const base = { work, timer: null, idleSeconds: 5, idleSinceMs: at(12, 10, 0) };
    expect(R.workReminderDue({ ...base, nowMs: at(12, 10, 20) })).toBe(false);
    expect(R.workReminderDue({ ...base, nowMs: at(12, 10, 30) })).toBe(true);
    expect(R.workReminderDue({ ...base, nowMs: at(12, 10, 45), lastNotifiedMs: at(12, 10, 30) })).toBe(false);
    expect(R.workReminderDue({ ...base, nowMs: at(12, 11, 0), lastNotifiedMs: at(12, 10, 30) })).toBe(true);
    expect(R.workReminderDue({ ...base, nowMs: at(12, 11, 0), idleSeconds: 300 })).toBe(false);
    expect(R.workReminderDue({ ...base, nowMs: at(12, 11, 0), timer: running })).toBe(false);
    expect(R.workReminderDue({ ...base, nowMs: at(12, 11, 0), timer: { isPaused: true, startTime: null } })).toBe(true);
    expect(R.workReminderDue({ ...base, nowMs: at(12, 19, 0) })).toBe(false);
    expect(R.workReminderDue({ ...base, nowMs: at(12, 11, 0), work: { ...work, enabled: false } })).toBe(false);
  });

  it('main texts in both languages', () => {
    expect(R.mainText('ru', 'workTitle')).toBe('Таймер не запущен');
    expect(R.mainText('en', 'longTitle', { hours: '4 h' })).toBe('The timer has been running for 4 h');
    expect(R.mainText('de', 'stoppedTitle')).toBe('Timer stopped');
  });
});

describe('tray: start and stop on the data file', () => {
  function setup() {
    const c = store.addClient('Acme', 50);
    const p = store.addProject('Site', c.id, 80);
    return { c, p };
  }

  it('stopping on a state object writes the same entry as store.stopTimer', () => {
    const { c, p } = setup();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    store.startTimer(' Design ', c.id, p.id, true);
    vi.setSystemTime(T0 + 10 * MIN);
    store.pauseTimer();
    vi.setSystemTime(T0 + 25 * MIN);
    store.resumeTimer();
    vi.setSystemTime(T0 + 55 * MIN);

    const fileState = JSON.parse(JSON.stringify(store.state));
    const fromTray = T.stopTimerOnState(fileState, Date.now());
    const fromStore = store.stopTimer();

    const strip = ({ id: _id, ...rest }) => rest;
    expect(strip(fromTray)).toEqual(strip(fromStore));
    expect(fromTray.durationMs).toBe(40 * MIN);
    expect(fromTray.startTime).toBe(new Date(T0).toISOString());
    expect(fromTray.rateAtTime).toBe(80);
    expect(fileState.activeTimer).toBeNull();
    expect(fileState.savedAt).toBe(new Date(T0 + 55 * MIN).toISOString());
  });

  it('keeps the tags of the running timer like the store does', () => {
    const { c } = setup();
    const tag = store.upsertRecord('tags', { name: 'Ads', color: '#6366f1' });
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    store.startTimer('Tagged', c.id, null, true, { tagIds: [tag.id] });
    vi.setSystemTime(T0 + 20 * MIN);
    const fileState = JSON.parse(JSON.stringify(store.state));
    const fromTray = T.stopTimerOnState(fileState, Date.now());
    const fromStore = store.stopTimer();
    expect(fromTray.tagIds).toEqual([tag.id]);
    expect({ ...fromTray, id: 0 }).toEqual({ ...fromStore, id: 0 });
  });

  it('continuing a task from the tray carries its tags', () => {
    const tag = store.upsertRecord('tags', { name: 'Ads', color: '#6366f1' });
    const fileState = JSON.parse(JSON.stringify(store.state));
    const { timer } = T.startTimerOnState(fileState, { description: 'Next', clientId: null, tagIds: [tag.id, 'gone'] }, Date.now());
    expect(timer.extra).toEqual({ tagIds: [tag.id] });
  });

  it('a continuous run stores no durationMs, like the store', () => {
    const { c } = setup();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    store.startTimer('Plain', c.id, null, false);
    vi.setSystemTime(T0 + 30 * MIN);
    const fileState = JSON.parse(JSON.stringify(store.state));
    const fromTray = T.stopTimerOnState(fileState, Date.now());
    const fromStore = store.stopTimer();
    expect(fromTray.durationMs).toBeUndefined();
    expect({ ...fromTray, id: 0 }).toEqual({ ...fromStore, id: 0 });
  });

  it('starting stops the running timer first and matches store.startTimer', () => {
    const { c, p } = setup();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    store.startTimer('Old', c.id, null, true);
    const fileState = JSON.parse(JSON.stringify(store.state));
    vi.setSystemTime(T0 + 20 * MIN);
    const { stopped, timer } = T.startTimerOnState(fileState, { description: 'New', clientId: c.id, projectId: p.id, billable: false }, Date.now());
    expect(stopped.description).toBe('Old');
    expect(fileState.timeLogs).toHaveLength(1);
    store.stopTimer();
    const expected = store.startTimer('New', c.id, p.id, false);
    expect(timer).toEqual(expected);
    expect(T.traySnapshot(fileState)).toMatchObject({ description: 'New', isPaused: false, rateAtTime: 80, originalStartTime: timer.originalStartTime });
    expect(T.stopTimerOnState({ activeTimer: null }, T0)).toBeNull();
  });

  it('recent tasks: newest first, distinct, at most five', () => {
    const { c, p } = setup();
    const d = store.addClient('Beta', 30);
    const add = (desc, clientId, projectId, min) => store.addTimeLog({
      description: desc, clientId, projectId,
      startTime: new Date(T0 + min * MIN).toISOString(), endTime: new Date(T0 + (min + 5) * MIN).toISOString()
    });
    add('A', c.id, null, 0);
    add('B', c.id, p.id, 10);
    add('a', c.id, null, 20);
    add('A', d.id, null, 30);
    add('C', d.id, null, 40);
    add('D', d.id, null, 50);
    add('E', d.id, null, 60);
    const tasks = T.recentTasks(store.state);
    expect(tasks.map(x => `${x.description}/${x.clientName}`)).toEqual(['E/Beta', 'D/Beta', 'C/Beta', 'A/Beta', 'a/Acme']);
    expect(T.taskLabel({ description: '', clientName: 'Acme', projectName: 'Site' }, 'No description')).toBe('No description · Acme · Site');
    expect(T.recentTasks(store.state, 10).find(x => x.description === 'B').projectName).toBe('Site');
  });
});
