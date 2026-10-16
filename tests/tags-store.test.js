import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../src/store.js';

beforeEach(() => {
  store.clearAllData();
});

describe('tags on entries', () => {
  it('new entries get tagIds, empty by default', () => {
    const c = store.addClient('Acme', 50);
    const plain = store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' });
    expect(plain.tagIds).toEqual([]);
    const tagged = store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z', tagIds: ['t1'] });
    expect(tagged.tagIds).toEqual(['t1']);
  });

  it('editing changes tags only when given', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z', tagIds: ['t1'] });
    store.updateTimeLog(log.id, { description: 'x', clientId: c.id, projectId: null });
    expect(store.getTimeLogs()[0].tagIds).toEqual(['t1']);
    store.updateTimeLog(log.id, { clientId: c.id, projectId: null, tagIds: ['t2'] });
    expect(store.getTimeLogs()[0].tagIds).toEqual(['t2']);
  });

  it('the running timer passes its extra fields to the saved entry', () => {
    const c = store.addClient('Acme', 60);
    store.startTimer('Work', c.id, null, true, { tagIds: ['t1', 't2'], note: 'kept' });
    expect(store.getActiveTimer().extra.tagIds).toEqual(['t1', 't2']);
    const log = store.stopTimer();
    expect(log.tagIds).toEqual(['t1', 't2']);
    expect(log.note).toBe('kept');
    expect(store.getTimeLogs()[0].tagIds).toEqual(['t1', 't2']);
  });

  it('extra never overrides core fields of the entry', () => {
    const c = store.addClient('Acme', 60);
    store.startTimer('Work', c.id, null, true, { rateAtTime: 999, id: 'x' });
    const log = store.stopTimer();
    expect(log.rateAtTime).toBe(60);
    expect(log.id).not.toBe('x');
  });

  it('without extra the timer is unchanged', () => {
    const c = store.addClient('Acme', 60);
    store.startTimer('Work', c.id, null, true);
    expect('extra' in store.getActiveTimer()).toBe(false);
    expect(store.stopTimer().tagIds).toEqual([]);
  });

  it('patchRecords changes several records in one go', () => {
    const c = store.addClient('Acme', 50);
    const a = store.addTimeLog({ clientId: c.id, startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z', tagIds: ['t1'] });
    const b = store.addTimeLog({ clientId: c.id, startTime: '2026-07-02T10:00:00Z', endTime: '2026-07-02T11:00:00Z', tagIds: ['t1', 't2'] });
    expect(store.patchRecords('timeLogs', [{ id: a.id, tagIds: [] }, { id: b.id, tagIds: ['t2'] }, { id: 'nope' }])).toBe(2);
    const byId = Object.fromEntries(store.getTimeLogs().map(l => [l.id, l.tagIds]));
    expect(byId).toEqual({ [a.id]: [], [b.id]: ['t2'] });
  });
});
