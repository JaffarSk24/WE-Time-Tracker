import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../src/store.js';
import { billableHours, formatDurationShort, localDayKey, escapeHtml, csvCell, toLocalDatetimeString, logDurationMs } from '../src/utils.js';

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

describe('payments & deposits', () => {
  it('debt = billed − paid (negative balance)', () => {
    const c = store.addClient('Acme', 60);
    // 1 hour billable = 60 €
    store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' });
    let bal = store.getClientBalance(c.id);
    expect(bal.billed).toBeCloseTo(60);
    expect(bal.paid).toBe(0);
    expect(bal.balance).toBeCloseTo(-60); // debt 60
  });

  it('advance when payment exceeds billed work', () => {
    const c = store.addClient('Acme', 60);
    store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' });
    store.addPayment(c.id, 100);
    const bal = store.getClientBalance(c.id);
    expect(bal.balance).toBeCloseTo(40); // advance 40
  });

  it('payment with no work is a pure deposit', () => {
    const c = store.addClient('Acme', 60);
    store.addPayment(c.id, 200, 'prepayment');
    const bal = store.getClientBalance(c.id);
    expect(bal.balance).toBeCloseTo(200);
    expect(store.getPayments(c.id)).toHaveLength(1);
  });

  it('deletePayment updates balance', () => {
    const c = store.addClient('Acme', 60);
    const p = store.addPayment(c.id, 50);
    store.deletePayment(c.id, p.id);
    expect(store.getClientBalance(c.id).balance).toBe(0);
  });

  it('marking logs paid closes the debt without hiding the work', () => {
    const c = store.addClient('Acme', 35);
    // 2 h of billable work = 70 EUR
    store.addTimeLog({ clientId: c.id, startTime: '2026-07-21T10:00:00Z', endTime: '2026-07-21T12:00:00Z' });
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(-70);

    store.setLogsPaid(store.getTimeLogs().map(l => l.id), true);
    const bal = store.getClientBalance(c.id);
    expect(bal.billed).toBeCloseTo(70);   // work done is still reported
    expect(bal.paid).toBeCloseTo(70);     // recorded as a linked payment
    expect(bal.balance).toBeCloseTo(0);   // settled up
    expect(store.getPayments(c.id)).toHaveLength(1);
    expect(store.getPayments(c.id)[0].auto).toBe(true);
  });

  it('does not double count when the payment was already recorded by hand', () => {
    const c = store.addClient('Acme', 35);
    store.addTimeLog({ clientId: c.id, startTime: '2026-07-21T10:00:00Z', endTime: '2026-07-21T12:00:00Z' });
    store.addPayment(c.id, 70, 'client transfer');   // money already in the ledger
    store.setLogsPaid(store.getTimeLogs().map(l => l.id), true);
    // nothing left uncovered -> no second payment, no phantom advance
    expect(store.getPayments(c.id)).toHaveLength(1);
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(0);
  });

  it('marking paid covers only the outstanding part of the debt', () => {
    const c = store.addClient('Acme', 35);
    store.addTimeLog({ clientId: c.id, startTime: '2026-07-21T10:00:00Z', endTime: '2026-07-21T12:00:00Z' });
    store.addPayment(c.id, 30, 'partial');
    const ids = store.getTimeLogs().map(l => l.id);
    store.setLogsPaid(ids, true);
    expect(store.getClientBalance(c.id).paid).toBeCloseTo(70);  // 30 by hand + 40 linked
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(0);
    store.setLogsPaid(ids, false);
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(-40); // manual 30 stays
  });

  it('unmarking paid reopens the debt and removes the linked payment', () => {
    const c = store.addClient('Acme', 35);
    store.addTimeLog({ clientId: c.id, startTime: '2026-07-21T10:00:00Z', endTime: '2026-07-21T12:00:00Z' });
    const ids = store.getTimeLogs().map(l => l.id);
    store.setLogsPaid(ids, true);
    store.setLogsPaid(ids, false);
    expect(store.getPayments(c.id)).toHaveLength(0);
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(-70);
  });

  it('deleting a paid log removes its payment (no phantom advance)', () => {
    const c = store.addClient('Acme', 35);
    store.addTimeLog({ clientId: c.id, startTime: '2026-07-21T10:00:00Z', endTime: '2026-07-21T12:00:00Z' });
    const ids = store.getTimeLogs().map(l => l.id);
    store.setLogsPaid(ids, true);
    const removed = store.deleteTimeLogs(ids);
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(0);
    store.restoreTimeLogs(removed);   // undo restores both log and payment
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(0);
    expect(store.getPayments(c.id)).toHaveLength(1);
  });

  it('partial unmark keeps the rest of the linked payment', () => {
    const c = store.addClient('Acme', 60);
    const a = store.addTimeLog({ clientId: c.id, startTime: '2026-07-21T10:00:00Z', endTime: '2026-07-21T11:00:00Z' });
    const b = store.addTimeLog({ clientId: c.id, startTime: '2026-07-22T10:00:00Z', endTime: '2026-07-22T11:00:00Z' });
    store.setLogsPaid([a.id, b.id], true);
    store.setLogsPaid([a.id], false);
    expect(store.getPayments(c.id)).toHaveLength(1);
    expect(store.getPayments(c.id)[0].amount).toBeCloseTo(60);
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(-60);
  });

  it('migrates legacy paid logs that have no linked payment', () => {
    const c = store.addClient('Acme', 35);
    store.addTimeLog({ clientId: c.id, startTime: '2026-07-21T10:00:00Z', endTime: '2026-07-21T12:00:00Z' });
    // simulate old data: paid flag set directly, ledger empty
    store.state.timeLogs[0].paid = true;
    expect(store.migrateAutoPaymentsForPaidLogs()).toBe(true);
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(0);
    // idempotent
    expect(store.migrateAutoPaymentsForPaidLogs()).toBe(false);
  });

  it('updateClient preserves payments ledger', () => {
    const c = store.addClient('Acme', 60);
    store.addPayment(c.id, 50);
    store.updateClient(c.id, 'Acme Renamed', 80);
    expect(store.getPayments(c.id)).toHaveLength(1);
    expect(store.getClients().find(x => x.id === c.id).name).toBe('Acme Renamed');
  });
});

describe('honest duration with pauses', () => {
  it('stores durationMs when shorter than the start-end span', () => {
    const c = store.addClient('Acme', 60);
    // 2-hour span, but 1 hour worked (there was a one-hour pause)
    const log = store.addTimeLog({
      clientId: c.id,
      startTime: '2026-07-01T10:00:00Z',
      endTime: '2026-07-01T12:00:00Z',
      durationMs: 3600000
    });
    const stored = store.getTimeLogs().find(l => l.id === log.id);
    expect(stored.durationMs).toBe(3600000);
    expect(logDurationMs(stored)).toBe(3600000); // worked time, not the span
  });

  it('editing times clears stale durationMs', () => {
    const c = store.addClient('Acme', 60);
    const log = store.addTimeLog({
      clientId: c.id,
      startTime: '2026-07-01T10:00:00Z',
      endTime: '2026-07-01T12:00:00Z',
      durationMs: 3600000
    });
    store.updateTimeLog(log.id, { startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:30:00Z' });
    const stored = store.getTimeLogs().find(l => l.id === log.id);
    expect(stored.durationMs).toBeUndefined();
    expect(logDurationMs(stored)).toBe(90 * 60000);
  });

  it('does not store durationMs when it matches the span', () => {
    const c = store.addClient('Acme', 60);
    const log = store.addTimeLog({
      clientId: c.id,
      startTime: '2026-07-01T10:00:00Z',
      endTime: '2026-07-01T11:00:00Z',
      durationMs: 3600000
    });
    const stored = store.getTimeLogs().find(l => l.id === log.id);
    expect(stored.durationMs).toBeUndefined();
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
  it('billableHours is minute-precise (no block rounding)', () => {
    expect(billableHours(0)).toBe(0);
    expect(billableHours(60000)).toBeCloseTo(1 / 60);        // 1 min
    expect(billableHours(52 * 60000)).toBeCloseTo(52 / 60);  // 52 min bills 52 min
    expect(billableHours(3600000)).toBeCloseTo(1);           // exactly one hour
    expect(billableHours(531000)).toBeCloseTo(9 / 60);       // 8:51 -> 9 min
  });

  it('bills a minimum of one minute for any started entry', () => {
    expect(billableHours(16000)).toBeCloseTo(1 / 60);  // 16 s -> 1 min
    expect(billableHours(1000)).toBeCloseTo(1 / 60);   // 1 s  -> 1 min
    expect(billableHours(0)).toBe(0);                  // nothing tracked -> 0
  });

  it('bills real screenshot cases at 35 EUR/h', () => {
    const rate = 35;
    expect(billableHours(52 * 60000) * rate).toBeCloseTo(30.33, 2);  // 00:52:00
    expect(billableHours(531000) * rate).toBeCloseTo(5.25, 2);       // 00:08:51
    expect(billableHours(16000) * rate).toBeCloseTo(0.58, 2);        // 00:00:16
  });

  it('formatDurationShort never yields 60 minutes', () => {
    expect(formatDurationShort(1.9999, 'en')).toBe('2h 0m');
    expect(formatDurationShort(1.999, 'ru')).toBe('2ч 0м'); // RU localized output
    expect(formatDurationShort(2.25, 'en')).toBe('2h 15m');
  });

  it('localDayKey uses local date parts', () => {
    const d = new Date(2026, 6, 21, 0, 30); // July 21, 00:30 local time
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
