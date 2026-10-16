import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const calendar = require('../calendar.cjs');
const { DRIVE_SCOPE, grantsDrive } = require('../gdrive-utils.cjs');
const { CALENDAR_SCOPE, filterEvents } = calendar;

const timed = (id, start, end, extra = {}) => ({
  id, status: 'confirmed', summary: `Event ${id}`,
  start: { dateTime: start }, end: { dateTime: end }, ...extra
});

describe('filterEvents', () => {
  it('keeps timed events with ISO times and titles', () => {
    const out = filterEvents([timed('a', '2026-10-16T09:00:00+02:00', '2026-10-16T10:00:00+02:00')]);
    expect(out).toEqual([{ id: 'a', title: 'Event a', startTime: '2026-10-16T07:00:00.000Z', endTime: '2026-10-16T08:00:00.000Z' }]);
  });

  it('skips all-day, cancelled, declined and short events', () => {
    const out = filterEvents([
      { id: 'allday', start: { date: '2026-10-16' }, end: { date: '2026-10-17' } },
      timed('cancelled', '2026-10-16T09:00:00Z', '2026-10-16T10:00:00Z', { status: 'cancelled' }),
      timed('declined', '2026-10-16T09:00:00Z', '2026-10-16T10:00:00Z', {
        attendees: [{ email: 'x@y', responseStatus: 'accepted' }, { self: true, responseStatus: 'declined' }]
      }),
      timed('short', '2026-10-16T09:00:00Z', '2026-10-16T09:04:59Z'),
      timed('five', '2026-10-16T09:00:00Z', '2026-10-16T09:05:00Z'),
      timed('accepted', '2026-10-16T11:00:00Z', '2026-10-16T12:00:00Z', {
        attendees: [{ self: true, responseStatus: 'accepted' }, { email: 'o@x', responseStatus: 'declined' }]
      })
    ]);
    expect(out.map(e => e.id)).toEqual(['five', 'accepted']);
  });

  it('copes with missing titles and bad input', () => {
    expect(filterEvents(null)).toEqual([]);
    const out = filterEvents([{ id: 'n', start: { dateTime: '2026-10-16T09:00:00Z' }, end: { dateTime: '2026-10-16T10:00:00Z' } }]);
    expect(out[0].title).toBe('');
  });
});

// A stand-in for gdrive-sync.cjs with the parts calendar.cjs uses.
function fakeDrive({ loggedIn = true, scope = DRIVE_SCOPE, grantOnLogin = null } = {}) {
  return {
    tokens: loggedIn ? { refresh_token: 'r', scope } : null,
    logins: [],
    isConfigured: () => true,
    isLoggedIn() { return Boolean(this.tokens); },
    hasScope(s) { return Boolean(this.tokens && this.tokens.scope && this.tokens.scope.split(' ').includes(s)); },
    async login(_win, opts) {
      this.logins.push(opts);
      if (grantOnLogin === null) return { ok: false, error: 'timeout' };
      this.tokens = { refresh_token: 'r2', scope: grantOnLogin };
      return { ok: true, scope: grantOnLogin };
    },
    getAccessToken: async () => 'a'
  };
}

describe('enabling calendar suggestions', () => {
  beforeEach(() => calendar.init(null));

  it('asks for the calendar scope on top of the existing sign-in', async () => {
    const drive = fakeDrive({ grantOnLogin: `${DRIVE_SCOPE} ${CALENDAR_SCOPE}` });
    calendar.init(drive);
    const res = await calendar.enable(null);
    expect(res.ok).toBe(true);
    expect(drive.logins).toEqual([{ extraScopes: [CALENDAR_SCOPE] }]);
    expect(res.status.granted).toBe(true);
    // The new token still serves Drive sync.
    expect(grantsDrive(drive.tokens.scope)).toBe(true);
  });

  it('reports an unticked calendar permission and keeps Drive', async () => {
    const drive = fakeDrive({ grantOnLogin: DRIVE_SCOPE });
    calendar.init(drive);
    const res = await calendar.enable(null);
    expect(res).toMatchObject({ ok: false, scopeDenied: true });
    expect(drive.isLoggedIn()).toBe(true);
    expect(grantsDrive(drive.tokens.scope)).toBe(true);
  });

  it('does not sign in again when the permission is already there', async () => {
    const drive = fakeDrive({ scope: `${DRIVE_SCOPE} ${CALENDAR_SCOPE}` });
    calendar.init(drive);
    expect((await calendar.enable(null)).ok).toBe(true);
    expect(drive.logins).toEqual([]);
  });

  it('needs a Google sign-in first', async () => {
    calendar.init(fakeDrive({ loggedIn: false }));
    expect(await calendar.enable(null)).toEqual({ ok: false, error: 'not_logged_in' });
  });

  it('passes a failed sign-in through', async () => {
    calendar.init(fakeDrive());
    expect(await calendar.enable(null)).toMatchObject({ ok: false, error: 'timeout' });
  });
});

describe('listing events', () => {
  it('refuses without the permission or with a bad range', async () => {
    calendar.init(fakeDrive());
    expect(await calendar.listEvents('2026-10-15T00:00:00Z', '2026-10-16T00:00:00Z')).toEqual({ ok: false, error: 'calendar_scope' });
    expect(await calendar.listEvents('nope', '2026-10-16T00:00:00Z')).toEqual({ ok: false, error: 'bad_range' });
  });

  it('pages through the primary calendar and filters the events', async () => {
    calendar.init(fakeDrive({ scope: `${DRIVE_SCOPE} ${CALENDAR_SCOPE}` }));
    const urls = [];
    const pages = [
      { items: [timed('a', '2026-10-15T09:00:00Z', '2026-10-15T10:00:00Z')], nextPageToken: 'p2' },
      { items: [{ id: 'b', start: { date: '2026-10-15' }, end: { date: '2026-10-16' } }] }
    ];
    calendar.request = async (url) => { urls.push(new URL(url)); return pages[urls.length - 1]; };
    const res = await calendar.listEvents('2026-10-15T00:00:00Z', '2026-10-16T00:00:00Z');
    expect(res.ok).toBe(true);
    expect(res.events.map(e => e.id)).toEqual(['a']);
    expect(urls[0].pathname).toBe('/calendar/v3/calendars/primary/events');
    expect(urls[0].searchParams.get('singleEvents')).toBe('true');
    expect(urls[0].searchParams.get('orderBy')).toBe('startTime');
    expect(urls[1].searchParams.get('pageToken')).toBe('p2');
  });

  it('reports a permission taken away in the Google account', async () => {
    calendar.init(fakeDrive({ scope: `${DRIVE_SCOPE} ${CALENDAR_SCOPE}` }));
    calendar.request = async () => { const e = new Error('calendar 403'); e.status = 403; throw e; };
    const res = await calendar.listEvents('2026-10-15T00:00:00Z', '2026-10-16T00:00:00Z');
    expect(res).toMatchObject({ ok: false, error: 'calendar_scope' });
  });
});

describe('gdrive-sync hasScope', () => {
  it('reads the granted permissions of the stored sign-in', () => {
    delete require.cache[require.resolve('../gdrive-sync.cjs')];
    const sync = require('../gdrive-sync.cjs');
    sync.tokens = { refresh_token: 'r', scope: `${DRIVE_SCOPE} ${CALENDAR_SCOPE}` };
    expect(sync.hasScope(CALENDAR_SCOPE)).toBe(true);
    sync.tokens = { refresh_token: 'r', scope: DRIVE_SCOPE };
    expect(sync.hasScope(CALENDAR_SCOPE)).toBe(false);
    // Sign-ins from before the app kept the list.
    sync.tokens = { refresh_token: 'r' };
    expect(sync.hasScope(CALENDAR_SCOPE)).toBe(false);
  });
});
