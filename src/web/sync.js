// Sync engine of the phone web app. It follows exactly the rules of the
// desktop app (gdrive-sync.cjs), with the decisions taken by the same pure
// functions (gdrive-utils.cjs):
// - on opening and on returning to the app it only takes data from the cloud
//   (sync with pullOnly), merging it in when both sides changed;
// - it uploads only from the Sync button (sync), when the page is hidden and
//   after the timer is stopped (push), and only after checking the cloud;
// - changes are detected by the hash of the content, not by timestamps;
// - when both sides changed, mergeData combines them; nobody is asked.
//
// Everything outside is injected, so tests can run two desktops and a phone
// against one cloud:
//   drive  { find(), read(remote), upload(remote, content) -> modifiedTime }
//   local  { read() -> text|null, write(text) }
//   state  { get() -> object, set(object) }   this device's sync record
//   hash   async (text) -> hex
//   backup (tag, text) keeps a copy before local data is replaced

import { syncAction, closePushAction, mergeData, newerSide } from 'virtual:gdrive-utils';

// A data file that holds no clients, projects or time logs is a fresh start,
// not work that a download could destroy.
export function hasLocalWork(content) {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return ['clients', 'projects', 'timeLogs'].some(k => Array.isArray(parsed[k]) && parsed[k].length > 0);
  } catch (e) {
    // Unreadable local data is still data: never treat it as empty.
    return true;
  }
}

// The local data changed while the cloud was being read: writing the
// download now would throw that change away. The caller simply runs again.
export function localChangedError() {
  const err = new Error('local_changed');
  err.localChanged = true;
  return err;
}

export function createSyncEngine({ drive, local, state, hash, clientId, backup = () => {}, now = () => new Date() }) {
  let busy = false;

  function saveState(patch) {
    state.set({
      ...(state.get() || {}),
      ...patch,
      // Which OAuth client's view of the folder the record describes.
      clientId,
      lastSync: now().toISOString()
    });
  }

  // Same as GDriveSync.inspect: compares both copies with what this device
  // last synced. A new cloud timestamp alone does not count; the content
  // decides.
  async function inspect(remote, localContent) {
    const s = state.get() || {};
    const localHash = await hash(localContent);
    const facts = {
      remoteExists: Boolean(remote),
      sameClient: !clientId || s.clientId === clientId,
      remoteChanged: false,
      localChanged: localContent ? localHash !== s.syncedHash : false,
      localWork: hasLocalWork(localContent),
      remoteContent: null
    };
    if (!remote) return facts;
    if (facts.sameClient && remote.modifiedTime === s.remoteModified && s.syncedHash) return facts;
    facts.remoteContent = await drive.read(remote);
    const remoteHash = await hash(facts.remoteContent);
    if (remoteHash === localHash) {
      return { ...facts, sameClient: true, remoteChanged: false, localChanged: false };
    }
    facts.remoteChanged = !facts.sameClient || remoteHash !== s.syncedHash;
    return facts;
  }

  function writeLocal(expected, text) {
    if (local.read() !== expected) throw localChangedError();
    local.write(text);
  }

  async function upload(remote, content) {
    const modifiedTime = await drive.upload(remote, content);
    saveState({ syncedHash: await hash(content), remoteModified: modifiedTime || null });
  }

  async function pullRemote(remote, localContent, remoteContent) {
    const content = remoteContent || await drive.read(remote);
    JSON.parse(content); // reject malformed payloads before touching local data
    if (localContent) backup('presync', localContent);
    writeLocal(localContent, content);
    saveState({ syncedHash: await hash(content), remoteModified: remote.modifiedTime });
    return { ok: true, pulled: true };
  }

  async function mergeRemote(remote, localContent, remoteContent, { upload: andUpload }) {
    const remoteText = remoteContent || await drive.read(remote);
    // Unreadable data on either side is still data: never merge it away.
    const mine = JSON.parse(localContent);
    const cloud = JSON.parse(remoteText);
    backup('premerge', localContent);
    const side = newerSide(mine, cloud, null, remote.modifiedTime);
    const merged = JSON.stringify(mergeData(mine, cloud, side));
    writeLocal(localContent, merged);
    // The cloud copy is now part of the local data.
    saveState({ syncedHash: await hash(remoteText), remoteModified: remote.modifiedTime });
    if (andUpload) await upload(remote, merged);
    return { ok: true, merged: true, pushed: Boolean(andUpload) };
  }

  async function guarded(fn) {
    if (busy) return { ok: false, error: 'busy' };
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  }

  return {
    get busy() { return busy; },

    // The Sync button (pullOnly false) and opening or returning to the app
    // (pullOnly true), as GDriveSync.sync.
    sync({ pullOnly = false } = {}) {
      return guarded(async () => {
        const remote = await drive.find();
        const localContent = local.read();
        const facts = await inspect(remote, localContent);
        const action = syncAction(facts);
        if (action === 'push') {
          // Local work waits for the Sync button, hiding the page or a stop.
          if (pullOnly) return { ok: true, localAhead: true };
          if (!localContent) return { ok: false, error: 'no_local_data' };
          await upload(remote, localContent);
          return { ok: true, pushed: true };
        }
        if (action === 'pull') return pullRemote(remote, localContent, facts.remoteContent);
        if (action === 'merge') return mergeRemote(remote, localContent, facts.remoteContent, { upload: !pullOnly });
        // Same data on both sides; remember the cloud timestamp as seen.
        saveState({ remoteModified: remote.modifiedTime, syncedHash: await hash(localContent) });
        return { ok: true, upToDate: true };
      });
    },

    // Hiding the page and stopping the timer, as GDriveSync.push: never
    // replaces cloud data this device has not seen, unchanged data is not
    // uploaded at all.
    push() {
      return guarded(async () => {
        const content = local.read();
        if (!content) return { ok: false, error: 'no_local_data' };
        const remote = await drive.find();
        const facts = await inspect(remote, content);
        const action = closePushAction(facts);
        if (action === 'skip') return { ok: true, skipped: true };
        if (action === 'merge') return mergeRemote(remote, content, facts.remoteContent, { upload: true });
        await upload(remote, content);
        return { ok: true, pushed: true };
      });
    },

    // Signing out: the next sign-in starts from the cloud copy again.
    forget() {
      saveState({ syncedHash: null, remoteModified: null });
    }
  };
}
