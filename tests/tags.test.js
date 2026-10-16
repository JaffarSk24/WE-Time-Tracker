import { describe, it, expect } from 'vitest';
import {
  TAG_COLORS, tagColor, logTagIds, validTagIds, filterLogsByTag, tagRemovalPatches,
  tagNamesOf, tagStats, dashboardPeriodRange
} from '../src/tags.js';

const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h);
const log = (id, start, minutes, tagIds, extra = {}) => ({
  id, tagIds,
  startTime: start.toISOString(),
  endTime: new Date(start.getTime() + minutes * 60000).toISOString(),
  billable: true,
  rateAtTime: 60,
  ...extra
});
const tags = [
  { id: 't1', name: 'Design', color: TAG_COLORS[1] },
  { id: 't2', name: 'Calls', color: 'nope' }
];

describe('tag helpers', () => {
  it('handles entries without tags', () => {
    expect(logTagIds({})).toEqual([]);
    expect(tagColor('nope')).toBe(TAG_COLORS[0]);
    expect(validTagIds(['t1', 'gone', 't1'], tags)).toEqual(['t1']);
  });

  it('filters, names and removes', () => {
    const logs = [log('a', at(2026, 1, 1), 60, ['t1', 't2']), log('b', at(2026, 1, 1), 60, [])];
    expect(filterLogsByTag(logs, 't2').map(l => l.id)).toEqual(['a']);
    expect(filterLogsByTag(logs, '')).toBe(logs);
    expect(tagNamesOf(logs[0], tags)).toEqual(['Design', 'Calls']);
    expect(tagRemovalPatches(logs, 't1')).toEqual([{ id: 'a', tagIds: ['t2'] }]);
  });
});

describe('tag stats', () => {
  it('sums hours and billable amount per tag in a range', () => {
    const logs = [
      log('a', at(2026, 3, 2), 60, ['t1', 't2']),
      log('b', at(2026, 3, 3), 120, ['t1'], { billable: false }),
      log('c', at(2026, 2, 3), 600, ['t2'])
    ];
    const range = { start: new Date(2026, 2, 1), end: new Date(2026, 3, 1) };
    const stats = tagStats(logs, tags, range);
    expect(stats.map(s => s.id)).toEqual(['t1', 't2']);
    expect(stats[0].hours).toBe(3);
    expect(stats[0].amount).toBe(60);
    expect(stats[1].hours).toBe(1);
    expect(stats[1].color).toBe(TAG_COLORS[0]);
    expect(tagStats(logs, tags).find(s => s.id === 't2').hours).toBe(11);
  });
});

describe('dashboard period range', () => {
  const now = at(2026, 3, 10, 15);

  it('covers the last N days including today', () => {
    const r = dashboardPeriodRange('7', now);
    expect(r.start).toEqual(new Date(2026, 2, 4));
    expect(r.end).toEqual(new Date(2026, 2, 11));
  });

  it('covers last month and last year', () => {
    expect(dashboardPeriodRange('last-month', now)).toEqual({ start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) });
    expect(dashboardPeriodRange('last-year', now)).toEqual({ start: new Date(2025, 0, 1), end: new Date(2026, 0, 1) });
    expect(dashboardPeriodRange('3-months', now).start).toEqual(new Date(2026, 0, 1));
  });
});
