import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../src/store.js';
import { billableHours, formatDurationShort, localDayKey, escapeHtml, csvCell, toLocalDatetimeString } from '../src/utils.js';

beforeEach(() => {
  store.clearAllData();
});

describe('clients & projects', () => {
  it('adds a client with numeric rate', () => {
    const c = store.addClient('  Acme  ', '45');
    expect(c.name).toBe('Acme');
    expect(c.defaultRate).toBe(45);
  });

  it('project inherits client rate when own rate is 0', () => {
    const c = store.addClient('Acme', 50);
    const p = store.addProject('Site', c.id, 0);
    expect(store.getRate(c.id, p.id)).toBe(50);
  });

  it('project rate overrides client rate', () => {
    const c = store.addClient('Acme', 50);
    const p = store.addProject('Site', c.id, 70);
    expect(store.getRate(c.id, p.id)).toBe(70);
  });

  it('deleting a client cascades projects and logs', () => {
    const c = store.addClient('Acme', 50);
    const p = store.addProject('Site', c.id, 0);
    store.addTimeLog({ clientId: c.id, projectId: p.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' });
    store.deleteClient(c.id);
    expect(store.getProjects()).toHaveLength(0);
    expect(store.getTimeLogs()).toHaveLength(0);
  });
});

describe('time logs & paid model', () => {
  it('freezes rate at logging time', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' });
    store.updateClient(c.id, 'Acme', 100);
    const stored = store.getTimeLogs().find(l => l.id === log.id);
    expect(stored.rateAtTime).toBe(50);
  });

  it('new logs are unpaid by default', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' });
    expect(log.paid).toBe(false);
    expect(log.billable).toBe(true);
  });

  it('setLogsPaid marks batch as paid and back', () => {
    const c = store.addClient('Acme', 50);
    const a = store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' });
    const b = store.addTimeLog({ clientId: c.id, startTime: '2026-07-02T10:00:00Z', endTime: '2026-07-02T11:00:00Z' });
    store.setLogsPaid([a.id, b.id], true);
    expect(store.getTimeLogs().every(l => l.paid)).toBe(true);
    store.setLogsPaid([a.id], false);
    expect(store.getTimeLogs().find(l => l.id === a.id).paid).toBe(false);
  });

  it('migrates legacy billable=false logs to paid=true', () => {
    const legacy = store.normalizeLog({ id: 'x', billable: false, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' });
    expect(legacy.paid).toBe(true);
    expect(legacy.billable).toBe(true);
  });

  it('keeps modern logs untouched by normalizeLog', () => {
    const log = store.normalizeLog({ id: 'y', billable: false, paid: false });
    expect(log.billable).toBe(false);
    expect(log.paid).toBe(false);
  });

  it('delete + restore round-trips logs (undo)', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' });
    const removed = store.deleteTimeLog(log.id);
    expect(store.getTimeLogs()).toHaveLength(0);
    store.restoreTimeLogs(removed);
    expect(store.getTimeLogs()).toHaveLength(1);
    expect(store.getTimeLogs()[0].id).toBe(log.id);
  });
});

describe('timer', () => {
  it('start -> stop produces a log with duration', () => {
    const c = store.addClient('Acme', 60);
    store.startTimer('Work', c.id, null, true);
    const log = store.stopTimer();
    expect(log).toBeTruthy();
    expect(log.rateAtTime).toBe(60);
    expect(store.getActiveTimer()).toBeNull();
  });

  it('pause accumulates time and clears startTime', () => {
    const c = store.addClient('Acme', 60);
    store.startTimer('Work', c.id, null, true);
    store.pauseTimer();
    const timer = store.getActiveTimer();
    expect(timer.isPaused).toBe(true);
    expect(timer.startTime).toBeNull();
    expect(timer.accumulatedTime).toBeGreaterThanOrEqual(0);
  });
});

describe('import safety', () => {
  it('rejects garbage input', () => {
    const result = store.importData({ foo: 'bar' });
    expect(result.success).toBe(false);
  });

  it('imports and normalizes legacy logs', () => {
    const result = store.importData({
      clients: [{ id: 'c1', name: 'A', defaultRate: 10 }],
      timeLogs: [{ id: 'l1', clientId: 'c1', billable: false, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z', rateAtTime: 10 }]
    });
    expect(result.success).toBe(true);
    const log = store.getTimeLogs()[0];
    expect(log.paid).toBe(true);
    expect(log.billable).toBe(true);
  });
});

describe('utils', () => {
  it('billableHours rounds UP to 5-minute blocks', () => {
    expect(billableHours(0)).toBe(0);
    expect(billableHours(60000)).toBeCloseTo(5 / 60);       // 1 мин -> 5 мин
    expect(billableHours(5 * 60000)).toBeCloseTo(5 / 60);   // ровно 5 мин
    expect(billableHours(6 * 60000)).toBeCloseTo(10 / 60);  // 6 мин -> 10 мин
    expect(billableHours(3600000)).toBeCloseTo(1);          // ровно час
  });

  it('formatDurationShort never yields 60 minutes', () => {
    expect(formatDurationShort(1.9999, 'en')).toBe('2h 0m');
    expect(formatDurationShort(1.999, 'ru')).toBe('2ч 0м');
    expect(formatDurationShort(2.25, 'en')).toBe('2h 15m');
  });

  it('localDayKey uses local date parts', () => {
    const d = new Date(2026, 6, 21, 0, 30); // 21 июля 00:30 локального времени
    expect(localDayKey(d)).toBe('2026-07-21');
  });

  it('toLocalDatetimeString round-trips local wall time', () => {
    const d = new Date(2026, 6, 21, 9, 5);
    expect(toLocalDatetimeString(d)).toBe('2026-07-21T09:05');
  });

  it('escapeHtml neutralizes markup', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).not.toContain('<');
    expect(escapeHtml('a & "b"')).toBe('a &amp; &quot;b&quot;');
  });

  it('csvCell escapes quotes and formula prefixes', () => {
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
  });
});
