import { describe, it, expect } from 'vitest';
import {
  weekRange, monthRange, normalizeGoals, hasGoals, goalProgress,
  formatGoalHours, goalTrayLabel
} from '../src/goals.js';

const at = (y, m, d, h = 10, min = 0) => new Date(y, m - 1, d, h, min);
const log = (start, minutes, extra = {}) => ({
  id: 'l' + start.getTime() + minutes,
  startTime: start.toISOString(),
  endTime: new Date(start.getTime() + minutes * 60000).toISOString(),
  billable: true,
  rateAtTime: 40,
  ...extra
});

describe('goal periods', () => {
  it('weeks start on Monday, local time', () => {
    // 2026-10-18 is a Sunday
    const sunday = weekRange(at(2026, 10, 18, 23, 59));
    expect(sunday.start).toEqual(new Date(2026, 9, 12));
    expect(sunday.end).toEqual(new Date(2026, 9, 19));
    const monday = weekRange(at(2026, 10, 19, 0, 0));
    expect(monday.start).toEqual(new Date(2026, 9, 19));
  });

  it('months use local boundaries', () => {
    const r = monthRange(at(2026, 12, 31, 23));
    expect(r.start).toEqual(new Date(2026, 11, 1));
    expect(r.end).toEqual(new Date(2027, 0, 1));
  });
});

describe('goal settings', () => {
  it('empty values turn a goal off', () => {
    expect(normalizeGoals({ weekHours: '', weekAmount: '0', monthAmount: '2000' }))
      .toEqual({ weekHours: null, weekAmount: null, monthAmount: 2000 });
    expect(hasGoals(undefined)).toBe(false);
    expect(hasGoals({ weekHours: 30 })).toBe(true);
  });
});

describe('goal progress', () => {
  const now = at(2026, 10, 16); // Friday
  const logs = [
    log(at(2026, 10, 12, 9), 600),                       // Monday, 10 h, 400 €
    log(at(2026, 10, 14, 9), 150),                       // 2.5 h, 100 €
    log(at(2026, 10, 15, 9), 120, { billable: false }),  // not billable
    log(at(2026, 10, 11, 23), 60),                       // previous Sunday
    log(at(2026, 10, 1, 9), 60)                          // this month, earlier week
  ];

  it('counts billable hours and amount of this week and month', () => {
    const p = goalProgress(logs, { weekHours: 30, weekAmount: 1000, monthAmount: 2000 }, now);
    expect(p.map(g => g.key)).toEqual(['weekHours', 'weekAmount', 'monthAmount']);
    expect(p[0].value).toBe(12.5);
    expect(p[0].percent).toBe(41);
    expect(p[1].value).toBe(500);
    expect(p[2].value).toBe(580);
  });

  it('skips goals that are off', () => {
    expect(goalProgress(logs, { weekAmount: 1000 }, now).map(g => g.key)).toEqual(['weekAmount']);
    expect(goalProgress(logs, {}, now)).toEqual([]);
  });
});

describe('tray label', () => {
  const now = at(2026, 10, 16);
  const logs = [log(at(2026, 10, 12, 9), 750)];

  it('formats hours with a decimal comma in Russian', () => {
    expect(formatGoalHours(12.5, 'ru')).toBe('12,5');
    expect(formatGoalHours(30, 'en')).toBe('30');
    expect(goalTrayLabel(logs, { weekHours: 30 }, 'ru', now)).toBe('Цель: 12,5 / 30 ч');
    expect(goalTrayLabel(logs, { weekHours: 30 }, 'en', now)).toBe('Goal: 12.5 / 30 h');
  });

  it('falls back to an amount goal and to empty', () => {
    expect(goalTrayLabel(logs, { weekAmount: 1000 }, 'en', now)).toBe('Goal: 500 / 1000 €');
    expect(goalTrayLabel(logs, {}, 'ru', now)).toBe('');
  });
});
