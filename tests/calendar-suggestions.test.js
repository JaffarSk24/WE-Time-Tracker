import { describe, it, expect } from 'vitest';
import {
  isCovered, uncoveredEvents, suggestionRange, pruneHidden, titleKey, rememberedClient
} from '../src/calendar-suggestions.js';

const ev = (id, start, end) => ({ id, title: id, startTime: start, endTime: end });
const log = (start, end) => ({ startTime: start, endTime: end });
// Event 10:00-11:00 (UTC), 60 minutes.
const meeting = ev('m', '2026-10-16T10:00:00Z', '2026-10-16T11:00:00Z');

describe('isCovered', () => {
  it('needs one entry overlapping at least half of the event', () => {
    expect(isCovered(meeting, [log('2026-10-16T10:00:00Z', '2026-10-16T11:00:00Z')])).toBe(true);
    expect(isCovered(meeting, [log('2026-10-16T10:30:00Z', '2026-10-16T12:00:00Z')])).toBe(true);
    expect(isCovered(meeting, [log('2026-10-16T09:00:00Z', '2026-10-16T10:30:00Z')])).toBe(true);
    expect(isCovered(meeting, [log('2026-10-16T10:31:00Z', '2026-10-16T12:00:00Z')])).toBe(false);
    expect(isCovered(meeting, [log('2026-10-16T09:00:00Z', '2026-10-16T13:00:00Z')])).toBe(true);
  });

  it('does not add up several short entries', () => {
    expect(isCovered(meeting, [
      log('2026-10-16T10:00:00Z', '2026-10-16T10:20:00Z'),
      log('2026-10-16T10:40:00Z', '2026-10-16T11:00:00Z')
    ])).toBe(false);
  });

  it('ignores entries that only touch the event or have no times', () => {
    expect(isCovered(meeting, [log('2026-10-16T11:00:00Z', '2026-10-16T12:00:00Z')])).toBe(false);
    expect(isCovered(meeting, [{ startTime: null }, null])).toBe(false);
    expect(isCovered(meeting, [])).toBe(false);
  });
});

describe('uncoveredEvents', () => {
  const now = new Date('2026-10-16T15:00:00Z');
  const events = [
    meeting,
    ev('covered', '2026-10-16T12:00:00Z', '2026-10-16T13:00:00Z'),
    ev('hidden', '2026-10-16T13:00:00Z', '2026-10-16T13:30:00Z'),
    ev('later', '2026-10-16T14:30:00Z', '2026-10-16T15:30:00Z'),
    ev('ended', '2026-10-16T14:00:00Z', '2026-10-16T15:00:00Z')
  ];

  it('drops covered, hidden and unfinished events', () => {
    const out = uncoveredEvents(events, [log('2026-10-16T12:10:00Z', '2026-10-16T13:00:00Z')], { hidden: '2026-10-16T13:30:00Z' }, now);
    expect(out.map(e => e.id)).toEqual(['m', 'ended']);
  });

  it('works without logs or hidden events', () => {
    expect(uncoveredEvents(events, [], undefined, now)).toHaveLength(4);
    expect(uncoveredEvents(null, [], {}, now)).toEqual([]);
  });
});

describe('suggestionRange', () => {
  it('starts at local midnight of yesterday and ends now', () => {
    const now = new Date(2026, 9, 16, 14, 30);
    const r = suggestionRange(now);
    expect(r.from).toBe(new Date(2026, 9, 15, 0, 0).toISOString());
    expect(r.to).toBe(now.toISOString());
  });

  it('crosses month boundaries', () => {
    expect(suggestionRange(new Date(2026, 10, 1, 9, 0)).from).toBe(new Date(2026, 9, 31).toISOString());
  });
});

describe('pruneHidden', () => {
  it('keeps the last 30 days only', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const out = pruneHidden({
      fresh: '2026-10-15T10:00:00Z',
      edge: '2026-09-16T12:00:00Z',
      old: '2026-09-16T11:59:00Z',
      broken: 'not a date'
    }, now);
    expect(out).toEqual({ fresh: '2026-10-15T10:00:00Z', edge: '2026-09-16T12:00:00Z' });
    expect(pruneHidden(undefined, now)).toEqual({});
  });
});

describe('remembered clients', () => {
  it('match titles without case and forget deleted clients', () => {
    expect(titleKey('  Weekly Sync ')).toBe('weekly sync');
    const map = { 'weekly sync': 'c1', standup: 'gone' };
    const clients = [{ id: 'c1', name: 'Acme' }];
    expect(rememberedClient(map, 'WEEKLY SYNC', clients)).toBe('c1');
    expect(rememberedClient(map, 'Standup', clients)).toBe('');
    expect(rememberedClient(undefined, 'x', clients)).toBe('');
  });
});
