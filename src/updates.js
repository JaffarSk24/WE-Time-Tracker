// Update checking, shared by the banner above the views and the Settings
// section. Both render from one state object, so a download started in one
// place is reflected in the other instead of each keeping its own copy.

import { t } from './i18n.js';

const bridge = typeof window !== 'undefined' ? window.weUpdates || null : null;

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
// Long enough for the first render to finish before a network call starts.
const FIRST_CHECK_DELAY_MS = 4000;

// phase: 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'manual'
//   ready      downloaded and verified, waiting for "Install and restart";
//   installing the app is about to quit, the new version starts by itself;
//   manual     the app's folder is not writable, the disk image was opened.
export const updateState = {
  phase: 'idle',
  progress: 0,
  last: null,
  // Version the user chose to skip; the banner stays hidden until a newer one.
  dismissed: null,
  // Version waiting in the 'ready' phase.
  readyVersion: null
};

// While these run, a periodic check would only get in the way.
const BUSY_PHASES = ['checking', 'downloading', 'installing'];

const listeners = [];

function notify() {
  listeners.forEach(fn => fn(updateState));
}

export function onUpdateChange(fn) {
  listeners.push(fn);
}

export function updatesSupported() {
  return Boolean(bridge);
}

// True when there is a newer release the user has not dismissed.
export function updateOffered() {
  const r = updateState.last;
  return Boolean(r && r.ok && r.available && updateState.dismissed !== r.latest);
}

export function dismissUpdate() {
  if (updateState.last) updateState.dismissed = updateState.last.latest;
  notify();
}

export async function checkForUpdates() {
  if (!bridge || BUSY_PHASES.includes(updateState.phase)) {
    return updateState.last;
  }
  // A downloaded update keeps its banner, unless a newer release came out
  // meanwhile: then that one is offered instead.
  const wasReady = updateState.phase === 'ready';
  if (!wasReady) {
    updateState.phase = 'checking';
    notify();
  }
  const result = await bridge.check();
  if (wasReady) {
    if (result.ok && result.available && result.latest !== updateState.readyVersion) {
      updateState.last = result;
      updateState.phase = 'idle';
      updateState.readyVersion = null;
      notify();
    }
    return result;
  }
  updateState.last = result;
  updateState.phase = 'idle';
  notify();
  return result;
}

export async function downloadUpdate() {
  const r = updateState.last;
  if (!bridge || !r || !r.available) return { ok: false, error: 'nothing to download' };
  updateState.phase = 'downloading';
  updateState.progress = 0;
  notify();
  const result = await bridge.download();
  if (!result.ok) {
    updateState.phase = 'idle';
    notify();
    return result;
  }
  // The download takes the newest release, which may be newer than the one
  // the banner showed.
  if (result.release) updateState.last = result.release;
  if (result.inPlace) {
    updateState.readyVersion = result.version || r.latest;
    updateState.phase = 'ready';
    notify();
    return result;
  }
  // Nowhere to install in place: open the disk image straight away.
  return installUpdate();
}

export async function installUpdate() {
  if (!bridge) return { ok: false, error: 'no bridge' };
  const before = updateState.phase;
  updateState.phase = 'installing';
  notify();
  const result = await bridge.install();
  if (!result.ok) {
    updateState.phase = before === 'ready' ? 'ready' : 'idle';
  } else if (result.manual) {
    updateState.phase = 'manual';
  }
  // Otherwise the app quits in a moment and the new version starts.
  notify();
  return result;
}

// Text for the current phase, shared by the banner and the Settings section.
export function updateStatusText() {
  const r = updateState.last;
  switch (updateState.phase) {
    case 'checking':
      return t('update-checking');
    case 'downloading':
      return t('update-banner-downloading', { percent: Math.round(updateState.progress * 100) });
    case 'ready':
      return t('update-ready', { version: r.latest });
    case 'installing':
      return t('update-installing');
    case 'manual':
      return t('update-manual', { version: r.latest });
    default:
      if (!r) return '';
      if (!r.ok) return t('update-error');
      if (r.available) return t('update-banner-available', { version: r.latest, current: r.current });
      return t('update-current');
  }
}

export function initUpdates() {
  if (!bridge) return;
  bridge.onProgress((p) => {
    updateState.progress = p;
    notify();
  });
  setTimeout(() => checkForUpdates(), FIRST_CHECK_DELAY_MS);
  setInterval(() => checkForUpdates(), CHECK_EVERY_MS);
}
