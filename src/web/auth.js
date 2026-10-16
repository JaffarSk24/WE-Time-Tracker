// Google sign-in of the phone web app.
//
// A web page gets no long-lived token: Google's OAuth for client-side apps
// returns an access token for about an hour in the address of the page it
// redirects to. The sign-in page opens in a window of its own, from a tap: in
// an app installed on the iPhone home screen such a window stays inside the
// app, while a plain redirect would leave for Safari, which keeps a separate
// storage. The window comes back to this app's address, stores the token,
// tells the app over a BroadcastChannel and closes.
//
// When the hour is up the app first asks Google silently (prompt=none in a
// hidden frame). That works while the browser lets Google see its own
// sign-in there; when it does not (Safari blocks it), the status line shows a
// button, and the tap opens the window again, which Google answers at once
// while its session in this browser is alive.
//
// The appDataFolder belongs to the Google Cloud project, not to one OAuth
// client, so this web client sees the same we-tracker-data.json as the
// desktop app.

import { grantsDrive, DRIVE_SCOPE } from 'virtual:gdrive-utils';
import { WEB_CLIENT_ID } from './config.js';

export const SCOPES = [DRIVE_SCOPE, 'openid', 'email'];

const AUTH_KEY = 'we_tt_web_auth';         // { accessToken, expiry, scope }
const ACCOUNT_KEY = 'we_tt_web_account';   // { email }
const PENDING_KEY = 'we_tt_web_pending';   // { [state]: { mode, startedAt } }
const RESULT_KEY = 'we_tt_web_result';     // { state, ok, error }
const CHANNEL = 'we-tt-auth';
const LOGIN_WAIT_MS = 5 * 60 * 1000;
const SILENT_WAIT_MS = 8000;
// A token this close to its end is renewed instead of used.
const EXPIRY_MARGIN_MS = 60 * 1000;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* storage full or blocked: the sign-in will not stick */ }
}

function randomState() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

// The address Google returns to: this app's own page without index.html,
// query or hash. It must be one of the client's authorized redirect URIs.
export function redirectUri(loc) {
  return loc.origin + loc.pathname.replace(/index\.html$/, '');
}

export function authUrl({ clientId = WEB_CLIENT_ID, state, redirect, loginHint = '', silent = false }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state
  });
  if (loginHint) params.set('login_hint', loginHint);
  if (silent) params.set('prompt', 'none');
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// Google's answer in the address hash: a token or an error, else null.
export function parseAuthHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (!params.has('access_token') && !params.has('error')) return null;
  return {
    state: params.get('state') || '',
    error: params.get('error') || null,
    accessToken: params.get('access_token') || null,
    expiresIn: Number(params.get('expires_in') || 3600),
    scope: params.get('scope') || ''
  };
}

// What an answer means: { result, auth } where auth is the token to store.
// People can untick the Drive permission on Google's page; a token without
// it is useless for sync.
export function interpretAnswer(answer, now = Date.now()) {
  if (answer.error) {
    return { result: { state: answer.state, ok: false, error: answer.error }, auth: null };
  }
  if (!answer.accessToken) {
    return { result: { state: answer.state, ok: false, error: 'invalid_response' }, auth: null };
  }
  if (!grantsDrive(answer.scope)) {
    return { result: { state: answer.state, ok: false, error: 'drive_scope' }, auth: null };
  }
  return {
    result: { state: answer.state, ok: true },
    auth: { accessToken: answer.accessToken, expiry: now + answer.expiresIn * 1000, scope: answer.scope }
  };
}

export function tokenUsable(auth, now = Date.now()) {
  return Boolean(auth && auth.accessToken && now < auth.expiry - EXPIRY_MARGIN_MS);
}

function pendingStates() {
  return read(PENDING_KEY) || {};
}

function setPending(state, info) {
  const all = pendingStates();
  if (info) all[state] = info;
  else delete all[state];
  // Forget attempts nobody finished.
  Object.keys(all).forEach(key => {
    if (Date.now() - (all[key].startedAt || 0) > LOGIN_WAIT_MS) delete all[key];
  });
  write(PENDING_KEY, all);
}

function announce(result) {
  write(RESULT_KEY, result);
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(result);
    channel.close();
  } catch (e) { /* the app also polls the storage */ }
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage({ weAuth: result }, location.origin);
  } catch (e) { /* not in a frame */ }
}

// Runs first when the page loads. When the page is Google's answer, stores
// it and tells the app. In the sign-in window or the silent frame it returns
// true: the app must not start there. After a plain redirect (windows
// blocked) it returns false and the app starts in this tab.
export function handleAuthCallback() {
  const answer = parseAuthHash(location.hash);
  if (!answer) return false;
  history.replaceState(null, '', location.pathname + location.search);
  const pending = pendingStates()[answer.state];
  if (!pending) return false;
  const { result, auth } = interpretAnswer(answer);
  if (auth) write(AUTH_KEY, auth);
  setPending(answer.state, null);
  announce(result);
  if (pending.mode === 'frame') return true;
  if (pending.mode !== 'window') return false;
  setTimeout(() => {
    try { window.close(); } catch (e) { /* not closable: the note on the page stays */ }
  }, 50);
  return true;
}

export function getAccount() {
  return read(ACCOUNT_KEY);
}

export function isSignedIn() {
  const account = getAccount();
  return Boolean(account && account.email);
}

// A usable access token, or null when it has to be renewed.
export function validToken() {
  const auth = read(AUTH_KEY);
  return tokenUsable(auth) ? auth.accessToken : null;
}

// The token was refused (a 401): it must not be used again.
export function dropToken() {
  const auth = read(AUTH_KEY);
  if (auth) write(AUTH_KEY, { ...auth, expiry: 0 });
}

function waitForResult(state, timeoutMs, isGone) {
  return new Promise(resolve => {
    let channel = null;
    const started = Date.now();
    let goneSince = 0;
    const finish = (result) => {
      clearInterval(poll);
      window.removeEventListener('message', onMessage);
      if (channel) channel.close();
      setPending(state, null);
      resolve(result);
    };
    const onMessage = (event) => {
      if (event.origin !== location.origin) return;
      const result = event.data && event.data.weAuth;
      if (result && result.state === state) finish(result);
    };
    window.addEventListener('message', onMessage);
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event) => { if (event.data && event.data.state === state) finish(event.data); };
    } catch (e) { channel = null; }
    const poll = setInterval(() => {
      const result = read(RESULT_KEY);
      if (result && result.state === state) return finish(result);
      if (Date.now() - started > timeoutMs) return finish({ state, ok: false, error: 'timeout' });
      if (isGone && isGone()) {
        // The answer may still be on its way through the storage.
        goneSince = goneSince || Date.now();
        if (Date.now() - goneSince > 3000) finish({ state, ok: false, error: 'cancelled' });
      }
    }, 300);
  });
}

async function finishSignIn(result) {
  if (!result.ok) return result;
  try {
    const email = await fetchEmail();
    write(ACCOUNT_KEY, { email });
    return { ok: true, email };
  } catch (e) {
    return { ok: false, error: e.message || 'network' };
  }
}

let interactive = null;

// Opens Google's sign-in in a window of its own; call it from a tap. Falls
// back to leaving the page when windows are blocked.
export function signIn() {
  if (interactive) return interactive;
  const state = randomState();
  write(RESULT_KEY, null);
  const account = getAccount();
  const url = authUrl({ state, redirect: redirectUri(location), loginHint: account && account.email ? account.email : '' });
  const popup = window.open('about:blank', 'we-tt-auth');
  if (!popup) {
    setPending(state, { mode: 'redirect', startedAt: Date.now() });
    location.assign(url);
    return new Promise(() => {});
  }
  setPending(state, { mode: 'window', startedAt: Date.now() });
  popup.location.href = url;
  const isGone = () => { try { return popup.closed; } catch (e) { return false; } };
  interactive = waitForResult(state, LOGIN_WAIT_MS, isGone)
    .then(result => {
      try { if (!popup.closed) popup.close(); } catch (e) { /* already gone */ }
      return finishSignIn(result);
    })
    .finally(() => { interactive = null; });
  return interactive;
}

let silent = null;

// Asks Google for a fresh token without showing anything. Resolves to true
// when a usable token is stored.
export function silentRenew() {
  if (validToken()) return Promise.resolve(true);
  const account = getAccount();
  if (!account || !account.email) return Promise.resolve(false);
  if (silent) return silent;
  const state = randomState();
  setPending(state, { mode: 'frame', startedAt: Date.now() });
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.setAttribute('aria-hidden', 'true');
  frame.src = authUrl({ state, redirect: redirectUri(location), loginHint: account.email, silent: true });
  document.body.appendChild(frame);
  silent = waitForResult(state, SILENT_WAIT_MS, null)
    .then(result => Boolean(result.ok && validToken()))
    .finally(() => {
      frame.remove();
      silent = null;
    });
  return silent;
}

// After a sign-in that left the page (windows blocked), the app finishes it
// on its next start: the token is stored, the account is not yet.
export async function finishRedirectSignIn() {
  const result = read(RESULT_KEY);
  if (!result || !result.ok || isSignedIn() || !validToken()) return false;
  write(RESULT_KEY, null);
  const done = await finishSignIn(result);
  return done.ok;
}

async function fetchEmail() {
  const token = validToken();
  if (!token) throw new Error('renew_needed');
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`userinfo ${res.status}`);
  const data = await res.json();
  return data.email || '';
}

export async function signOut() {
  const auth = read(AUTH_KEY);
  write(AUTH_KEY, null);
  write(ACCOUNT_KEY, null);
  if (auth && auth.accessToken) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(auth.accessToken), {
        method: 'POST', mode: 'no-cors'
      });
    } catch (e) { /* offline: the local sign-out still stands */ }
  }
}
