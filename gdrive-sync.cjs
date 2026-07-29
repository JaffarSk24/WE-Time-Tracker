// Google Drive sync for the user's data file.
//
// Design notes:
// - OAuth credentials are NOT hardcoded: the user creates their own OAuth
//   client in Google Cloud Console and enters it in Settings. Credentials are
//   stored in userData, never in the repository.
// - The authorization code flow uses PKCE and a loopback redirect on an
//   ephemeral port (Google allows any port for Desktop clients).
// - Data lives in the Drive "appDataFolder", a hidden per-app folder: the file
//   does not clutter the user's Drive and other apps cannot read it.
// - Local writes always go through the injected writer so the app's atomic
//   write and daily backups apply. A pull never discards local work without
//   first writing a conflict snapshot.

const { app, shell } = require('electron');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REMOTE_FILE_NAME = 'we-tracker-data.json';
const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

class GDriveSync {
  constructor() {
    this.credentialsPath = null;
    this.tokensPath = null;
    this.syncStatePath = null;
    this.credentials = null;
    this.tokens = null;
    this.syncState = null;
    this.isSyncing = false;
    this.server = null;
    this.readLocal = null;
    this.writeLocal = null;
    this.backupLocal = null;
  }

  // Wires the module to the main process' data-file helpers.
  init({ readLocal, writeLocal, backupLocal }) {
    this.credentialsPath = path.join(app.getPath('userData'), 'google-credentials.json');
    this.tokensPath = path.join(app.getPath('userData'), 'google-tokens.json');
    this.syncStatePath = path.join(app.getPath('userData'), 'gdrive-sync-state.json');
    this.readLocal = readLocal;
    this.writeLocal = writeLocal;
    this.backupLocal = backupLocal;
    this.credentials = this.readJson(this.credentialsPath);
    this.tokens = this.readJson(this.tokensPath);
    this.syncState = this.readJson(this.syncStatePath) || {};
  }

  readJson(file) {
    try {
      if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error('[GDrive] Failed to read', file, e.message);
    }
    return null;
  }

  writeJson(file, data) {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[GDrive] Failed to write', file, e.message);
    }
  }

  isConfigured() {
    return Boolean(this.credentials && this.credentials.clientId && this.credentials.clientSecret);
  }

  isLoggedIn() {
    return Boolean(this.tokens && this.tokens.refresh_token);
  }

  setCredentials(clientId, clientSecret) {
    const creds = {
      clientId: String(clientId || '').trim(),
      clientSecret: String(clientSecret || '').trim()
    };
    if (!creds.clientId || !creds.clientSecret) {
      return { ok: false, error: 'empty_credentials' };
    }
    this.credentials = creds;
    this.writeJson(this.credentialsPath, creds);
    return { ok: true, status: this.getStatus() };
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      loggedIn: this.isLoggedIn(),
      email: (this.tokens && this.tokens.email) || '',
      lastSync: this.syncState ? this.syncState.lastSync || null : null,
      clientId: (this.credentials && this.credentials.clientId) || ''
    };
  }

  // --- OAuth 2.0 authorization code flow with PKCE ---
  async login(win) {
    if (!this.isConfigured()) return { ok: false, error: 'not_configured' };

    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        try { if (this.server) this.server.close(); } catch (e) { /* already closed */ }
        this.server = null;
        resolve(result);
      };

      const page = (title, message, color) => `<!DOCTYPE html><html><head>
        <meta charset="utf-8"><title>${title}</title></head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;
        justify-content:center;align-items:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0">
        <div style="background:#1e293b;padding:40px;border-radius:16px;max-width:420px;text-align:center">
        <h2 style="color:${color};margin:0 0 12px">${title}</h2>
        <p style="color:#94a3b8;font-size:14px;margin:0">${message}</p></div></body></html>`;

      this.server = http.createServer(async (req, res) => {
        const reqUrl = new URL(req.url, 'http://127.0.0.1');
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');
        const returnedState = reqUrl.searchParams.get('state');

        if (error || !code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(page('Sign-in failed', 'You can close this tab and try again in the app.', '#f43f5e'));
          finish({ ok: false, error: error || 'invalid_response' });
          return;
        }

        const redirectUri = `http://127.0.0.1:${this.server.address().port}/callback`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page('Signed in', 'Google account connected. You can close this tab and return to WE Time Tracker.', '#22c55e'));

        try {
          const tokenData = await this.requestTokens({
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            redirect_uri: redirectUri
          });
          const email = await this.fetchEmail(tokenData.access_token);
          this.tokens = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expiry: Date.now() + (tokenData.expires_in || 3600) * 1000,
            email
          };
          this.writeJson(this.tokensPath, this.tokens);
          this.notifyStatus(win);
          finish({ ok: true, status: this.getStatus() });
        } catch (e) {
          finish({ ok: false, error: e.message });
        }
      });

      this.server.on('error', (e) => finish({ ok: false, error: e.message }));

      // Port 0 = ephemeral; Google accepts any loopback port for Desktop clients.
      this.server.listen(0, '127.0.0.1', () => {
        const redirectUri = `http://127.0.0.1:${this.server.address().port}/callback`;
        const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
          client_id: this.credentials.clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: SCOPES,
          access_type: 'offline',
          prompt: 'consent',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state
        }).toString();
        shell.openExternal(authUrl);
      });

      // Do not leave a dangling local server if the browser tab is abandoned.
      setTimeout(() => finish({ ok: false, error: 'timeout' }), 5 * 60 * 1000);
    });
  }

  requestTokens(params) {
    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      ...params
    }).toString();

    return new Promise((resolve, reject) => {
      const req = https.request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200) resolve(parsed);
            else reject(new Error(parsed.error_description || parsed.error || `token ${res.statusCode}`));
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(20000, () => req.destroy(new Error('timeout')));
      req.write(body);
      req.end();
    });
  }

  async getAccessToken() {
    if (!this.isLoggedIn()) throw new Error('not_logged_in');
    if (this.tokens.access_token && Date.now() < this.tokens.expiry - 60000) {
      return this.tokens.access_token;
    }
    const refreshed = await this.requestTokens({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refresh_token
    });
    this.tokens.access_token = refreshed.access_token;
    this.tokens.expiry = Date.now() + (refreshed.expires_in || 3600) * 1000;
    this.writeJson(this.tokensPath, this.tokens);
    return this.tokens.access_token;
  }

  fetchEmail(accessToken) {
    return new Promise((resolve) => {
      https.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data).email || ''); } catch (e) { resolve(''); }
        });
      }).on('error', () => resolve(''));
    });
  }

  // --- Drive helpers ---
  driveRequest(url, options = {}, payload = null) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`drive ${res.statusCode}: ${data.slice(0, 200)}`));
        });
      });
      req.on('error', reject);
      req.setTimeout(60000, () => req.destroy(new Error('timeout')));
      if (payload) req.write(payload);
      req.end();
    });
  }

  async findRemoteFile(token) {
    const q = encodeURIComponent(`name = '${REMOTE_FILE_NAME}' and trashed = false`);
    const body = await this.driveRequest(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
    );
    const files = JSON.parse(body).files || [];
    return files[0] || null;
  }

  hash(text) {
    return crypto.createHash('sha256').update(text || '').digest('hex');
  }

  saveSyncState(patch) {
    this.syncState = { ...(this.syncState || {}), ...patch, lastSync: new Date().toISOString() };
    this.writeJson(this.syncStatePath, this.syncState);
  }

  notifyStatus(win) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('gdrive:status', this.getStatus());
    }
  }

  // Uploads the local file, creating it in appDataFolder on first run.
  async push(win = null) {
    if (!this.isLoggedIn()) return { ok: false, error: 'not_logged_in' };
    if (this.isSyncing) return { ok: false, error: 'busy' };
    this.isSyncing = true;
    try {
      const content = this.readLocal();
      if (!content) return { ok: false, error: 'no_local_data' };

      const token = await this.getAccessToken();
      const remote = await this.findRemoteFile(token);
      let saved;

      if (remote) {
        saved = await this.driveRequest(
          `https://www.googleapis.com/upload/drive/v3/files/${remote.id}?uploadType=media&fields=modifiedTime`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(content)
            }
          },
          content
        );
      } else {
        const boundary = 'we-tracker-' + crypto.randomBytes(8).toString('hex');
        const metadata = JSON.stringify({ name: REMOTE_FILE_NAME, parents: ['appDataFolder'] });
        const multipart =
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
        saved = await this.driveRequest(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=modifiedTime',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
              'Content-Length': Buffer.byteLength(multipart)
            }
          },
          multipart
        );
      }

      let remoteModified = null;
      try { remoteModified = JSON.parse(saved).modifiedTime; } catch (e) { /* field optional */ }
      this.saveSyncState({ syncedHash: this.hash(content), remoteModified });
      this.notifyStatus(win);
      return { ok: true, pushed: true, status: this.getStatus() };
    } catch (e) {
      console.error('[GDrive] push failed:', e.message);
      return { ok: false, error: e.message };
    } finally {
      this.isSyncing = false;
    }
  }

  // Two-way sync. Chooses between download, upload and conflict handling using
  // the hash and modifiedTime recorded at the last successful sync.
  async sync(win = null, { silent = false } = {}) {
    if (!this.isLoggedIn()) return { ok: false, error: 'not_logged_in' };
    if (this.isSyncing) return { ok: false, error: 'busy' };
    this.isSyncing = true;
    try {
      const token = await this.getAccessToken();
      const remote = await this.findRemoteFile(token);
      const localContent = this.readLocal();
      const localHash = this.hash(localContent);
      const state = this.syncState || {};

      // Nothing in the cloud yet — seed it from this machine.
      if (!remote) {
        this.isSyncing = false;
        return await this.push(win);
      }

      const remoteChanged = remote.modifiedTime !== state.remoteModified;
      const localChanged = localContent ? localHash !== state.syncedHash : false;

      if (!remoteChanged && !localChanged) {
        this.saveSyncState({});
        this.notifyStatus(win);
        return { ok: true, upToDate: true, status: this.getStatus() };
      }

      if (localChanged && !remoteChanged) {
        this.isSyncing = false;
        return await this.push(win);
      }

      // Remote is ahead: download it, but never lose local work silently.
      const remoteContent = await this.driveRequest(
        `https://www.googleapis.com/drive/v3/files/${remote.id}?alt=media`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
      );
      JSON.parse(remoteContent); // reject malformed payloads before touching local data

      let conflictBackup = null;
      if (localContent) {
        conflictBackup = this.backupLocal(localChanged ? 'conflict' : 'presync');
      }

      this.writeLocal(remoteContent);
      this.saveSyncState({ syncedHash: this.hash(remoteContent), remoteModified: remote.modifiedTime });

      if (win && !win.isDestroyed()) {
        win.webContents.send('gdrive:pulled', {
          conflict: Boolean(localChanged && conflictBackup),
          backupPath: conflictBackup,
          silent
        });
      }
      this.notifyStatus(win);
      return { ok: true, pulled: true, conflict: Boolean(localChanged), status: this.getStatus() };
    } catch (e) {
      console.error('[GDrive] sync failed:', e.message);
      return { ok: false, error: e.message };
    } finally {
      this.isSyncing = false;
    }
  }

  async logout(win = null) {
    this.tokens = null;
    try {
      if (fs.existsSync(this.tokensPath)) fs.unlinkSync(this.tokensPath);
    } catch (e) {
      console.error('[GDrive] Failed to remove tokens:', e.message);
    }
    this.saveSyncState({ syncedHash: null, remoteModified: null });
    this.notifyStatus(win);
    return { ok: true, status: this.getStatus() };
  }
}

module.exports = new GDriveSync();
