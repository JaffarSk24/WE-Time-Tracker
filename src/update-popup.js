// The large window about a new version, as in WE Invoice. When the check at
// start (or a later one) finds a newer release, this window opens over the
// app once per version and run: the new and the current version, what is new
// (the release notes from GitHub) and one large "Update now" button. It then
// follows the same steps as the banner (banners.js): the download progress,
// "Restart and update". "Later" closes the window until the next start; the
// banner above the views stays as a reminder.

import { t } from './i18n.js';
import { store } from './store.js';
import { showToast } from './toast.js';
import {
  updateState, updateOffered, updatesSupported,
  onUpdateChange, downloadUpdate, installUpdate
} from './updates.js';

// Release notes may carry a section per language, headed by its own name
// ("## English", "## Русский"); without sections they are shown whole.
const NOTES_LANGUAGES = { English: 'en', Русский: 'ru' };
// What follows these headings is for a fresh install, not for the update.
const SKIPPED_SECTION = /^(install|installation|download|downloads)$/i;

export function notesFor(markdown, lang) {
  const sections = {};
  let current = null;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading && NOTES_LANGUAGES[heading[1]]) {
      current = NOTES_LANGUAGES[heading[1]];
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }
  const chosen = sections[lang] || sections.en;
  return chosen ? chosen.join('\n').trim() : String(markdown || '');
}

// Links, bold and code marks are dropped: the notes are drawn as plain text.
function inlineText(line) {
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

// Release notes (short Markdown) as blocks: { type: 'heading' | 'list' | 'text' }.
// A line that is bold as a whole ("**Timer**") is a heading too, as in the
// notes of 2.0.0. Reading stops at an "Install" section.
export function parseNotes(markdown) {
  const blocks = [];
  let list = null;
  for (const raw of String(markdown || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    const top = /^#{1,2}\s+(.*)$/.exec(line);
    if (top) {
      if (SKIPPED_SECTION.test(top[1].trim())) break;
      list = null;
      continue;
    }
    const heading = /^#{3,6}\s+(.*)$/.exec(line) || /^\*\*([^*]+)\*\*:?$/.exec(line.trim());
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (heading) {
      list = null;
      blocks.push({ type: 'heading', text: inlineText(heading[1]) });
    } else if (item) {
      if (!list) {
        list = { type: 'list', items: [] };
        blocks.push(list);
      }
      list.items.push(inlineText(item[1]));
    } else if (line.trim()) {
      list = null;
      blocks.push({ type: 'text', text: inlineText(line) });
    } else {
      list = null;
    }
  }
  return blocks;
}

// Opens once per version and run, only while the update is still on offer.
export function shouldOpenPopup(state, offered, shownFor) {
  const latest = state.last && state.last.latest;
  return Boolean(offered && latest && state.phase === 'idle' && !shownFor.has(latest));
}

let overlay = null;
let body = null;
const shownFor = new Set();

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

function iconEl(name) {
  const i = document.createElement('i');
  i.setAttribute('data-lucide', name);
  return i;
}

function button(label, { variant, icon = null, onClick }) {
  const btn = el('button', `btn ${variant}`);
  btn.type = 'button';
  if (icon) btn.appendChild(iconEl(icon));
  btn.appendChild(document.createTextNode(label));
  btn.addEventListener('click', onClick);
  return btn;
}

function notesView(markdown) {
  const box = el('div', 'update-popup-notes');
  const blocks = parseNotes(markdown);
  if (blocks.length === 0) {
    box.appendChild(el('p', 'update-popup-muted', t('update-no-notes')));
    return box;
  }
  blocks.forEach(block => {
    if (block.type === 'heading') {
      box.appendChild(el('h4', '', block.text));
    } else if (block.type === 'list') {
      const ul = el('ul');
      block.items.forEach(item => ul.appendChild(el('li', '', item)));
      box.appendChild(ul);
    } else {
      box.appendChild(el('p', '', block.text));
    }
  });
  return box;
}

function isOpen() {
  return Boolean(overlay && overlay.classList.contains('active'));
}

function close() {
  if (overlay) overlay.classList.remove('active');
}

async function onDownload() {
  const res = await downloadUpdate();
  if (!res.ok) showToast(t('update-download-failed'), { type: 'error' });
}

async function onInstall() {
  const res = await installUpdate();
  if (!res.ok) showToast(t('update-install-failed'), { type: 'error' });
}

function render() {
  const r = updateState.last;
  if (!body || !r) return;
  const lang = store.getSettings().language === 'ru' ? 'ru' : 'en';
  document.getElementById('update-popup-title').textContent = t('update-popup-title');
  body.textContent = '';

  const hero = el('div', 'update-popup-hero');
  hero.appendChild(iconEl('sparkles'));
  const heroText = el('div');
  heroText.appendChild(el('p', 'update-popup-lead', t('update-popup-lead', { version: r.latest, current: r.current || '' })));
  heroText.appendChild(el('p', 'update-popup-muted', t('update-popup-safe')));
  hero.appendChild(heroText);
  body.appendChild(hero);

  body.appendChild(el('h3', 'update-popup-subtitle', t('update-whats-new')));
  body.appendChild(notesView(notesFor(r.notes, lang)));

  const actions = el('div', 'update-popup-actions');
  switch (updateState.phase) {
    case 'downloading': {
      const percent = Math.round((updateState.progress || 0) * 100);
      const progress = el('div', 'update-popup-progress');
      progress.appendChild(el('span', '', t('update-banner-downloading', { percent })));
      const track = el('div', 'update-progress');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(percent));
      const bar = el('div', 'update-progress-bar');
      bar.style.width = `${percent}%`;
      track.appendChild(bar);
      progress.appendChild(track);
      actions.appendChild(progress);
      break;
    }
    case 'ready':
      actions.appendChild(el('p', '', t('update-ready', { version: updateState.readyVersion || r.latest })));
      actions.appendChild(button(t('update-restart'), { variant: 'btn-primary btn-lg', icon: 'rotate-ccw', onClick: onInstall }));
      break;
    case 'installing':
      actions.appendChild(el('p', '', t('update-installing')));
      break;
    case 'manual':
      actions.appendChild(el('p', '', t('update-manual', { version: r.latest })));
      actions.appendChild(button(t('close'), { variant: 'btn-secondary', onClick: close }));
      break;
    default:
      actions.appendChild(button(t('update-popup-now'), { variant: 'btn-primary btn-lg', icon: 'download', onClick: onDownload }));
      actions.appendChild(button(t('update-later'), { variant: 'btn-secondary btn-lg', onClick: close }));
  }
  body.appendChild(actions);
  if (window.lucide) window.lucide.createIcons();
}

function onChange() {
  if (isOpen()) {
    render();
    return;
  }
  if (!shouldOpenPopup(updateState, updateOffered(), shownFor)) return;
  shownFor.add(updateState.last.latest);
  render();
  overlay.classList.add('active');
}

export function initUpdatePopup() {
  overlay = document.getElementById('update-popup-modal');
  body = document.getElementById('update-popup-body');
  if (!overlay || !body || !updatesSupported()) return;
  document.getElementById('update-popup-close')?.addEventListener('click', close);
  onUpdateChange(onChange);
}

// The window carries text built in JS: redrawn after a language change.
export function refreshUpdatePopup() {
  if (isOpen()) render();
}
