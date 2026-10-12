import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// One cloud file shared by two computers, each with its own data file and
// sync state. Drive itself is replaced by this object.
let cloud;
let clock;

function tick() {
  clock += 1000;
  return new Date(clock).toISOString();
}

function computer() {
  // A fresh module instance per computer: the module exports a singleton.
  delete require.cache[require.resolve('../gdrive-sync.cjs')];
  const sync = require('../gdrive-sync.cjs');
  const disk = { data: null, backups: [], savedAt: null };
  sync.credentials = { clientId: 'client-new', clientSecret: 'x' };
  sync.tokens = { refresh_token: 'r', access_token: 'a', expiry: Date.now() + 3600e3 };
  sync.syncState = {};
  sync.saveSyncState = function (patch) {
    this.syncState = { ...this.syncState, ...patch, clientId: this.credentials.clientId };
  };
  sync.writeJson = () => {};
  sync.readLocal = () => disk.data;
  sync.writeLocal = (text) => { disk.data = text; disk.savedAt = tick(); };
  sync.backupLocal = (tag, content = null) => { disk.backups.push({ tag, content: content ?? disk.data }); return tag; };
  sync.localModified = () => disk.savedAt;
  sync.getAccessToken = async () => 'a';
  sync.findRemoteFile = async () => (cloud ? { id: 'f', modifiedTime: cloud.modifiedTime } : null);
  sync.readRemote = async () => cloud.content;
  sync.upload = async function (_token, _remote, content) {
    cloud = { content, modifiedTime: tick() };
    this.saveSyncState({ syncedHash: this.hash(content), remoteModified: cloud.modifiedTime });
  };
  return { sync, disk, edit(fn) { disk.data = JSON.stringify(fn(JSON.parse(disk.data))); disk.savedAt = tick(); } };
}

const data = (ids, extra = {}) => JSON.stringify({
  clients: [], projects: [], timeLogs: ids.map(id => ({ id })), deleted: {}, ...extra
});
const ids = (text) => JSON.parse(text).timeLogs.map(l => l.id).sort();

beforeEach(() => {
  cloud = null;
  clock = Date.parse('2026-10-12T08:00:00Z');
});

describe('sync between two computers', () => {
  it('a stale computer takes the newer data on launch and uploads nothing on close', async () => {
    const pro = computer();
    const air = computer();
    pro.disk.data = data(['a']);
    await pro.sync.sync(null, {});
    await air.sync.sync(null, { pullOnly: true });
    expect(ids(air.disk.data)).toEqual(['a']);

    pro.edit(d => ({ ...d, timeLogs: [...d.timeLogs, { id: 'b' }] }));
    await pro.sync.push(null);

    await air.sync.sync(null, { pullOnly: true });
    expect(ids(air.disk.data)).toEqual(['a', 'b']);
    const before = cloud.modifiedTime;
    const res = await air.sync.push(null);
    expect(res.skipped).toBe(true);
    expect(cloud.modifiedTime).toBe(before);
  });

  it('closing a computer left open with old data never removes newer entries from the cloud', async () => {
    const pro = computer();
    const air = computer();
    pro.disk.data = data(['a']);
    await pro.sync.sync(null, {});
    await air.sync.sync(null, { pullOnly: true });

    // The MacBook adds work and closes; the Air was open all along.
    pro.edit(d => ({ ...d, timeLogs: [...d.timeLogs, { id: 'b' }] }));
    await pro.sync.push(null);
    // The Air gets a new entry of its own, then is closed.
    air.edit(d => ({ ...d, timeLogs: [...d.timeLogs, { id: 'c' }] }));
    const res = await air.sync.push(null);

    expect(res.merged).toBe(true);
    expect(ids(cloud.content)).toEqual(['a', 'b', 'c']);
    expect(ids(air.disk.data)).toEqual(['a', 'b', 'c']);
    // Both originals are kept.
    expect(air.disk.backups.map(b => b.tag).sort()).toEqual(['cloud', 'premerge']);
  });

  it('the same data uploaded again does not make the other computer drop its work', async () => {
    const pro = computer();
    const air = computer();
    pro.disk.data = data(['a']);
    await pro.sync.sync(null, {});
    await air.sync.sync(null, { pullOnly: true });

    pro.edit(d => ({ ...d, timeLogs: [...d.timeLogs, { id: 'b' }] }));
    // Today's case: the other computer uploads exactly what the cloud holds.
    cloud = { ...cloud, modifiedTime: tick() };

    const start = await pro.sync.sync(null, { pullOnly: true });
    expect(start.localAhead).toBe(true);
    expect(ids(pro.disk.data)).toEqual(['a', 'b']);
    await pro.sync.push(null);
    expect(ids(cloud.content)).toEqual(['a', 'b']);
  });

  it('never uploads on launch, even when this computer is ahead', async () => {
    const pro = computer();
    pro.disk.data = data(['a']);
    await pro.sync.sync(null, {});
    pro.edit(d => ({ ...d, timeLogs: [...d.timeLogs, { id: 'b' }] }));
    const before = cloud.content;
    await pro.sync.sync(null, { pullOnly: true });
    expect(cloud.content).toBe(before);
  });

  it('merges when both sides changed, keeping deletions', async () => {
    const pro = computer();
    const air = computer();
    pro.disk.data = data(['a', 'b']);
    await pro.sync.sync(null, {});
    await air.sync.sync(null, { pullOnly: true });

    pro.edit(d => ({ ...d, timeLogs: d.timeLogs.filter(l => l.id !== 'b'), deleted: { b: tick() } }));
    await pro.sync.push(null);
    air.edit(d => ({ ...d, timeLogs: [...d.timeLogs, { id: 'c' }] }));

    await air.sync.sync(null, { pullOnly: true });
    expect(ids(air.disk.data)).toEqual(['a', 'c']);
  });

  it('a computer signed in again (sync state lost) merges instead of overwriting either side', async () => {
    const pro = computer();
    const air = computer();
    pro.disk.data = data(['a', 'b']);
    await pro.sync.sync(null, {});
    air.disk.data = data(['a', 'z']);
    air.sync.syncState = {};

    await air.sync.sync(null, { pullOnly: true });
    expect(ids(air.disk.data)).toEqual(['a', 'b', 'z']);
    expect(ids(cloud.content)).toEqual(['a', 'b']);
    await air.sync.push(null);
    expect(ids(cloud.content)).toEqual(['a', 'b', 'z']);
  });

  it('a cloud folder of an older OAuth client is merged, not replaced', async () => {
    const pro = computer();
    pro.disk.data = data(['a']);
    await pro.sync.sync(null, {});
    const air = computer();
    air.disk.data = data(['x']);
    air.sync.syncState = { clientId: 'client-old', syncedHash: 'h', remoteModified: 't' };

    await air.sync.sync(null, {});
    expect(ids(air.disk.data)).toEqual(['a', 'x']);
    expect(ids(cloud.content)).toEqual(['a', 'x']);
  });
});
