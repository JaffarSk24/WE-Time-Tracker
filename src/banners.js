// Notices above the views, visible from every tab:
// - a new release is out: download it, then restart into the new version;
// - Google Drive sync is available but nobody has signed in yet (a fresh
//   install sees this straight away, so sync is not buried in Settings).

import { t } from './i18n.js';
import { showToast } from './toast.js';
import { signInToGDrive } from './settings.js';
import {
  updateState, updateOffered, updateStatusText, updatesSupported,
  onUpdateChange, downloadUpdate, installUpdate, dismissUpdate
} from './updates.js';

// Per-machine UI flag, not user data: whether the sign-in notice was dismissed
// here. Real data always goes through window.weStorage (see store.js).
const GDRIVE_DISMISSED_KEY = 'we_gdrive_prompt_dismissed';

let host = null;
let gdriveStatus = null;
let gdriveBusy = false;
// Hiding the stopped-sync notice lasts until the next launch only: sync stays
// broken, and a notice that never comes back is a notice nobody acts on.
let syncNoticeHidden = false;

function dismissedGDrivePrompt() {
  try {
    return localStorage.getItem(GDRIVE_DISMISSED_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function rememberGDriveDismissed() {
  try {
    localStorage.setItem(GDRIVE_DISMISSED_KEY, '1');
  } catch (e) {
    // A blocked storage only means the notice comes back next launch.
  }
}

function button(label, { variant = 'secondary', icon = null, onClick = null, disabled = false }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-${variant} btn-sm`;
  btn.disabled = disabled;
  if (icon) {
    const i = document.createElement('i');
    i.setAttribute('data-lucide', icon);
    btn.appendChild(i);
  }
  btn.appendChild(document.createTextNode(label));
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

function banner(kind, iconName, text, actions) {
  const el = document.createElement('div');
  el.className = `app-banner app-banner-${kind}`;
  const body = document.createElement('div');
  body.className = 'app-banner-text';
  const i = document.createElement('i');
  i.setAttribute('data-lucide', iconName);
  body.appendChild(i);
  const span = document.createElement('span');
  span.textContent = text;
  body.appendChild(span);
  el.appendChild(body);
  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'app-banner-actions';
    actions.forEach(a => row.appendChild(a));
    el.appendChild(row);
  }
  return el;
}

async function onDownload() {
  const res = await downloadUpdate();
  if (!res.ok) showToast(t('update-download-failed'), { type: 'error' });
}

async function onInstall() {
  const res = await installUpdate();
  if (!res.ok) showToast(t('update-install-failed'), { type: 'error' });
}

function showReleaseNotes() {
  const r = updateState.last;
  const modal = document.getElementById('update-notes-modal');
  if (!r || !modal) return;
  document.getElementById('update-notes-title').textContent = t('update-notes-title', { version: r.latest });
  document.getElementById('update-notes-body').textContent = r.notes || t('update-no-notes');
  modal.classList.add('active');
}

// Same look and wording as the update banner of WE Budget: one line of text
// with a sparkles icon, a progress bar while downloading, and the buttons for
// the current step.
function updateBanner() {
  if (!updatesSupported() || !updateOffered()) return null;

  const el = document.createElement('div');
  el.className = 'update-banner';
  el.setAttribute('role', 'status');

  const text = document.createElement('div');
  text.className = 'update-banner-text';
  const i = document.createElement('i');
  i.setAttribute('data-lucide', 'sparkles');
  const span = document.createElement('span');
  span.textContent = updateStatusText();
  text.append(i, span);
  el.appendChild(text);

  const actions = [];
  switch (updateState.phase) {
    case 'downloading': {
      const track = document.createElement('div');
      track.className = 'update-progress';
      const bar = document.createElement('div');
      bar.className = 'update-progress-bar';
      bar.style.width = `${Math.round(updateState.progress * 100)}%`;
      track.appendChild(bar);
      el.appendChild(track);
      break;
    }
    case 'ready':
      actions.push(button(t('update-restart'), { variant: 'primary', icon: 'rotate-ccw', onClick: onInstall }));
      break;
    case 'installing':
    case 'manual':
      break;
    default:
      actions.push(
        button(t('update-now'), { variant: 'primary', icon: 'download', onClick: onDownload }),
        button(t('update-whats-new'), { onClick: showReleaseNotes }),
        button(t('update-later'), { onClick: dismissUpdate })
      );
  }
  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'update-banner-actions';
    actions.forEach(a => row.appendChild(a));
    el.appendChild(row);
  }
  return el;
}

// One sign-in button, used by both Google banners.
function signInButton() {
  return button(gdriveBusy ? t('gdrive-waiting-browser') : t('gdrive-login'), {
    variant: 'primary',
    icon: 'log-in',
    disabled: gdriveBusy,
    onClick: async () => {
      gdriveBusy = true;
      render();
      try {
        await signInToGDrive();
      } finally {
        gdriveBusy = false;
        render();
      }
    }
  });
}

// Sync was working and Google stopped accepting the stored sign-in. Without
// this the app simply stops syncing and still looks healthy.
function syncStoppedBanner() {
  if (!window.weGDrive || !gdriveStatus) return null;
  const pending = gdriveStatus.signInNeeded;
  if (!pending || gdriveStatus.loggedIn || syncNoticeHidden) return null;

  const text = pending.reason === 'drive_scope' ? t('sync-banner-scope') : t('sync-banner-expired');
  return banner('sync', 'cloud-off', text, [
    signInButton(),
    button(t('sync-banner-later'), {
      onClick: () => {
        syncNoticeHidden = true;
        render();
      }
    })
  ]);
}

// Nobody has ever connected an account on this computer.
function gdriveBanner() {
  if (!window.weGDrive || !gdriveStatus) return null;
  if (!gdriveStatus.configured || gdriveStatus.loggedIn) return null;
  // A broken sign-in has its own, more urgent notice.
  if (gdriveStatus.signInNeeded) return null;
  // Signing out is a decision, not something to talk the user out of.
  if (gdriveStatus.usedSync) return null;
  if (dismissedGDrivePrompt()) return null;

  return banner('gdrive', 'cloud', t('gdrive-prompt'), [
    signInButton(),
    button(t('gdrive-prompt-dismiss'), {
      onClick: () => {
        rememberGDriveDismissed();
        render();
      }
    })
  ]);
}

function render() {
  if (!host) return;
  host.textContent = '';
  const banners = [syncStoppedBanner(), updateBanner(), gdriveBanner()].filter(Boolean);
  banners.forEach(el => host.appendChild(el));
  host.hidden = banners.length === 0;
  if (window.lucide) window.lucide.createIcons();
}

export function initBanners() {
  host = document.getElementById('app-banners');
  if (!host) return;
  host.hidden = true;

  onUpdateChange(render);

  const notes = document.getElementById('update-notes-modal');
  const closeNotes = () => notes.classList.remove('active');
  document.getElementById('update-notes-modal-close')?.addEventListener('click', closeNotes);
  document.getElementById('update-notes-close')?.addEventListener('click', closeNotes);

  if (window.weGDrive) {
    window.weGDrive.getStatus().then(status => {
      gdriveStatus = status;
      render();
    });
    window.weGDrive.onStatus(status => {
      gdriveStatus = status;
      render();
    });
  }
  // Keep the wording in step with a language change.
  render();
}

// The banners carry translated text built in JS, so they are redrawn whenever
// the app re-renders after a settings change.
export function refreshBanners() {
  render();
}
