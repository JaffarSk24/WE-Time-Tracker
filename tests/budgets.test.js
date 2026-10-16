import { describe, it, expect } from 'vitest';
import {
  projectBudget, hasBudget, budgetPeriodKey, budgetPeriodRange, budgetLevel,
  projectBudgetUsage, budgetAlertToRaise
} from '../src/budgets.js';

// Local times, so month boundaries are checked in the machine's time zone.
const at = (y, m, d, h = 10, min = 0) => new Date(y, m - 1, d, h, min);
const log = (id, start, minutes, extra = {}) => ({
  id,
  projectId: 'p1',
  startTime: start.toISOString(),
  endTime: new Date(start.getTime() + minutes * 60000).toISOString(),
  billable: true,
  rateAtTime: 60,
  ...extra
});

describe('project budget fields', () => {
  it('has no budget without positive limits', () => {
    expect(projectBudget({ id: 'p1' })).toBeNull();
    expect(hasBudget({ id: 'p1', budgetHours: 0, budgetAmount: '' })).toBe(false);
    expect(hasBudget(null)).toBe(false);
  });

  it('reads hours, amount and period', () => {
    expect(projectBudget({ budgetHours: '10', budgetPeriod: 'month' })).toEqual({ hours: 10, amount: null, period: 'month' });
    expect(projectBudget({ budgetAmount: 500 })).toEqual({ hours: null, amount: 500, period: 'total' });
  });
});

describe('budget periods', () => {
  it('keys a monthly package by local month', () => {
    expect(budgetPeriodKey('month', at(2026, 1, 31, 23, 59))).toBe('2026-01');
    expect(budgetPeriodKey('month', at(2026, 2, 1, 0, 0))).toBe('2026-02');
    expect(budgetPeriodKey('total', at(2026, 2, 1))).toBe('total');
  });

  it('gives local month boundaries', () => {
    const r = budgetPeriodRange('month', at(2026, 12, 15));
    expect(r.start).toEqual(new Date(2026, 11, 1));
    expect(r.end).toEqual(new Date(2027, 0, 1));
    expect(budgetPeriodRange('total')).toBeNull();
  });

  it('levels at 80% and 100%', () => {
    expect(budgetLevel(0.79)).toBe('normal');
    expect(budgetLevel(0.8)).toBe('warning');
    expect(budgetLevel(1)).toBe('over');
  });
});

describe('budget usage', () => {
  const now = at(2026, 3, 20);

  it('counts hours of all entries and euros of billable ones', () => {
    const project = { id: 'p1', budgetHours: 10, budgetAmount: 1000 };
    const logs = [
      log('a', at(2026, 3, 2), 120),
      log('b', at(2026, 2, 2), 60, { billable: false }),
      log('c', at(2026, 3, 3), 60, { projectId: 'other' })
    ];
    const u = projectBudgetUsage(project, logs, now);
    expect(u.usedHours).toBe(3);
    expect(u.usedAmount).toBe(120);
    expect(u.hoursRatio).toBeCloseTo(0.3);
    expect(u.amountRatio).toBeCloseTo(0.12);
    expect(u.level).toBe('normal');
    expect(u.key).toBe('total');
  });

  it('respects pauses through durationMs', () => {
    const project = { id: 'p1', budgetHours: 1 };
    const paused = log('a', at(2026, 3, 2), 120, { durationMs: 30 * 60000 });
    expect(projectBudgetUsage(project, [paused], now).usedHours).toBe(0.5);
  });

  it('resets a monthly package at the local month start', () => {
    const project = { id: 'p1', budgetHours: 2, budgetPeriod: 'month' };
    const logs = [
      log('last', at(2026, 2, 28, 23, 30), 120),
      log('first', at(2026, 3, 1, 0, 0), 60)
    ];
    const u = projectBudgetUsage(project, logs, now);
    expect(u.usedHours).toBe(1);
    expect(u.key).toBe('2026-03');
    expect(u.level).toBe('normal');
  });

  it('takes the higher of the two ratios', () => {
    const project = { id: 'p1', budgetHours: 100, budgetAmount: 100 };
    const u = projectBudgetUsage(project, [log('a', at(2026, 3, 2), 90)], now);
    expect(u.ratio).toBeCloseTo(0.9);
    expect(u.level).toBe('warning');
  });

  it('can leave one entry out', () => {
    const project = { id: 'p1', budgetHours: 1 };
    const u = projectBudgetUsage(project, [log('a', at(2026, 3, 2), 60)], now, { excludeLogId: 'a' });
    expect(u.usedHours).toBe(0);
  });

  it('is null without a budget', () => {
    expect(projectBudgetUsage({ id: 'p1' }, [], now)).toBeNull();
  });
});

describe('budget alerts', () => {
  const usage = (level, key = 'total') => ({ level, key });

  it('raises a threshold once when it is crossed', () => {
    expect(budgetAlertToRaise({}, usage('normal'), usage('warning'))).toBe('warning');
    expect(budgetAlertToRaise({ budgetAlert: { period: 'total', level: 'warning' } }, usage('normal'), usage('warning'))).toBeNull();
    expect(budgetAlertToRaise({ budgetAlert: { period: 'total', level: 'warning' } }, usage('warning'), usage('over'))).toBe('over');
  });

  it('jumps straight to over', () => {
    expect(budgetAlertToRaise({}, usage('normal'), usage('over'))).toBe('over');
  });

  it('does not raise when the save did not cross a threshold', () => {
    expect(budgetAlertToRaise({}, usage('warning'), usage('warning'))).toBeNull();
    expect(budgetAlertToRaise({}, usage('over'), usage('warning'))).toBeNull();
    expect(budgetAlertToRaise({}, usage('normal'), usage('normal'))).toBeNull();
  });

  it('starts over in a new monthly period', () => {
    const project = { budgetAlert: { period: '2026-02', level: 'over' } };
    expect(budgetAlertToRaise(project, usage('normal', '2026-03'), usage('warning', '2026-03'))).toBe('warning');
  });
});
