// Notices above the views, visible from every tab:
// - a new release is out, with a button that downloads and opens the installer;
// - Google Drive sync is available but nobody has signed in yet (a fresh
//   install sees this straight away, so sync is not buried in Settings).

import { t } from './i18n.js';
import { signInToGDrive } from './settings.js';
import {
  updateState, updateOffered, updateStatusText, updatesSupported,
  onUpdateChange, downloadUpdate, dismissUpdate
} from './updates.js';

const RELEASES_URL = 'https://github.com/JaffarSk24/WE-Time-Tracker/releases/latest';

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

function linkButton(label, url) {
  const link = document.createElement('a');
  link.className = 'btn btn-secondary btn-sm';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = label;
  return link;
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

function updateBanner() {
  if (!updatesSupported() || !updateOffered()) return null;
  const latest = updateState.last.latest;

  if (updateState.phase === 'downloading') {
    const el = banner('update', 'download-cloud', updateStatusText(), []);
    const track = document.createElement('div');
    track.className = 'app-banner-progress';
    const bar = document.createElement('div');
    bar.className = 'app-banner-progress-bar';
    bar.style.width = `${Math.round(updateState.progress * 100)}%`;
    track.appendChild(bar);
    el.appendChild(track);
    return el;
  }

  if (updateState.phase === 'opened') {
    return banner('update', 'check-circle', updateStatusText(), [
      button(t('update-later'), { onClick: dismissUpdate })
    ]);
  }

  return banner('update', 'download-cloud', `${t('update-banner')} v${latest}`, [
    button(t('update-download'), { variant: 'primary', icon: 'download', onClick: downloadUpdate }),
    linkButton(t('update-whats-new'), RELEASES_URL),
    button(t('update-later'), { onClick: dismissUpdate })
  ]);
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
