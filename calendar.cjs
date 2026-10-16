// Suggestions from Google Calendar: reads events of the primary calendar so
// the Timer view can offer them as entries. Opt-in: the calendar permission
// (calendar.readonly) is asked for only when the user switches the feature
// on, through the Google sign-in of gdrive-sync.cjs, which keeps Drive access.
// The Drive module is passed to init(), so this file loads without Electron
// and its helpers can be tested.

const https = require('https');

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const MIN_EVENT_MS = 5 * 60 * 1000;
const MAX_PAGES = 5;

// The events worth suggesting: timed (not all-day), not cancelled, not
// declined by the user, and at least five minutes long. Returns
// { id, title, startTime, endTime } with ISO times.
function filterEvents(items) {
  const out = [];
  (items || []).forEach(ev => {
    if (!ev || ev.status === 'cancelled') return;
    if (!ev.start || !ev.end || !ev.start.dateTime || !ev.end.dateTime) return;
    const declined = (ev.attendees || []).some(a => a && a.self && a.responseStatus === 'declined');
    if (declined) return;
    const start = new Date(ev.start.dateTime);
    const end = new Date(ev.end.dateTime);
    if (isNaN(start) || isNaN(end) || end - start < MIN_EVENT_MS) return;
    out.push({
      id: String(ev.id || `${start.toISOString()}|${ev.summary || ''}`),
      title: String(ev.summary || '').trim(),
      startTime: start.toISOString(),
      endTime: end.toISOString()
    });
  });
  return out;
}

function validIso(value) {
  return typeof value === 'string' && !isNaN(new Date(value));
}

class CalendarSuggestions {
  constructor() {
    this.gdrive = null;
  }

  init(gdrive) {
    this.gdrive = gdrive;
  }

  getStatus() {
    const g = this.gdrive;
    return {
      available: Boolean(g && g.isConfigured()),
      loggedIn: Boolean(g && g.isLoggedIn()),
      granted: Boolean(g && g.isLoggedIn() && g.hasScope(CALENDAR_SCOPE))
    };
  }

  // Asks Google for the calendar permission (unless it is already there).
  // An unticked permission leaves Drive sync working and reports
  // scopeDenied, so the switch stays off.
  async enable(win) {
    const status = this.getStatus();
    if (!status.available) return { ok: false, error: 'not_configured' };
    if (!status.loggedIn) return { ok: false, error: 'not_logged_in' };
    if (status.granted) return { ok: true, status };
    const res = await this.gdrive.login(win, { extraScopes: [CALENDAR_SCOPE] });
    if (!res.ok) return res;
    if (!this.gdrive.hasScope(CALENDAR_SCOPE)) {
      return { ok: false, error: 'calendar_scope', scopeDenied: true, status: this.getStatus() };
    }
    return { ok: true, status: this.getStatus() };
  }

  request(url, token) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            return;
          }
          const err = new Error(`calendar ${res.statusCode}: ${data.slice(0, 200)}`);
          err.status = res.statusCode;
          reject(err);
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    });
  }

  // Events of the primary calendar between from and to (ISO strings),
  // recurring events expanded, in start order.
  async listEvents(from, to) {
    if (!validIso(from) || !validIso(to)) return { ok: false, error: 'bad_range' };
    const status = this.getStatus();
    if (!status.loggedIn) return { ok: false, error: 'not_logged_in' };
    if (!status.granted) return { ok: false, error: 'calendar_scope' };
    try {
      const token = await this.gdrive.getAccessToken();
      const items = [];
      let pageToken = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({
          timeMin: new Date(from).toISOString(),
          timeMax: new Date(to).toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
          fields: 'items(id,status,summary,start,end,attendees(self,responseStatus)),nextPageToken'
        });
        if (pageToken) params.set('pageToken', pageToken);
        const body = await this.request(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, token
        );
        items.push(...(body.items || []));
        pageToken = body.nextPageToken;
        if (!pageToken) break;
      }
      return { ok: true, events: filterEvents(items) };
    } catch (e) {
      console.error('[Calendar] Listing events failed:', e.message);
      // 401/403: the permission was taken away in the Google account.
      const scopeLost = e.status === 403 || e.status === 401;
      return { ok: false, error: scopeLost ? 'calendar_scope' : e.message, reauth: Boolean(e.reauth) };
    }
  }
}

const calendar = new CalendarSuggestions();
calendar.CALENDAR_SCOPE = CALENDAR_SCOPE;
calendar.filterEvents = filterEvents;
module.exports = calendar;
