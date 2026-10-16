import { describe, it, expect } from 'vitest';
import {
  periodRange, previousRange, logsInRange, periodStats, comparePeriods, percentChange,
  workingDays, monthForecast, debtAging
} from '../src/analytics.js';

// Local-time log of `hours` starting at the given local date/hour.
function log(y, m, d, hours, extra = {}) {
  const start = new Date(y, m - 1, d, 10, 0, 0);
  const end = new Date(start.getTime() + hours * 3600000);
  return { id: Math.random().toString(36), startTime: start.toISOString(), endTime: end.toISOString(), billable: true, paid: false, rateAtTime: 50, clientId: 'a', ...extra };
}
const eur = () => 'EUR';
const byClient = l => (l.clientId === 'b' ? 'USD' : 'EUR');

describe('periods', () => {
  const now = new Date(2026, 9, 16, 15, 0); // Fri 16 Oct 2026

  it('7 days start at local midnight six days ago and end now', () => {
    const r = periodRange('7', now);
    expect(r.start).toEqual(new Date(2026, 9, 10));
    expect(r.end).toEqual(now);
  });

  it('last month and last year are whole', () => {
    expect(periodRange('last-month', now)).toEqual({ start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) });
    expect(periodRange('last-year', now)).toEqual({ start: new Date(2025, 0, 1), end: new Date(2026, 0, 1) });
    expect(periodRange('3-months', now).start).toEqual(new Date(2026, 7, 1));
  });

  it('previous range has the same length and ends where the period starts', () => {
    const r = periodRange('current-month', now);
    const p = previousRange(r);
    expect(p.end).toEqual(r.start);
    expect(r.end - r.start).toBe(p.end - p.start);
  });

  it('logsInRange is start inclusive, end exclusive', () => {
    const r = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 2) };
    const inside = { startTime: new Date(2026, 9, 1, 0, 0).toISOString() };
    const outside = { startTime: new Date(2026, 9, 2, 0, 0).toISOString() };
    expect(logsInRange([inside, outside], r)).toEqual([inside]);
  });
});

describe('periodStats and comparison', () => {
  it('effective rate divides billable amount by all hours, share by hours', () => {
    const s = periodStats([log(2026, 10, 1, 2), log(2026, 10, 2, 2, { billable: false })], eur);
    expect(s.hours).toBe(4);
    expect(s.billableHours).toBe(2);
    expect(s.billableShare).toBe(0.5);
    expect(s.amounts).toEqual({ EUR: 100 });
    expect(s.effectiveRate).toEqual({ EUR: 25 });
  });

  it('keeps currencies apart', () => {
    const s = periodStats([log(2026, 10, 1, 1), log(2026, 10, 1, 2, { clientId: 'b', rateAtTime: 10 })], byClient);
    expect(s.amounts).toEqual({ EUR: 50, USD: 20 });
    expect(s.effectiveRate).toEqual({ EUR: 50, USD: 10 });
  });

  it('empty period has no share and no rates', () => {
    const s = periodStats([], eur);
    expect(s.billableShare).toBeNull();
    expect(s.effectiveRate).toEqual({});
  });

  it('compares hours and amounts with percent change', () => {
    const cur = periodStats([log(2026, 10, 10, 3)], eur);
    const prev = periodStats([log(2026, 10, 1, 2)], eur);
    const c = comparePeriods(cur, prev);
    expect(c.hours).toEqual({ current: 3, previous: 2, change: 50 });
    expect(c.amounts.EUR).toEqual({ current: 150, previous: 100, change: 50 });
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(1, 4)).toBe(-75);
  });
});

describe('monthly forecast', () => {
  it('counts Mon-Fri working days', () => {
    // October 2026: 1st is Thursday, 22 working days; up to Fri 16th: 12
    expect(workingDays(new Date(2026, 9, 16, 12))).toEqual({ elapsed: 12, total: 22 });
    // Sat 3rd: Thu 1 and Fri 2 elapsed
    expect(workingDays(new Date(2026, 9, 3, 12)).elapsed).toBe(2);
  });

  it('projects the amount so far over the working days of the month', () => {
    const now = new Date(2026, 9, 16, 18);
    const logs = [log(2026, 10, 5, 6), log(2026, 10, 12, 6), log(2026, 9, 30, 10), log(2026, 10, 6, 1, { billable: false })];
    const fc = monthForecast(logs, eur, now);
    expect(fc.soFar).toEqual({ EUR: 600 });
    expect(fc.forecast.EUR).toBeCloseTo(600 / 12 * 22);
  });

  it('has no forecast before the first working day', () => {
    // November 2026 starts on Sunday
    const now = new Date(2026, 10, 1, 18);
    const fc = monthForecast([log(2026, 11, 1, 2)], eur, now);
    expect(fc.soFar).toEqual({ EUR: 100 });
    expect(fc.forecast.EUR).toBeNull();
  });
});

describe('debt aging', () => {
  const now = new Date(2026, 9, 16, 12);
  const cur = id => (id === 'b' ? 'USD' : 'EUR');

  it('groups unpaid billable work by age', () => {
    const logs = [
      log(2026, 10, 16, 1),          // 0 days
      log(2026, 9, 16, 1),           // 30 days
      log(2026, 9, 15, 2),           // 31 days
      log(2026, 8, 10, 1),           // 67 days
      log(2026, 6, 1, 1),            // 90+
      log(2026, 10, 1, 5, { paid: true }),
      log(2026, 10, 1, 5, { billable: false })
    ];
    const { rows, totals } = debtAging(logs, () => -10000, cur, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].buckets).toEqual([100, 100, 50, 50]);
    expect(rows[0].total).toBe(300);
    expect(totals).toEqual({ EUR: [100, 100, 50, 50] });
  });

  it('caps by the balance, trimming the oldest work first', () => {
    const logs = [log(2026, 10, 10, 1), log(2026, 8, 1, 2)];
    const { rows } = debtAging(logs, () => -80, cur, now);
    expect(rows[0].buckets).toEqual([50, 0, 30, 0]);
    expect(rows[0].total).toBe(80);
  });

  it('a client with a non-negative balance shows no debt', () => {
    const logs = [log(2026, 10, 10, 1), log(2026, 10, 10, 1, { clientId: 'b' })];
    const { rows, totals } = debtAging(logs, id => (id === 'a' ? 0 : -1000), cur, now);
    expect(rows.map(r => r.clientId)).toEqual(['b']);
    expect(rows[0].currency).toBe('USD');
    expect(totals).toEqual({ USD: [50, 0, 0, 0] });
  });
});
