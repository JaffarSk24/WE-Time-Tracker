import { describe, it, expect, vi, beforeEach } from 'vitest';

// A stand-in for the preload bridge: each check answers with the release
// currently "published".
let published = '2.0.0';
const bridge = {
  check: vi.fn(async () => ({ ok: true, available: true, current: '1.9.2', latest: published, notes: `notes ${published}` })),
  download: vi.fn(async () => ({ ok: true, inPlace: true, version: published, release: { ok: true, available: true, current: '1.9.2', latest: published, notes: `notes ${published}` } })),
  install: vi.fn(async () => ({ ok: true, quit: true })),
  onProgress: vi.fn()
};

let updates;

beforeEach(async () => {
  vi.resetModules();
  published = '2.0.0';
  globalThis.window.weUpdates = bridge;
  updates = await import('../src/updates.js');
});

describe('update offer', () => {
  it('downloads the newest release, even one published after the check', async () => {
    await updates.checkForUpdates();
    expect(updates.updateState.last.latest).toBe('2.0.0');
    published = '2.0.1';
    await updates.downloadUpdate();
    expect(updates.updateState.phase).toBe('ready');
    expect(updates.updateState.last.latest).toBe('2.0.1');
    expect(updates.updateState.last.notes).toBe('notes 2.0.1');
  });

  it('keeps a downloaded update ready while it is still the newest', async () => {
    await updates.checkForUpdates();
    await updates.downloadUpdate();
    await updates.checkForUpdates();
    expect(updates.updateState.phase).toBe('ready');
    expect(updates.updateState.last.latest).toBe('2.0.0');
  });

  it('offers a release that came out while the download waited to be installed', async () => {
    await updates.checkForUpdates();
    await updates.downloadUpdate();
    published = '2.1.0';
    await updates.checkForUpdates();
    expect(updates.updateState.phase).toBe('idle');
    expect(updates.updateState.last.latest).toBe('2.1.0');
    expect(updates.updateOffered()).toBe(true);
  });
});
