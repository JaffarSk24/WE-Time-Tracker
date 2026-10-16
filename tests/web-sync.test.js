import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { createHash } from 'crypto';
import { createSyncEngine, hasLocalWork } from '../src/web/sync.js';
import { sha256Hex } from '../src/web/hash.js';
import * as shared from 'virtual:gdrive-utils';

const require = createRequire(import.meta.url);

// One cloud file shared by a desktop computer (the real gdrive-sync.cjs) and
// a phone (the web engine). Drive itself is replaced by this object.
let cloud;
let clock;

function tick() {
  clock += 1000;
  return new Date(clock).toISOString();
}

function desktop() {
  delete require.cache[require.resolve('../gdrive-sync.cjs')];
  const sync = require('../gdrive-sync.cjs');
  const disk = { data: null, savedAt: null };
  sync.credentials = { clientId: 'desktop-client', clientSecret: 'x' };
  sync.tokens = { refresh_token: 'r', access_token: 'a', expiry: Date.now() + 3600e3 };
  sync.syncState = {};
  sync.saveSyncState = function (patch) {
    this.syncState = { ...this.syncState, ...patch, clientId: this.credentials.clientId };
  };
  sync.writeJson = () => {};
  sync.readLocal = () => disk.data;
  sync.writeLocal = (text) => { disk.data = text; disk.savedAt = tick(); };
  sync.backupLocal = () => 'backup';
  sync.localModified = () => disk.savedAt;
  sync.getAccessToken = async () => 'a';
  sync.findRemoteFile = async () => (cloud ? { id: 'f', modifiedTime: cloud.modifiedTime } : null);
  sync.readRemote = async () => cloud.content;
  sync.upload = async function (_token, _remote, content) {
    cloud = { content, modifiedTime: tick() };
    this.saveSyncState({ syncedHash: this.hash(content), remoteModified: cloud.modifiedTime });
  };
  return {
    disk,
    launch: () => sync.sync(null, { pullOnly: true }),
    syncButton: () => sync.sync(null, {}),
    close: () => sync.push(null),
    edit(fn) { disk.data = JSON.stringify({ ...fn(JSON.parse(disk.data)), savedAt: tick() }); disk.savedAt = clock; }
  };
}

function phone() {
  const storage = { data: null, state: {}, backups: [] };
  const engine = createSyncEngine({
    clientId: 'web-client',
    hash: sha256Hex,
    drive: {
      find: async () => (cloud ? { id: 'f', modifiedTime: cloud.modifiedTime } : null),
      read: async () => cloud.content,
      upload: async (_remote, content) => {
        cloud = { content, modifiedTime: tick() };
        return cloud.modifiedTime;
      }
    },
    local: { read: () => storage.data, write: (text) => { storage.data = text; } },
    state: { get: () => storage.state, set: (s) => { storage.state = s; } },
    backup: (tag, text) => storage.backups.push({ tag, text }),
    now: () => new Date(clock)
  });
  return {
    storage,
    engine,
    open: () => engine.sync({ pullOnly: true }),
    syncButton: () => engine.sync(),
    hide: () => engine.push(),
    edit(fn) { storage.data = JSON.stringify({ ...fn(JSON.parse(storage.data)), savedAt: tick() }); }
  };
}

const data = (logIds, extra = {}) => JSON.stringify({
  clients: [], projects: [], timeLogs: logIds.map(id => ({ id })), deleted: {}, activeTimer: null, savedAt: tick(), ...extra
});
const ids = (text) => JSON.parse(text).timeLogs.map(l => l.id).sort();
const addLog = (id, extra = {}) => d => ({ ...d, timeLogs: [...d.timeLogs, { id, ...extra }] });

beforeEach(() => {
  cloud = null;
  clock = Date.parse('2026-10-12T08:00:00Z');
});

describe('sha256Hex', () => {
  it('gives the same hash as the desktop app', async () => {
    const text = '{"description":"Работа ✓"}';
    expect(await sha256Hex(text)).toBe(createHash('sha256').update(text).digest('hex'));
    expect(await sha256Hex(null)).toBe(createHash('sha256').update('').digest('hex'));
  });
});

describe('shared sync rules', () => {
  it('the web app uses the very functions of gdrive-utils.cjs', () => {
    const cjs = require('../gdrive-utils.cjs');
    expect(Object.keys(shared).filter(k => k !== 'default').sort()).toEqual(Object.keys(cjs).sort());
    expect(shared.syncAction({ remoteExists: true, sameClient: true, remoteChanged: true, localChanged: true })).toBe('merge');
  });

  it('hasLocalWork matches the desktop rule', () => {
    expect(hasLocalWork(null)).toBe(false);
    expect(hasLocalWork(data([]))).toBe(false);
    expect(hasLocalWork(data(['a']))).toBe(true);
    expect(hasLocalWork('{broken')).toBe(true);
  });
});

describe('phone and desktop on one cloud file', () => {
  it('the phone takes the desktop data on opening and uploads nothing', async () => {
    const mac = desktop();
    mac.disk.data = data(['a']);
    await mac.syncButton();
    const before = cloud.modifiedTime;

    const iphone = phone();
    const res = await iphone.open();
    expect(res.pulled).toBe(true);
    expect(ids(iphone.storage.data)).toEqual(['a']);
    expect(cloud.modifiedTime).toBe(before);
    // Nothing changed: hiding the page uploads nothing.
    expect((await iphone.hide()).skipped).toBe(true);
    expect(cloud.modifiedTime).toBe(before);
  });

  it('opening never uploads, even when the phone is ahead', async () => {
    const mac = desktop();
    mac.disk.data = data(['a']);
    await mac.syncButton();
    const iphone = phone();
    await iphone.open();
    iphone.edit(addLog('p'));
    const before = cloud.modifiedTime;
    const res = await iphone.open();
    expect(res.localAhead).toBe(true);
    expect(cloud.modifiedTime).toBe(before);
    await iphone.hide();
    expect(ids(cloud.content)).toEqual(['a', 'p']);
  });

  it('a phone entry reaches the desktop on its next launch', async () => {
    const mac = desktop();
    mac.disk.data = data(['a']);
    await mac.syncButton();
    const iphone = phone();
    await iphone.open();
    iphone.edit(addLog('p'));
    expect((await iphone.hide()).pushed).toBe(true);
    const res = await mac.launch();
    expect(res.pulled).toBe(true);
    expect(ids(mac.disk.data)).toEqual(['a', 'p']);
  });

  it('when both changed they are merged, never replaced, keeping deletions', async () => {
    const mac = desktop();
    mac.disk.data = data(['a', 'b']);
    await mac.syncButton();
    const iphone = phone();
    await iphone.open();

    mac.edit(d => ({ ...d, timeLogs: d.timeLogs.filter(l => l.id !== 'b'), deleted: { b: 'x' } }));
    mac.edit(addLog('m'));
    await mac.close();

    iphone.edit(addLog('p'));
    const res = await iphone.hide();
    expect(res.merged).toBe(true);
    expect(res.pushed).toBe(true);
    expect(ids(iphone.storage.data)).toEqual(['a', 'm', 'p']);
    expect(ids(cloud.content)).toEqual(['a', 'm', 'p']);
    expect(iphone.storage.backups.map(b => b.tag)).toContain('premerge');

    await mac.launch();
    expect(ids(mac.disk.data)).toEqual(['a', 'm', 'p']);
  });

  it('opening merges without uploading when both changed', async () => {
    const mac = desktop();
    mac.disk.data = data(['a']);
    await mac.syncButton();
    const iphone = phone();
    await iphone.open();
    mac.edit(addLog('m'));
    await mac.close();
    iphone.edit(addLog('p'));
    const before = cloud.modifiedTime;
    const res = await iphone.open();
    expect(res.merged).toBe(true);
    expect(res.pushed).toBe(false);
    expect(cloud.modifiedTime).toBe(before);
    expect(ids(iphone.storage.data)).toEqual(['a', 'm', 'p']);
    // The Sync button then uploads the merge.
    expect((await iphone.syncButton()).pushed).toBe(true);
    expect(ids(cloud.content)).toEqual(['a', 'm', 'p']);
  });

  it('a phone with its own entries signing in for the first time merges', async () => {
    const mac = desktop();
    mac.disk.data = data(['a']);
    await mac.syncButton();
    const iphone = phone();
    iphone.storage.data = data(['p']);
    const res = await iphone.open();
    expect(res.merged).toBe(true);
    expect(ids(iphone.storage.data)).toEqual(['a', 'p']);
  });

  it('the first upload creates the cloud file', async () => {
    const iphone = phone();
    iphone.storage.data = data(['p']);
    expect((await iphone.open()).localAhead).toBe(true);
    expect(cloud).toBe(null);
    expect((await iphone.syncButton()).pushed).toBe(true);
    expect(ids(cloud.content)).toEqual(['p']);
  });

  it('the same data uploaded again is not a change', async () => {
    const mac = desktop();
    mac.disk.data = data(['a']);
    await mac.syncButton();
    const iphone = phone();
    await iphone.open();
    // The desktop uploads identical content (a new timestamp only).
    cloud = { ...cloud, modifiedTime: tick() };
    iphone.edit(addLog('p'));
    const res = await iphone.hide();
    expect(res.pushed).toBe(true);
    expect(res.merged).toBeUndefined();
  });

  it('a timer started on the phone appears on the desktop, and stopped there it stays stopped', async () => {
    const mac = desktop();
    mac.disk.data = data(['a']);
    await mac.syncButton();
    const iphone = phone();
    await iphone.open();
    const timer = { description: 'call', clientId: 'c', projectId: null, startTime: '2026-10-12T08:30:00.000Z', originalStartTime: '2026-10-12T08:30:00.000Z', billable: true, isPaused: false, accumulatedTime: 0 };
    iphone.edit(d => ({ ...d, activeTimer: timer }));
    await iphone.hide();

    await mac.launch();
    expect(JSON.parse(mac.disk.data).activeTimer).toEqual(timer);

    // Stopped on the desktop while the phone, offline, changed something else.
    mac.edit(d => ({ ...addLog('t', { description: 'call', clientId: 'c', projectId: null, startTime: timer.originalStartTime })(d), activeTimer: null }));
    await mac.close();
    iphone.edit(addLog('p'));
    await iphone.hide();
    expect(JSON.parse(iphone.storage.data).activeTimer).toBe(null);
    expect(ids(iphone.storage.data)).toEqual(['a', 'p', 't']);
  });

  it('does not overwrite an edit made while the cloud was being read', async () => {
    const mac = desktop();
    mac.disk.data = data(['a']);
    await mac.syncButton();
    const iphone = phone();
    const engine = createSyncEngine({
      clientId: 'web-client',
      hash: sha256Hex,
      drive: {
        find: async () => ({ id: 'f', modifiedTime: cloud.modifiedTime }),
        read: async () => { iphone.storage.data = data(['typed']); return cloud.content; },
        upload: async () => tick()
      },
      local: { read: () => iphone.storage.data, write: (text) => { iphone.storage.data = text; } },
      state: { get: () => iphone.storage.state, set: (s) => { iphone.storage.state = s; } }
    });
    await expect(engine.sync({ pullOnly: true })).rejects.toThrow('local_changed');
    expect(ids(iphone.storage.data)).toEqual(['typed']);
    expect(engine.busy).toBe(false);
  });

  it('runs one sync at a time', async () => {
    const iphone = phone();
    iphone.storage.data = data(['p']);
    const [first, second] = await Promise.all([iphone.syncButton(), iphone.hide()]);
    expect(first.pushed).toBe(true);
    expect(second.error).toBe('busy');
  });
});
