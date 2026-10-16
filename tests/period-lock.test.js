import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { store } from '../src/store.js';
import { isLogLockedBy, logLockReason, isTimeInLockedPeriod, normalizeLockDate } from '../src/period-lock.js';

// Local times (no Z): the lock compares LOCAL days.
const july1 = { startTime: new Date(2026, 6, 1, 10, 0).toISOString(), endTime: new Date(2026, 6, 1, 11, 0).toISOString() };
const july2 = { startTime: new Date(2026, 6, 2, 10, 0).toISOString(), endTime: new Date(2026, 6, 2, 11, 0).toISOString() };

function paymentsTotal(clientId) {
  return store.getPayments(clientId).reduce((s, p) => s + p.amount, 0);
}

// Every paid billable log is covered by an auto payment for its full amount.
function expectPaidLogsCovered() {
  const covered = {};
  store.getClients().forEach(c => (c.payments || []).forEach(p => {
    if (p.auto && p.logAmounts) Object.assign(covered, p.logAmounts);
  }));
  store.getTimeLogs().filter(l => l.paid && l.billable).forEach(l => {
    expect(covered[l.id]).toBeCloseTo(store.logAmount(l));
  });
}

beforeEach(() => {
  store.clearAllData();
});

describe('period-lock pure helpers', () => {
  it('normalizes the lock date', () => {
    expect(normalizeLockDate('2026-07-01')).toBe('2026-07-01');
    expect(normalizeLockDate('')).toBe('');
    expect(normalizeLockDate(undefined)).toBe('');
    expect(normalizeLockDate('01.07.2026')).toBe('');
  });

  it('locks the lock day inclusive by local day', () => {
    expect(isTimeInLockedPeriod(july1.startTime, '2026-07-01')).toBe(true);
    expect(isTimeInLockedPeriod(new Date(2026, 6, 1, 23, 59).toISOString(), '2026-07-01')).toBe(true);
    expect(isTimeInLockedPeriod(new Date(2026, 6, 2, 0, 0).toISOString(), '2026-07-01')).toBe(false);
    expect(isTimeInLockedPeriod(july1.startTime, '')).toBe(false);
    expect(isTimeInLockedPeriod('garbage', '2026-07-01')).toBe(false);
  });

  it('reports why a log is locked', () => {
    expect(logLockReason({ ...july2, paid: false }, '2026-07-01')).toBe(null);
    expect(logLockReason({ ...july2, paid: true }, '2026-07-01')).toBe('paid');
    expect(logLockReason({ ...july1, paid: false }, '2026-07-01')).toBe('period');
    expect(logLockReason({ ...july1, paid: true }, '2026-07-01')).toBe('period');
    expect(isLogLockedBy({ ...july2, paid: false }, '')).toBe(false);
    expect(isLogLockedBy(null, '2026-07-01')).toBe(false);
  });
});

describe('store.isLogLocked', () => {
  it('is true for paid logs and logs inside the locked period', () => {
    const c = store.addClient('Acme', 50);
    const a = store.addTimeLog({ clientId: c.id, ...july1 });
    const b = store.addTimeLog({ clientId: c.id, ...july2 });
    expect(store.isLogLocked(a)).toBe(false);
    store.updateSettings({ lockedUntil: '2026-07-01' });
    expect(store.isLogLocked(a)).toBe(true);
    expect(store.isLogLocked(b)).toBe(false);
    store.setLogsPaid([b.id], true);
    expect(store.isLogLocked(store.getTimeLogs().find(l => l.id === b.id))).toBe(true);
    store.updateSettings({ lockedUntil: '' });
    expect(store.isLogLocked(store.getTimeLogs().find(l => l.id === a.id))).toBe(false);
  });
});

describe('addTimeLog with a locked period', () => {
  it('refuses manual entries that start inside the period', () => {
    const c = store.addClient('Acme', 50);
    store.updateSettings({ lockedUntil: '2026-07-01' });
    const res = store.addTimeLog({ clientId: c.id, ...july1 });
    expect(res).toBeNull();
    expect(store.lastLockError).toEqual({ reason: 'period', count: 1 });
    expect(store.getTimeLogs()).toHaveLength(0);
  });

  it('allows entries after the period and returns the log as before', () => {
    const c = store.addClient('Acme', 50);
    store.updateSettings({ lockedUntil: '2026-07-01' });
    const res = store.addTimeLog({ clientId: c.id, ...july2 });
    expect(res.id).toBeTruthy();
    expect(store.lastLockError).toBeNull();
  });
});

describe('updateTimeLog with locks', () => {
  it('refuses edits of a log inside the period', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, description: 'old', ...july1 });
    store.updateSettings({ lockedUntil: '2026-07-01' });
    expect(store.updateTimeLog(log.id, { description: 'new' })).toBeNull();
    expect(store.lastLockError.reason).toBe('period');
    expect(store.getTimeLogs()[0].description).toBe('old');
  });

  it('refuses edits of a paid log and keeps its payment', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, ...july2 });
    store.setLogsPaid([log.id], true);
    expect(store.updateTimeLog(log.id, { rateAtTime: 100 })).toBeNull();
    expect(store.lastLockError.reason).toBe('paid');
    expect(store.getTimeLogs()[0].rateAtTime).toBe(50);
    expect(paymentsTotal(c.id)).toBeCloseTo(50);
    expectPaidLogsCovered();
  });

  it('refuses moving an open log into the period', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, ...july2 });
    store.updateSettings({ lockedUntil: '2026-07-01' });
    expect(store.updateTimeLog(log.id, { ...july1 })).toBeNull();
    expect(store.getTimeLogs()[0].startTime).toBe(july2.startTime);
  });

  it('allows edits of open logs with the same return value as before', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, ...july2 });
    store.updateSettings({ lockedUntil: '2026-07-01' });
    expect(store.updateTimeLog(log.id, { description: 'x' })).toBe(true);
    expect(store.lastLockError).toBeNull();
    expect(store.updateTimeLog('missing', { description: 'x' })).toBe(false);
  });

  it('marking an open log paid through an edit still creates its payment', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, ...july2 });
    expect(store.updateTimeLog(log.id, { clientId: c.id, projectId: null, paid: true })).toBe(true);
    expect(paymentsTotal(c.id)).toBeCloseTo(50);
    expectPaidLogsCovered();
  });
});

describe('deleteTimeLogs with locks', () => {
  it('skips locked logs, deletes the rest and reports the skipped count', () => {
    const c = store.addClient('Acme', 50);
    const a = store.addTimeLog({ clientId: c.id, ...july1 });
    const b = store.addTimeLog({ clientId: c.id, ...july2 });
    const d = store.addTimeLog({ clientId: c.id, ...july2 });
    store.setLogsPaid([d.id], true);
    store.updateSettings({ lockedUntil: '2026-07-01' });
    const removed = store.deleteTimeLogs([a.id, b.id, d.id]);
    expect(removed.map(l => l.id)).toEqual([b.id]);
    expect(store.lastLockError).toEqual({ reason: 'period', count: 2 });
    expect(store.getTimeLogs().map(l => l.id).sort()).toEqual([a.id, d.id].sort());
    expectPaidLogsCovered();
  });

  it('reports paid as the reason when only paid logs were skipped', () => {
    const c = store.addClient('Acme', 50);
    const a = store.addTimeLog({ clientId: c.id, ...july2 });
    store.setLogsPaid([a.id], true);
    expect(store.deleteTimeLogs([a.id])).toEqual([]);
    expect(store.lastLockError).toEqual({ reason: 'paid', count: 1 });
  });

  it('allowed deletes keep the existing return value and undo', () => {
    const c = store.addClient('Acme', 50);
    const a = store.addTimeLog({ clientId: c.id, ...july2 });
    store.updateSettings({ lockedUntil: '2026-07-01' });
    const removed = store.deleteTimeLogs([a.id]);
    expect(removed).toHaveLength(1);
    expect(store.lastLockError).toBeNull();
    store.restoreTimeLogs(removed);
    expect(store.getTimeLogs()).toHaveLength(1);
  });
});

describe('setLogsPaid with locks', () => {
  it('allows unmarking a paid log outside the period (unlocks it)', () => {
    const c = store.addClient('Acme', 50);
    const a = store.addTimeLog({ clientId: c.id, ...july2 });
    store.setLogsPaid([a.id], true);
    store.updateSettings({ lockedUntil: '2026-07-01' });
    expect(store.setLogsPaid([a.id], false)).toBe(true);
    expect(store.getPayments(c.id)).toHaveLength(0);
    expect(store.isLogLocked(store.getTimeLogs()[0])).toBe(false);
    expect(store.updateTimeLog(a.id, { description: 'now editable' })).toBe(true);
  });

  it('refuses unmarking inside the period and keeps the payment', () => {
    const c = store.addClient('Acme', 50);
    const a = store.addTimeLog({ clientId: c.id, ...july1 });
    store.setLogsPaid([a.id], true);
    store.updateSettings({ lockedUntil: '2026-07-01' });
    expect(store.setLogsPaid([a.id], false)).toBe(false);
    expect(store.lastLockError).toEqual({ reason: 'period', count: 1 });
    expect(store.getTimeLogs()[0].paid).toBe(true);
    expect(paymentsTotal(c.id)).toBeCloseTo(50);
    expectPaidLogsCovered();
  });

  it('refuses marking paid inside the period, marks the rest', () => {
    const c = store.addClient('Acme', 50);
    const a = store.addTimeLog({ clientId: c.id, ...july1 });
    const b = store.addTimeLog({ clientId: c.id, ...july2 });
    store.updateSettings({ lockedUntil: '2026-07-01' });
    expect(store.setLogsPaid([a.id, b.id], true)).toBe(true);
    expect(store.lastLockError).toEqual({ reason: 'period', count: 1 });
    const byId = Object.fromEntries(store.getTimeLogs().map(l => [l.id, l]));
    expect(byId[a.id].paid).toBe(false);
    expect(byId[b.id].paid).toBe(true);
    expect(paymentsTotal(c.id)).toBeCloseTo(50);
    expectPaidLogsCovered();
  });
});

describe('stopTimer inside the locked period', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // The lock protects billed history, it must never drop new work.
  it('saves the work anyway and the saved log reads as locked', () => {
    const c = store.addClient('Acme', 50);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 22, 0));
    store.startTimer('late work', c.id, null, true);
    store.updateSettings({ lockedUntil: '2026-07-01' });
    vi.setSystemTime(new Date(2026, 6, 2, 1, 0));
    const log = store.stopTimer();
    expect(log).toBeTruthy();
    expect(store.getActiveTimer()).toBeNull();
    expect(store.getTimeLogs()).toHaveLength(1);
    expect(store.isLogLocked(log)).toBe(true);
  });
});
