// Suggestions from Google Calendar (desktop build, opt-in, off by default).
// Settings: a switch in the Google Drive section asks Google for read-only
// calendar access. Timer view: the "From calendar" card lists yesterday's and
// today's events that no entry covers yet, each ready to be recorded.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { fillSelect, localDayKey } from './utils.js';
import {
  uncoveredEvents, suggestionRange, pruneHidden, titleKey, rememberedClient
} from './calendar-suggestions.js';

// Events are fetched again when the cached list is older than this.
const REFRESH_MS = 5 * 60 * 1000;

let cache = { events: null, fetchedAt: 0 };
let loading = false;
// Client picked in a row but not recorded yet, kept across re-renders.
const picked = new Map();

function featureOn() {
  return Boolean(window.weCalendar) && store.getSettings().calendarSuggestions === true;
}

function locale() {
  return store.getSettings().language === 'ru' ? 'ru-RU' : 'en-US';
}

async function loadEvents() {
  if (loading) return;
  loading = true;
  try {
    const { from, to } = suggestionRange(new Date());
    const res = await window.weCalendar.events(from, to);
    // A failure (offline, no permission on this computer) hides the card
    // instead of showing stale suggestions.
    cache = { events: res && res.ok ? res.events : null, fetchedAt: Date.now() };
  } catch (e) {
    console.error('[Calendar] Failed to load events:', e);
    cache = { events: null, fetchedAt: Date.now() };
  } finally {
    loading = false;
  }
  renderCalendarSuggestions();
}

// Forget the fetched events, so the next render asks the calendar again.
function resetCache() {
  cache = { events: null, fetchedAt: 0 };
}

function recordEvent(ev, clientId) {
  if (!clientId) {
    showToast(t('toast-select-client'), { type: 'error' });
    return;
  }
  const settings = store.getSettings();
  store.updateSettings({
    calendarClientMap: { ...(settings.calendarClientMap || {}), [titleKey(ev.title)]: clientId }
  });
  const log = store.addTimeLog({
    description: ev.title,
    clientId,
    projectId: null,
    startTime: ev.startTime,
    endTime: ev.endTime,
    billable: true
  });
  picked.delete(ev.id);
  showToast(t('toast-log-added'), {
    type: 'success',
    actionLabel: t('toast-undo'),
    onAction: () => store.deleteTimeLogs([log.id])
  });
}

function hideEvent(ev) {
  const hidden = { ...(store.getSettings().calendarHidden || {}), [ev.id]: ev.endTime };
  picked.delete(ev.id);
  store.updateSettings({ calendarHidden: pruneHidden(hidden, new Date()) });
}

// Renders the card from the cached events; fetches them when needed.
export function renderCalendarSuggestions() {
  const card = document.getElementById('calendar-card');
  const list = document.getElementById('calendar-list');
  if (!card || !list) return;
  if (!featureOn()) {
    card.hidden = true;
    return;
  }
  if (Date.now() - cache.fetchedAt > REFRESH_MS) loadEvents();

  const settings = store.getSettings();
  const events = uncoveredEvents(cache.events || [], store.getTimeLogs(), settings.calendarHidden || {}, new Date());
  card.hidden = events.length === 0;
  if (events.length === 0) return;

  const clients = store.getClients();
  const fmt = (iso) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const todayKey = localDayKey(new Date());

  list.innerHTML = '';
  events.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'calendar-row';

    const time = document.createElement('div');
    time.className = 'calendar-time';
    const dayLabel = localDayKey(ev.startTime) === todayKey ? '' : `${t('calendar-yesterday')}, `;
    time.textContent = `${dayLabel}${fmt(ev.startTime)}-${fmt(ev.endTime)}`;

    const title = document.createElement('div');
    title.className = 'calendar-title' + (ev.title ? '' : ' empty');
    title.textContent = ev.title || t('no-description');
    title.title = ev.title || '';

    const select = document.createElement('select');
    select.className = 'calendar-client';
    const chosen = picked.has(ev.id) ? picked.get(ev.id) : rememberedClient(settings.calendarClientMap, ev.title, clients);
    fillSelect(select, clients, t('timer-client-placeholder'), chosen);
    select.addEventListener('change', () => picked.set(ev.id, select.value));

    const recordBtn = document.createElement('button');
    recordBtn.className = 'btn btn-primary btn-sm';
    recordBtn.textContent = t('calendar-record');
    recordBtn.addEventListener('click', () => recordEvent(ev, select.value));

    const hideBtn = document.createElement('button');
    hideBtn.className = 'btn-icon calendar-hide-btn';
    hideBtn.title = t('calendar-hide');
    hideBtn.setAttribute('aria-label', t('calendar-hide'));
    hideBtn.innerHTML = '<i data-lucide="eye-off"></i>';
    hideBtn.addEventListener('click', () => hideEvent(ev));

    row.append(time, title, select, recordBtn, hideBtn);
    list.appendChild(row);
  });
  if (window.lucide) window.lucide.createIcons();
}

// The switch in Settings, inside the Google Drive section.
export function initCalendarSettings() {
  const box = document.getElementById('calendar-settings-box');
  const toggle = document.getElementById('calendar-switch');
  const desc = document.getElementById('calendar-settings-desc');
  if (!box || !toggle || !desc || !window.weCalendar) return;

  let busy = false;
  let last = null;
  const render = (status) => {
    if (!status || busy) return;
    last = status;
    box.style.display = status.available ? 'flex' : 'none';
    const on = store.getSettings().calendarSuggestions === true;
    toggle.disabled = !status.loggedIn;
    toggle.checked = status.loggedIn && on && status.granted;
    if (!status.loggedIn) desc.textContent = t('calendar-settings-sign-in');
    else if (on && !status.granted) desc.textContent = t('calendar-settings-regrant');
    else desc.textContent = t('calendar-settings-desc');
  };
  const refresh = () => window.weCalendar.getStatus().then(render);

  refresh();
  // Texts follow a language change.
  store.subscribe(() => render(last));
  // Signing in or out of Google changes what the switch can do.
  if (window.weGDrive && window.weGDrive.onStatus) {
    window.weGDrive.onStatus(() => { resetCache(); refresh(); });
  }

  toggle.addEventListener('change', async () => {
    if (!toggle.checked) {
      store.updateSettings({ calendarSuggestions: false });
      refresh();
      return;
    }
    busy = true;
    toggle.disabled = true;
    desc.textContent = t('gdrive-waiting-browser');
    let res;
    try {
      res = await window.weCalendar.enable();
    } catch (e) {
      res = { ok: false, error: e.message };
    }
    busy = false;
    if (res.ok) {
      resetCache();
      store.updateSettings({ calendarSuggestions: true });
      showToast(t('calendar-enabled'), { type: 'success' });
    } else if (res.scopeDenied) {
      store.updateSettings({ calendarSuggestions: false });
      showToast(t('calendar-scope-denied'), { type: 'error', duration: 10000 });
    } else if (res.otherAccount) {
      showToast(t('calendar-other-account'), { type: 'error', duration: 10000 });
    } else if (res.error !== 'timeout') {
      showToast(t('calendar-enable-failed') + (res.error || ''), { type: 'error' });
    }
    refresh();
  });
}
