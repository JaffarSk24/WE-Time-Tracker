// When the phone web app syncs, and what it shows about it. The rules are
// the desktop's: opening and returning to the app only take data from the
// cloud; uploads happen from the Sync button, when the page is hidden and
// after the timer is stopped, always after checking the cloud (see sync.js).
// An upload that could not run (offline, Google access expired) is
// remembered and done when the connection or the access is back.

import { createSyncEngine } from './sync.js';
import { drive, isNetworkError } from './drive.js';
import { sha256Hex } from './hash.js';
import { WEB_CLIENT_ID } from './config.js';
import { validToken, silentRenew, isSignedIn } from './auth.js';

export const DATA_KEY = 'we_time_tracker_data';  // the store's own key
const STATE_KEY = 'we_tt_web_sync_state';
const PENDING_KEY = 'we_tt_web_pending_upload';
const BACKUP_KEY = 'we_tt_web_backup';

// What a trigger does: 'pull' (sync with pullOnly), 'push' (upload unless
// unchanged, merging first when the cloud moved on) or 'sync' (the Sync
// button: whatever the comparison says, uploads included).
export function triggerPlan(kind, { pending = false } = {}) {
  switch (kind) {
    case 'button': return 'sync';
    case 'hide':
    case 'stop': return 'push';
    case 'online':
    case 'renewed': return pending ? 'sync' : 'pull';
    default: return 'pull'; // open, return
  }
}

// The status line from the sync record and the last outcome.
export function statusView({ signedIn, phase, lastSync }) {
  if (!signedIn) return { key: null };
  if (phase === 'syncing') return { key: 'web-syncing' };
  if (phase === 'renew') return { key: 'web-renew-needed', renew: true };
  if (phase === 'offline') return { key: 'web-offline' };
  if (!lastSync) return { key: 'web-never-synced' };
  return { key: 'web-synced-at', time: lastSync };
}

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full */ }
}

export function createCloud({ onLocalReplaced, onStatus }) {
  const engine = createSyncEngine({
    drive,
    clientId: WEB_CLIENT_ID,
    hash: sha256Hex,
    local: {
      read: () => localStorage.getItem(DATA_KEY),
      write: (text) => {
        localStorage.setItem(DATA_KEY, text);
        onLocalReplaced();
      }
    },
    state: {
      get: () => readJson(STATE_KEY) || {},
      set: (s) => writeJson(STATE_KEY, s)
    },
    // One copy of the data as it was before the last download or merge.
    backup: (tag, text) => {
      try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify({ tag, at: new Date().toISOString(), text }));
      } catch (e) { /* no room for a backup: the merge itself keeps everything */ }
    }
  });

  let phase = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'idle';

  const pending = () => localStorage.getItem(PENDING_KEY) === '1';
  const setPending = (on) => {
    try {
      if (on) localStorage.setItem(PENDING_KEY, '1');
      else localStorage.removeItem(PENDING_KEY);
    } catch (e) { /* storage blocked */ }
  };

  function status() {
    const s = readJson(STATE_KEY) || {};
    return statusView({ signedIn: isSignedIn(), phase, lastSync: s.lastSync || null });
  }

  function setPhase(next) {
    phase = next;
    onStatus(status());
  }

  async function runPlan(plan) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (plan === 'push') return await engine.push();
        if (plan === 'sync') return await engine.sync();
        return await engine.sync({ pullOnly: true });
      } catch (e) {
        // Something was typed while the cloud was read: simply run again.
        if (e.localChanged && attempt === 0) continue;
        throw e;
      }
    }
    return { ok: false, error: 'local_changed' };
  }

  // Runs a trigger. Resolves to the engine's result, or { ok: false, ... }.
  async function run(kind) {
    if (!isSignedIn()) return { ok: false, error: 'not_signed_in' };
    const plan = triggerPlan(kind, { pending: pending() });
    if (plan !== 'pull') setPending(true);
    if (!validToken()) {
      // A page being hidden has no time for a renewal.
      const renewed = kind === 'hide' ? false : await silentRenew();
      if (!renewed) {
        setPhase('renew');
        return { ok: false, renew: true };
      }
    }
    if (engine.busy) return { ok: false, error: 'busy' };
    setPhase('syncing');
    try {
      const res = await runPlan(plan);
      // A finished upload (or one found unnecessary) settles what was waiting.
      if (res.ok && plan !== 'pull') setPending(false);
      setPhase(res.ok || res.error === 'busy' ? 'idle' : 'error');
      return res;
    } catch (e) {
      if (e.renew || e.scopeDenied) {
        setPhase('renew');
        return { ok: false, renew: true, scopeDenied: Boolean(e.scopeDenied) };
      }
      if (isNetworkError(e)) {
        setPhase('offline');
        return { ok: false, offline: true };
      }
      setPhase('error');
      return { ok: false, error: e.message || String(e), scopeDenied: Boolean(e.scopeDenied) };
    }
  }

  return {
    run,
    status,
    hasPending: pending,
    setOffline: () => setPhase('offline'),
    forget: () => {
      engine.forget();
      setPending(false);
      setPhase('idle');
    }
  };
}
