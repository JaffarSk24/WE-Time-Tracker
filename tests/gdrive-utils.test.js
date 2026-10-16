import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { grantsDrive, isInsufficientScope, pendingSignIn, DRIVE_SCOPE } = require('../gdrive-utils.cjs');

describe('grantsDrive', () => {
  it('accepts a token that carries the Drive permission', () => {
    expect(grantsDrive(`${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`)).toBe(true);
  });

  it('rejects a sign-in where the Drive checkbox was left unticked', () => {
    expect(grantsDrive('https://www.googleapis.com/auth/userinfo.email openid')).toBe(false);
  });

  it('takes a response without a scope list at its word', () => {
    expect(grantsDrive('')).toBe(true);
    expect(grantsDrive(undefined)).toBe(true);
  });
});

describe('isInsufficientScope', () => {
  it('recognises the 403 Google sends when Drive access is missing', () => {
    const body = '{"error":{"code":403,"message":"Request had insufficient authentication scopes."}}';
    expect(isInsufficientScope(403, body)).toBe(true);
  });

  it('does not mistake other failures for a missing permission', () => {
    expect(isInsufficientScope(404, 'File not found')).toBe(false);
    expect(isInsufficientScope(403, 'The user has exceeded their quota')).toBe(false);
  });
});

describe('pendingSignIn', () => {
  it('asks for nothing while the account is connected', () => {
    expect(pendingSignIn({ signInNeeded: { reason: 'expired' } }, true)).toBeNull();
  });

  it('reports an expired session together with the account it belonged to', () => {
    const state = { signInNeeded: { reason: 'expired', email: 'a@b.com' } };
    expect(pendingSignIn(state, false)).toEqual({ reason: 'expired', email: 'a@b.com' });
  });

  it('reports a sign-in that never granted Drive access', () => {
    const state = { signInNeeded: { reason: 'drive_scope', email: 'a@b.com' } };
    expect(pendingSignIn(state, false)).toEqual({ reason: 'drive_scope', email: 'a@b.com' });
  });

  it('catches installs broken by an older version, which left only a sync record', () => {
    expect(pendingSignIn({ remoteModified: '2026-10-01T10:00:00Z' }, false)).toEqual({ reason: 'expired', email: '' });
    expect(pendingSignIn({ syncedHash: 'abc' }, false)).toEqual({ reason: 'expired', email: '' });
  });

  it('stays quiet after the user signed out on purpose', () => {
    const afterLogout = { signInNeeded: null, syncedHash: null, remoteModified: null };
    expect(pendingSignIn(afterLogout, false)).toBeNull();
  });

  it('stays quiet for someone who never turned sync on', () => {
    expect(pendingSignIn({}, false)).toBeNull();
    expect(pendingSignIn(null, false)).toBeNull();
  });
});

const { syncAction, closePushAction, mergeData, newerSide } = require('../gdrive-utils.cjs');

describe('syncAction', () => {
  const base = { remoteExists: true, sameClient: true, remoteChanged: false, localChanged: false, localWork: true };

  it('seeds an empty cloud from this computer', () => {
    expect(syncAction({ ...base, remoteExists: false })).toBe('push');
  });

  it('uploads local work when the cloud has nothing new', () => {
    expect(syncAction({ ...base, localChanged: true })).toBe('push');
  });

  it('downloads cloud work when this computer has nothing new', () => {
    expect(syncAction({ ...base, remoteChanged: true })).toBe('pull');
  });

  it('merges instead of overwriting when both sides changed', () => {
    expect(syncAction({ ...base, remoteChanged: true, localChanged: true })).toBe('merge');
  });

  it('merges with the data of another OAuth client instead of replacing local work', () => {
    expect(syncAction({ ...base, sameClient: false })).toBe('merge');
    expect(syncAction({ ...base, sameClient: false, localWork: false })).toBe('pull');
  });

  it('does nothing when neither side changed', () => {
    expect(syncAction(base)).toBe('up_to_date');
  });
});

describe('closePushAction', () => {
  const base = { remoteExists: true, sameClient: true, remoteChanged: false, localChanged: true, localWork: true };

  it('uploads work done on this computer', () => {
    expect(closePushAction(base)).toBe('push');
  });

  // A computer opened with old data, offline at start or signed out, must
  // not replace newer data from another computer when it closes.
  it('never uploads over cloud data this computer has not seen', () => {
    expect(closePushAction({ ...base, remoteChanged: true })).toBe('merge');
    expect(closePushAction({ ...base, remoteChanged: true, localChanged: false })).toBe('skip');
    expect(closePushAction({ ...base, sameClient: false })).toBe('merge');
  });

  it('does not upload unchanged data', () => {
    expect(closePushAction({ ...base, localChanged: false })).toBe('skip');
  });
});

describe('mergeData', () => {
  const log = (id, extra = {}) => ({ id, description: id, ...extra });

  it('keeps every entry made on either computer', () => {
    const local = { clients: [], projects: [], timeLogs: [log('a'), log('b')], savedAt: '2026-10-12T08:00:00Z' };
    const remote = { clients: [], projects: [], timeLogs: [log('a'), log('c')], savedAt: '2026-10-10T08:00:00Z' };
    const merged = mergeData(local, remote, 'local');
    expect(merged.timeLogs.map(l => l.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('takes the newer version of an entry changed on both', () => {
    const local = { clients: [], projects: [], timeLogs: [log('a', { paid: false })] };
    const remote = { clients: [], projects: [], timeLogs: [log('a', { paid: true })] };
    expect(mergeData(local, remote, 'remote').timeLogs[0].paid).toBe(true);
    expect(mergeData(local, remote, 'local').timeLogs[0].paid).toBe(false);
  });

  it('keeps payments from both computers inside the same client', () => {
    const local = { clients: [{ id: 'c', payments: [{ id: 'p1', amount: 10 }] }], projects: [], timeLogs: [] };
    const remote = { clients: [{ id: 'c', payments: [{ id: 'p2', amount: 20 }] }], projects: [], timeLogs: [] };
    const merged = mergeData(local, remote, 'local');
    expect(merged.clients[0].payments.map(p => p.id).sort()).toEqual(['p1', 'p2']);
  });

  it('does not bring back what was deleted on the other computer', () => {
    const local = { clients: [], projects: [], timeLogs: [log('a'), log('b')] };
    const remote = { clients: [], projects: [], timeLogs: [log('a')], deleted: { b: '2026-10-12T09:00:00Z' } };
    expect(mergeData(local, remote, 'local').timeLogs.map(l => l.id)).toEqual(['a']);
  });

  it('merges collections added by later versions the same way', () => {
    const local = { clients: [], projects: [], timeLogs: [], expenses: [{ id: 'e1' }], tags: [{ id: 't1' }] };
    const remote = { clients: [], projects: [], timeLogs: [], expenses: [{ id: 'e2' }, { id: 'e3' }], deleted: { e3: 'x' } };
    const merged = mergeData(local, remote, 'local');
    expect(merged.expenses.map(e => e.id).sort()).toEqual(['e1', 'e2']);
    expect(merged.tags.map(e => e.id)).toEqual(['t1']);
  });

  it('keeps a running timer from either computer', () => {
    const timer = { description: 'work', startTime: '2026-10-12T08:00:00Z' };
    const local = { clients: [], projects: [], timeLogs: [], activeTimer: null };
    const remote = { clients: [], projects: [], timeLogs: [], activeTimer: timer };
    expect(mergeData(local, remote, 'local').activeTimer).toEqual(timer);
  });

  it('does not bring back a timer the other side has stopped', () => {
    const timer = { description: 'work', clientId: 'c', projectId: null, startTime: '2026-10-12T08:00:00Z', originalStartTime: '2026-10-12T08:00:00Z' };
    // Stopped in the window: the log starts at the original start.
    const stopped = { clients: [], projects: [], timeLogs: [log('a', { description: 'work', clientId: 'c', projectId: null, startTime: '2026-10-12T08:00:00Z' })], activeTimer: null };
    const stale = { clients: [], projects: [], timeLogs: [], activeTimer: timer };
    expect(mergeData(stopped, stale, 'local').activeTimer).toBe(null);
    // Stopped from the menu bar after a pause: the log starts later.
    stopped.timeLogs[0].startTime = '2026-10-12T08:20:00Z';
    expect(mergeData(stopped, stale, 'local').activeTimer).toBe(null);
  });

  it('keeps a timer whose task has only older logs', () => {
    const timer = { description: 'work', clientId: 'c', startTime: '2026-10-12T08:00:00Z', originalStartTime: '2026-10-12T08:00:00Z' };
    const local = { clients: [], projects: [], timeLogs: [log('a', { description: 'work', clientId: 'c', startTime: '2026-10-11T08:00:00Z' })], activeTimer: null };
    const remote = { clients: [], projects: [], timeLogs: [], activeTimer: timer };
    expect(mergeData(local, remote, 'local').activeTimer).toEqual(timer);
    const other = { ...remote, timeLogs: [log('b', { description: 'other', clientId: 'c', startTime: '2026-10-12T09:00:00Z' })] };
    expect(mergeData(local, other, 'local').activeTimer).toEqual(timer);
  });
});

describe('newerSide', () => {
  it('compares the save stamps of both copies', () => {
    expect(newerSide({ savedAt: '2026-10-12T08:00:00Z' }, { savedAt: '2026-10-11T08:00:00Z' })).toBe('local');
    expect(newerSide({ savedAt: '2026-10-10T08:00:00Z' }, { savedAt: '2026-10-11T08:00:00Z' })).toBe('remote');
  });

  it('falls back to file times for data saved by older versions', () => {
    expect(newerSide({}, {}, '2026-10-05T16:43:00Z', '2026-10-12T12:18:50Z')).toBe('remote');
  });
});
