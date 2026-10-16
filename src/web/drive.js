// Google Drive transport of the phone web app: the same requests the desktop
// app makes in gdrive-sync.cjs, done with fetch. The data file is the
// desktop's we-tracker-data.json in the hidden appDataFolder.

import { isInsufficientScope } from 'virtual:gdrive-utils';
import { validToken, dropToken } from './auth.js';

export const REMOTE_FILE_NAME = 'we-tracker-data.json';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TIMEOUT_MS = 60000;
// Browsers carry a request on after the page is hidden only up to 64 KB.
const KEEPALIVE_LIMIT = 60 * 1024;

export function renewError() {
  const err = new Error('renew_needed');
  err.renew = true;
  return err;
}

export function isNetworkError(e) {
  return Boolean(e) && !e.status && !e.renew
    && (e.name === 'TypeError' || e.name === 'TimeoutError' || e.name === 'AbortError' || /network|failed to fetch|load failed|offline/i.test(e.message || ''));
}

async function api(url, options = {}) {
  const token = validToken();
  if (!token) throw renewError();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
  const { timeout, ...rest } = options;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(rest.headers || {}), Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeout || TIMEOUT_MS)
  });
  if (res.status === 401) {
    dropToken();
    throw renewError();
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`drive ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    err.scopeDenied = isInsufficientScope(res.status, body);
    throw err;
  }
  return res;
}

function boundary() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return 'we-tracker-' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const drive = {
  async find() {
    const q = encodeURIComponent(`name = '${REMOTE_FILE_NAME}' and trashed = false`);
    const res = await api(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`);
    const files = (await res.json()).files || [];
    return files[0] || null;
  },

  async read(remote) {
    const res = await api(`${DRIVE}/files/${remote.id}?alt=media`, { timeout: 120000 });
    return res.text();
  },

  // Writes the content (creating the file on first use) and returns the new
  // modifiedTime of the cloud file.
  async upload(remote, content) {
    const size = new Blob([content]).size;
    const keepalive = size < KEEPALIVE_LIMIT;
    let res;
    if (remote) {
      res = await api(`${UPLOAD}/files/${remote.id}?uploadType=media&fields=modifiedTime`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content, keepalive, timeout: 120000
      });
    } else {
      const b = boundary();
      const metadata = JSON.stringify({ name: REMOTE_FILE_NAME, parents: ['appDataFolder'] });
      const multipart =
        `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--`;
      res = await api(`${UPLOAD}/files?uploadType=multipart&fields=modifiedTime`, {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: multipart, keepalive, timeout: 120000
      });
    }
    try { return (await res.json()).modifiedTime || null; } catch (e) { return null; }
  }
};
