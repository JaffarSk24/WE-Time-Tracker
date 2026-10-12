// Pure helpers of the Google sign-in, kept apart from Electron so tests can
// run them.

// The permission the whole sync depends on.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// Google lets people untick single permissions on its consent page, and a
// token without Drive access is useless for sync. A token response without a
// scope list is taken at its word.
function grantsDrive(scope) {
  if (!scope) return true;
  return String(scope).split(/\s+/).includes(DRIVE_SCOPE);
}

// A Drive answer saying the token lacks the permission it needs.
function isInsufficientScope(status, body) {
  return status === 403 && /insufficient/i.test(String(body || ''));
}

// Whether the app should be asking for a new sign-in. Sync counts as switched
// on while the computer still remembers one (signing out clears that), so an
// install broken by an older version — tokens dropped without a note — is
// caught as well. Signed in, nothing is pending.
function pendingSignIn(state, loggedIn) {
  if (loggedIn) return null;
  const s = state || {};
  if (s.signInNeeded) {
    return { reason: s.signInNeeded.reason || 'expired', email: s.signInNeeded.email || '' };
  }
  if (s.remoteModified || s.syncedHash) return { reason: 'expired', email: '' };
  return null;
}

// What a sync does, from what is known about both copies.
//   remoteExists   the cloud holds a data file
//   sameClient     the recorded sync state belongs to the current OAuth client
//   remoteChanged  the cloud CONTENT differs from what this computer last
//                  synced (a new timestamp alone does not count: uploading
//                  identical data moves it too)
//   localChanged   the local file differs from what this computer last synced
//   localWork      the local file holds any clients, projects or time logs
// Returns 'push', 'pull', 'up_to_date', or 'merge' when both sides hold work
// the other has not seen: then both are combined (see mergeData), so no copy
// ever replaces the other.
function syncAction({ remoteExists, sameClient, remoteChanged, localChanged, localWork }) {
  if (!remoteExists) return 'push';
  if (!sameClient) return localWork ? 'merge' : 'pull';
  if (remoteChanged && localChanged) return 'merge';
  if (remoteChanged) return 'pull';
  if (localChanged) return 'push';
  return 'up_to_date';
}

// What the upload made on closing the window or quitting does. It never
// replaces cloud data this computer has not seen: when the cloud moved on,
// both copies are merged first. Unchanged data is not uploaded at all.
function closePushAction(facts) {
  const action = syncAction(facts);
  if (action === 'push' || action === 'merge') return action;
  return 'skip';
}

function byId(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(item => {
    if (item && item.id) map.set(item.id, item);
  });
  return map;
}

// Records of both lists, each id once. A record on both sides comes from the
// newer copy; anything deleted on either side stays deleted.
function mergeList(newerList, olderList, deleted) {
  const newer = byId(newerList);
  const older = byId(olderList);
  const out = [];
  newer.forEach((item, id) => { if (!deleted[id]) out.push(item); });
  older.forEach((item, id) => { if (!deleted[id] && !newer.has(id)) out.push(item); });
  return out;
}

// Which copy was saved last. The store stamps savedAt on every save; files
// written by older versions fall back to the file times.
function newerSide(local, remote, localFileTime, remoteFileTime) {
  const l = Date.parse((local && local.savedAt) || '') || Date.parse(localFileTime || '') || 0;
  const r = Date.parse((remote && remote.savedAt) || '') || Date.parse(remoteFileTime || '') || 0;
  return l >= r ? 'local' : 'remote';
}

// Combines two copies of the data so that nothing entered on either computer
// is lost: every client, project, time log and payment from both, the newer
// copy winning where the same record differs, deletions from both applied.
function mergeData(local, remote, side) {
  const newer = side === 'local' ? local : remote;
  const older = side === 'local' ? remote : local;
  const deleted = { ...((older && older.deleted) || {}), ...((newer && newer.deleted) || {}) };

  // A client on both sides comes from the newer copy, with the payments of
  // both (payments live inside their client).
  const olderClients = byId(older.clients);
  const newerClients = byId(newer.clients);
  const clients = mergeList(newer.clients, older.clients, deleted).map(client => {
    const other = olderClients.get(client.id);
    if (!other || !newerClients.has(client.id)) return client;
    return { ...client, payments: mergeList(client.payments, other.payments, deleted) };
  });

  const times = [local.savedAt, remote.savedAt].filter(Boolean).sort();
  return {
    ...older,
    ...newer,
    clients,
    projects: mergeList(newer.projects, older.projects, deleted),
    timeLogs: mergeList(newer.timeLogs, older.timeLogs, deleted),
    settings: newer.settings || older.settings,
    // A timer running on either computer is not dropped.
    activeTimer: newer.activeTimer || older.activeTimer || null,
    deleted,
    savedAt: times.length ? times[times.length - 1] : (newer.savedAt || null)
  };
}

module.exports = {
  DRIVE_SCOPE, grantsDrive, isInsufficientScope, pendingSignIn,
  syncAction, closePushAction, mergeData, newerSide
};
