// Update checking, shared by the banner above the views and the Settings
// section. Both render from one state object, so a download started in one
// place is reflected in the other instead of each keeping its own copy.

import { t } from './i18n.js';

const bridge = typeof window !== 'undefined' ? window.weUpdates || null : null;

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
// Long enough for the first render to finish before a network call starts.
const FIRST_CHECK_DELAY_MS = 4000;

// phase: 'idle' | 'checking' | 'downloading' | 'opened'
export const updateState = {
  phase: 'idle',
  progress: 0,
  last: null,
  // Windows installs the update as the app closes, so the wording differs.
  installsOnQuit: false,
  // Version the user chose to skip; the banner stays hidden until a newer one.
  dismissed: null
};

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
  if (!bridge || updateState.phase === 'checking' || updateState.phase === 'downloading') {
    return updateState.last;
  }
  updateState.phase = 'checking';
  notify();
  const result = await bridge.check();
  updateState.last = result;
  updateState.phase = 'idle';
  notify();
  return result;
}

export async function downloadUpdate() {
  const r = updateState.last;
  if (!bridge || !r || !r.downloadUrl) return { ok: false, error: 'nothing to download' };
  updateState.phase = 'downloading';
  updateState.progress = 0;
  notify();
  const result = await bridge.download(r.downloadUrl);
  updateState.installsOnQuit = Boolean(result.installsOnQuit);
  // The main process takes it from here: on macOS it opens the disk image, on
  // Windows it runs the setup once the app closes.
  updateState.phase = result.ok ? 'opened' : 'idle';
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
      return `${t('update-downloading')} ${Math.round(updateState.progress * 100)}%`;
    case 'opened':
      return updateState.installsOnQuit ? t('update-quit-hint') : t('update-open-hint');
    default:
      if (!r) return '';
      if (!r.ok) return t('update-error');
      if (r.available) return `${t('update-available')}: v${r.latest}`;
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
