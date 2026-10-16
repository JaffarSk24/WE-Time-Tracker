import { describe, it, expect } from 'vitest';
import {
  startOfWeek, addWeeks, weekDays, buildWeekGrid, nextManualStart,
  findOverlaps, overlapsWith, timelineRange, findGaps, clientHue,
  splitLog, mergeLogs, mergeBlocker, assignLanes
} from '../src/timesheet.js';
import { localDayKey, logDurationMs } from '../src/utils.js';

// Local-time ISO helper: tests stay correct in any time zone.
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

const log = (id, start, end, extra = {}) => ({
  id, clientId: 'c1', projectId: 'p1', description: '', billable: true, paid: false,
  rateAtTime: 60, startTime: start, endTime: end, ...extra
});

describe('week helpers', () => {
  it('weeks start on Monday at local midnight', () => {
    const thu = new Date(2026, 9, 15, 13, 30); // Thursday
    const mon = startOfWeek(thu);
    expect(mon.getDay()).toBe(1);
    expect(localDayKey(mon)).toBe('2026-10-12');
    expect(mon.getHours()).toBe(0);
  });

  it('Sunday belongs to the week that started the Monday before', () => {
    expect(localDayKey(startOfWeek(new Date(2026, 9, 18, 23, 0)))).toBe('2026-10-12');
  });

  it('weekDays and addWeeks', () => {
    const days = weekDays(new Date(2026, 9, 12)).map(d => localDayKey(d));
    expect(days).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(localDayKey(addWeeks(new Date(2026, 9, 12), -1))).toBe('2026-10-05');
    expect(localDayKey(addWeeks(new Date(2026, 9, 26), 1))).toBe('2026-11-02');
  });
});

describe('buildWeekGrid', () => {
  it('groups by client/project and local day with totals and amounts', () => {
    const logs = [
      log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 10)),
      log('b', at(2026, 10, 12, 11), at(2026, 10, 12, 11, 30)),
      log('c', at(2026, 10, 14, 9), at(2026, 10, 14, 11), { projectId: null }),
      log('d', at(2026, 10, 13, 9), at(2026, 10, 13, 10), { billable: false }),
      log('e', at(2026, 10, 19, 9), at(2026, 10, 19, 10)) // next week
    ];
    const grid = buildWeekGrid(logs, new Date(2026, 9, 12));
    expect(grid.rows).toHaveLength(2);
    const p1 = grid.rows.find(r => r.projectId === 'p1');
    expect(p1.cells['2026-10-12'].ms).toBe(90 * 60000);
    expect(p1.cells['2026-10-12'].logs.map(l => l.id)).toEqual(['a', 'b']);
    expect(p1.totalMs).toBe(150 * 60000);
    expect(p1.amount).toBeCloseTo(90); // 1.5 h billable at 60, d is not billable
    const clientOnly = grid.rows.find(r => r.projectId === null);
    expect(clientOnly.totalMs).toBe(2 * 3600000);
    expect(grid.dayTotals['2026-10-14']).toBe(2 * 3600000);
    expect(grid.totalMs).toBe(270 * 60000);
    expect(grid.amount).toBeCloseTo(210);
  });

  it('uses worked time for paused entries', () => {
    const grid = buildWeekGrid([log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 11), { durationMs: 3600000 })], new Date(2026, 9, 12));
    expect(grid.totalMs).toBe(3600000);
  });

  it('empty week', () => {
    const grid = buildWeekGrid([], new Date(2026, 9, 12));
    expect(grid.rows).toEqual([]);
    expect(grid.totalMs).toBe(0);
  });
});

describe('nextManualStart', () => {
  it('starts at 09:00 local on an empty day', () => {
    const d = nextManualStart([log('x', at(2026, 10, 13, 9), at(2026, 10, 13, 10))], '2026-10-12');
    expect(d.getTime()).toBe(new Date(2026, 9, 12, 9, 0).getTime());
  });

  it('starts right after the latest end of that day', () => {
    const logs = [
      log('a', at(2026, 10, 12, 14), at(2026, 10, 12, 15, 20)),
      log('b', at(2026, 10, 12, 9), at(2026, 10, 12, 10))
    ];
    expect(nextManualStart(logs, '2026-10-12').getTime()).toBe(new Date(2026, 9, 12, 15, 20).getTime());
  });
});

describe('findOverlaps', () => {
  it('finds an overlapping pair with its range', () => {
    const a = log('a', at(2026, 10, 12, 10), at(2026, 10, 12, 10, 40));
    const b = log('b', at(2026, 10, 12, 10, 15), at(2026, 10, 12, 11));
    const res = findOverlaps([b, a]);
    expect(res).toHaveLength(1);
    expect(res[0].a.id).toBe('a');
    expect(res[0].b.id).toBe('b');
    expect(res[0].start).toBe(new Date(2026, 9, 12, 10, 15).getTime());
    expect(res[0].end).toBe(new Date(2026, 9, 12, 10, 40).getTime());
  });

  it('touching entries (end == start) do not overlap', () => {
    const a = log('a', at(2026, 10, 12, 10), at(2026, 10, 12, 11));
    const b = log('b', at(2026, 10, 12, 11), at(2026, 10, 12, 12));
    expect(findOverlaps([a, b])).toEqual([]);
  });

  it('a long entry overlaps several later ones, contained entries included', () => {
    const a = log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 12));
    const b = log('b', at(2026, 10, 12, 10), at(2026, 10, 12, 10, 30));
    const c = log('c', at(2026, 10, 12, 11), at(2026, 10, 12, 13));
    const res = findOverlaps([a, b, c]);
    expect(res.map(o => `${o.a.id}${o.b.id}`)).toEqual(['ab', 'ac']);
    expect(res[0].end).toBe(new Date(2026, 9, 12, 10, 30).getTime());
  });

  it('overlapsWith lists the other entries, not the entry itself', () => {
    const a = log('a', at(2026, 10, 12, 10), at(2026, 10, 12, 11));
    const b = log('b', at(2026, 10, 12, 10, 30), at(2026, 10, 12, 12));
    const c = log('c', at(2026, 10, 12, 12), at(2026, 10, 12, 13));
    expect(overlapsWith(a, [a, b, c]).map(l => l.id)).toEqual(['b']);
    expect(overlapsWith(c, [a, b, c])).toEqual([]);
  });
});

describe('timeline helpers', () => {
  it('range covers the hours with entries plus one hour each side', () => {
    const r = timelineRange([
      log('a', at(2026, 10, 12, 9, 15), at(2026, 10, 12, 10)),
      log('b', at(2026, 10, 12, 13), at(2026, 10, 12, 14, 30))
    ]);
    expect(r.start).toBe(new Date(2026, 9, 12, 8).getTime());
    expect(r.end).toBe(new Date(2026, 9, 12, 16).getTime());
    expect(timelineRange([])).toBeNull();
  });

  it('an entry ending on the hour does not add an extra hour', () => {
    const r = timelineRange([log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 10))]);
    expect(r.end).toBe(new Date(2026, 9, 12, 11).getTime());
  });

  it('gaps skip overlaps', () => {
    const gaps = findGaps([
      log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 11)),
      log('b', at(2026, 10, 12, 10), at(2026, 10, 12, 10, 30)),
      log('c', at(2026, 10, 12, 12), at(2026, 10, 12, 13))
    ]);
    expect(gaps).toEqual([{ start: new Date(2026, 9, 12, 11).getTime(), end: new Date(2026, 9, 12, 12).getTime() }]);
  });

  it('overlapping entries get separate lanes, touching ones share a lane', () => {
    const a = log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 10));
    const b = log('b', at(2026, 10, 12, 9, 30), at(2026, 10, 12, 11));
    const c = log('c', at(2026, 10, 12, 10), at(2026, 10, 12, 12));
    const res = assignLanes([a, b, c]);
    expect(res.lanes).toEqual({ a: 0, b: 1, c: 0 });
    expect(res.count).toBe(2);
    expect(assignLanes([]).count).toBe(1);
  });

  it('client hue is stable', () => {
    expect(clientHue('c1')).toBe(clientHue('c1'));
    expect(clientHue('c1')).toBeGreaterThanOrEqual(0);
    expect(clientHue('c1')).toBeLessThan(360);
  });
});

describe('splitLog', () => {
  it('splits a continuous entry and keeps every field but the id', () => {
    const src = log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 12), { tags: ['x'], description: 'Work' });
    const [first, second] = splitLog(src, new Date(2026, 9, 12, 10), 'b');
    expect(first.id).toBe('a');
    expect(second.id).toBe('b');
    expect(first.endTime).toBe(at(2026, 10, 12, 10));
    expect(second.startTime).toBe(at(2026, 10, 12, 10));
    expect(second.endTime).toBe(src.endTime);
    expect(second.tags).toEqual(['x']);
    expect(second.rateAtTime).toBe(60);
    expect(second.description).toBe('Work');
    expect(first.durationMs).toBeUndefined();
    expect(logDurationMs(first) + logDurationMs(second)).toBe(3 * 3600000);
  });

  it('splits paused worked time proportionally', () => {
    const src = log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 13), { durationMs: 2 * 3600000 });
    const [first, second] = splitLog(src, new Date(2026, 9, 12, 10), 'b');
    expect(first.durationMs).toBe(30 * 60000);
    expect(second.durationMs).toBe(90 * 60000);
  });

  it('refuses a moment outside or on the edges', () => {
    const src = log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 10));
    expect(splitLog(src, new Date(2026, 9, 12, 9), 'b')).toBeNull();
    expect(splitLog(src, new Date(2026, 9, 12, 10), 'b')).toBeNull();
    expect(splitLog(src, new Date(2026, 9, 12, 11), 'b')).toBeNull();
  });
});

describe('mergeLogs', () => {
  it('merges into the earliest entry', () => {
    const a = log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 10), { description: 'Design', tags: ['t'] });
    const b = log('b', at(2026, 10, 12, 10), at(2026, 10, 12, 11), { description: 'Design', rateAtTime: 80 });
    const c = log('c', at(2026, 10, 12, 11), at(2026, 10, 12, 11, 30), { description: 'Review' });
    const m = mergeLogs([c, a, b]);
    expect(m.id).toBe('a');
    expect(m.startTime).toBe(a.startTime);
    expect(m.endTime).toBe(c.endTime);
    expect(m.description).toBe('Design; Review');
    expect(m.rateAtTime).toBe(60);
    expect(m.tags).toEqual(['t']);
    expect(m.durationMs).toBeUndefined(); // no gaps: worked == span
  });

  it('keeps worked time when there are gaps or pauses', () => {
    const a = log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 10));
    const b = log('b', at(2026, 10, 12, 11), at(2026, 10, 12, 13), { durationMs: 3600000 });
    const m = mergeLogs([a, b]);
    expect(m.durationMs).toBe(2 * 3600000);
    expect(logDurationMs(m)).toBe(2 * 3600000);
  });

  it('blocks paid, mismatched or single entries', () => {
    const a = log('a', at(2026, 10, 12, 9), at(2026, 10, 12, 10));
    const b = log('b', at(2026, 10, 12, 10), at(2026, 10, 12, 11));
    expect(mergeBlocker([a])).toBe('count');
    expect(mergeBlocker([a, { ...b, paid: true }])).toBe('paid');
    expect(mergeBlocker([a, { ...b, projectId: 'p2' }])).toBe('mismatch');
    expect(mergeBlocker([a, { ...b, billable: false }])).toBe('mismatch');
    expect(mergeBlocker([a, b])).toBeNull();
    expect(mergeLogs([a, { ...b, clientId: 'c2' }])).toBeNull();
  });
});
