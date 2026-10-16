import { describe, it, expect } from 'vitest';
import { weekStart, weekDays, shiftWeek, summarizeWeek, formatMoney, timerElapsedMs, entryError, logAmount } from '../src/web/week.js';
import { authUrl, parseAuthHash, interpretAnswer, redirectUri, tokenUsable, SCOPES } from '../src/web/auth.js';
import { triggerPlan, statusView } from '../src/web/cloud.js';
import { isClientConfigured, CLIENT_ID_PLACEHOLDER } from '../src/web/config.js';
import { addWebTranslations, webTranslations } from '../src/web/i18n-web.js';
import { cjsToEsm, serviceWorkerSource } from '../scripts/vite-web-plugins.js';
import { localDayKey } from '../src/utils.js';

const at = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe('week', () => {
  it('starts on Monday at local midnight', () => {
    const monday = weekStart(new Date(2026, 9, 18, 23, 30)); // Sunday
    expect(localDayKey(monday)).toBe('2026-10-12');
    expect(monday.getHours()).toBe(0);
    expect(localDayKey(weekStart(new Date(2026, 9, 12, 0, 1)))).toBe('2026-10-12');
    expect(weekDays(monday).map(localDayKey)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(localDayKey(shiftWeek(monday, -1))).toBe('2026-10-05');
  });

  it('keeps calendar days across the change from summer time', () => {
    const days = weekDays(weekStart(new Date(2026, 9, 26)));
    expect(days.map(localDayKey)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('sums hours and money per local day, to the minute', () => {
    const logs = [
      { id: 'a', startTime: at(2026, 10, 12, 9), endTime: at(2026, 10, 12, 10, 52), billable: true, rateAtTime: 60 },
      // Paused: the stored worked time counts, not the span.
      { id: 'b', startTime: at(2026, 10, 14, 9), endTime: at(2026, 10, 14, 12), durationMs: 30 * 60000, billable: true, rateAtTime: 100 },
      { id: 'c', startTime: at(2026, 10, 14, 13), endTime: at(2026, 10, 14, 14), billable: false, rateAtTime: 100 },
      { id: 'out', startTime: at(2026, 10, 19, 9), endTime: at(2026, 10, 19, 10), billable: true, rateAtTime: 60 }
    ];
    const s = summarizeWeek(logs, weekStart(new Date(2026, 9, 14)));
    expect(s.days[0].ms).toBe(112 * 60000);
    expect(s.days[0].amount).toBeCloseTo(112);
    expect(s.days[2].logs.map(l => l.id)).toEqual(['c', 'b']);
    expect(s.days[2].amount).toBeCloseTo(50);
    expect(s.totalMs).toBe((112 + 30 + 60) * 60000);
    expect(s.billableMs).toBe((112 + 30) * 60000);
    expect(s.amount).toBeCloseTo(162);
  });

  it('bills a started entry at least one minute and nothing when not billable', () => {
    expect(logAmount({ startTime: at(2026, 10, 12, 9), endTime: new Date(Date.parse(at(2026, 10, 12, 9)) + 10000).toISOString(), billable: true, rateAtTime: 60 })).toBeCloseTo(1);
    expect(logAmount({ startTime: at(2026, 10, 12, 9), endTime: at(2026, 10, 12, 10), billable: false, rateAtTime: 60 })).toBe(0);
    expect(formatMoney(12.5)).toBe('12.50 €');
  });

  it('measures a running timer with its pauses', () => {
    const now = Date.parse('2026-10-12T10:00:00Z');
    expect(timerElapsedMs(null)).toBe(0);
    expect(timerElapsedMs({ startTime: '2026-10-12T09:30:00Z', accumulatedTime: 60000 }, now)).toBe(31 * 60000);
    expect(timerElapsedMs({ isPaused: true, startTime: null, accumulatedTime: 60000 }, now)).toBe(60000);
  });

  it('checks entries like the desktop form', () => {
    expect(entryError({ clientId: '', start: 'x', end: 'y' })).toBe('toast-select-client');
    expect(entryError({ clientId: 'c', start: '', end: '2026-10-12T10:00' })).toBe('toast-fill-times');
    expect(entryError({ clientId: 'c', start: '2026-10-12T10:00', end: '2026-10-12T10:00' })).toBe('toast-end-after-start');
    expect(entryError({ clientId: 'c', start: '2026-10-12T09:00', end: '2026-10-12T10:00' })).toBe(null);
  });
});

describe('web sign-in', () => {
  it('asks for drive.appdata, openid and email with a token response', () => {
    const url = new URL(authUrl({ clientId: 'id.apps.googleusercontent.com', state: 's1', redirect: 'https://jaffarsk24.github.io/WE-Time-Tracker/app/', loginHint: 'me@example.com' }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.appdata openid email');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('login_hint')).toBe('me@example.com');
    expect(url.searchParams.get('prompt')).toBe(null);
    expect(SCOPES).toHaveLength(3);
    const silent = new URL(authUrl({ clientId: 'x', state: 's', redirect: 'r', silent: true }));
    expect(silent.searchParams.get('prompt')).toBe('none');
  });

  it('returns to the app address without index.html', () => {
    expect(redirectUri({ origin: 'https://jaffarsk24.github.io', pathname: '/WE-Time-Tracker/app/index.html' })).toBe('https://jaffarsk24.github.io/WE-Time-Tracker/app/');
    expect(redirectUri({ origin: 'https://jaffarsk24.github.io', pathname: '/WE-Time-Tracker/app/' })).toBe('https://jaffarsk24.github.io/WE-Time-Tracker/app/');
  });

  it('reads the answer in the address hash', () => {
    expect(parseAuthHash('#foo=1')).toBe(null);
    expect(parseAuthHash('')).toBe(null);
    const ok = parseAuthHash('#access_token=t&expires_in=3599&state=s&scope=email%20https://www.googleapis.com/auth/drive.appdata');
    const { result, auth } = interpretAnswer(ok, 1000);
    expect(result).toEqual({ state: 's', ok: true });
    expect(auth).toEqual({ accessToken: 't', expiry: 1000 + 3599000, scope: 'email https://www.googleapis.com/auth/drive.appdata' });
  });

  it('refuses a token without Drive access and passes errors on', () => {
    expect(interpretAnswer(parseAuthHash('#access_token=t&state=s&scope=email openid')).result.error).toBe('drive_scope');
    expect(interpretAnswer(parseAuthHash('#error=interaction_required&state=s')).result).toEqual({ state: 's', ok: false, error: 'interaction_required' });
  });

  it('renews a token a minute before it ends', () => {
    expect(tokenUsable(null)).toBe(false);
    expect(tokenUsable({ accessToken: 't', expiry: 200000 }, 100000)).toBe(true);
    expect(tokenUsable({ accessToken: 't', expiry: 150000 }, 100000)).toBe(false);
  });

  it('knows a placeholder client id from a real one', () => {
    expect(isClientConfigured(CLIENT_ID_PLACEHOLDER)).toBe(false);
    expect(isClientConfigured('')).toBe(false);
    expect(isClientConfigured('123-abc.apps.googleusercontent.com')).toBe(true);
  });
});

describe('sync triggers', () => {
  it('follows the desktop rules', () => {
    expect(triggerPlan('open')).toBe('pull');
    expect(triggerPlan('return')).toBe('pull');
    expect(triggerPlan('button')).toBe('sync');
    expect(triggerPlan('hide')).toBe('push');
    expect(triggerPlan('stop')).toBe('push');
    // A failed upload is finished when the connection or the access is back.
    expect(triggerPlan('online')).toBe('pull');
    expect(triggerPlan('online', { pending: true })).toBe('sync');
    expect(triggerPlan('renewed', { pending: true })).toBe('sync');
  });

  it('describes the status line', () => {
    expect(statusView({ signedIn: false })).toEqual({ key: null });
    expect(statusView({ signedIn: true, phase: 'renew' })).toEqual({ key: 'web-renew-needed', renew: true });
    expect(statusView({ signedIn: true, phase: 'idle', lastSync: null }).key).toBe('web-never-synced');
    expect(statusView({ signedIn: true, phase: 'idle', lastSync: 'x' })).toEqual({ key: 'web-synced-at', time: 'x' });
  });
});

describe('web texts', () => {
  it('has every key in both languages and adds them to the dictionaries', () => {
    expect(Object.keys(webTranslations.ru).sort()).toEqual(Object.keys(webTranslations.en).sort());
    const target = addWebTranslations({ ru: { a: 'а' }, en: { a: 'a' } });
    expect(target.ru.a).toBe('а');
    expect(target.en['web-sync']).toBe('Sync');
  });

  it('uses no long dashes', () => {
    const all = JSON.stringify(webTranslations);
    expect(/[–—]/.test(all)).toBe(false);
  });
});

describe('build helpers', () => {
  it('turns a CommonJS file into a module with the same exports', async () => {
    const code = "const A = 1;\nfunction f(x) { return x + A; }\nmodule.exports = { A, f };";
    const src = cjsToEsm(code, ['A', 'f']);
    const mod = await import('data:text/javascript,' + encodeURIComponent(src));
    expect(mod.A).toBe(1);
    expect(mod.f(1)).toBe(2);
    expect(mod.default.f(2)).toBe(3);
  });

  it('lists the files the service worker keeps offline', () => {
    const src = serviceWorkerSource('1.2.3', ['./', './assets/app.js']);
    expect(src).toContain("const CACHE = 'we-time-tracker-1.2.3';");
    expect(src).toContain('["./","./assets/app.js"]');
  });
});
