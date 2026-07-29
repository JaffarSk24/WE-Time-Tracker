const { app, shell, ipcMain } = require('electron');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Default OAuth credentials for WE Time Tracker Desktop App
const DEFAULT_CLIENT_ID = '937298642010-v5c6k3g72o9b5p1l8j7r8e0m6t4n2k1a.apps.googleusercontent.com';

class GDriveSync {
  constructor() {
    this.tokensPath = path.join(app.getPath('userData'), 'google-tokens.json');
    this.tokens = this.loadTokens();
    this.server = null;
    this.lastSyncTime = null;
    this.isSyncing = false;
  }

  loadTokens() {
    try {
      if (fs.existsSync(this.tokensPath)) {
        return JSON.parse(fs.readFileSync(this.tokensPath, 'utf8'));
      }
    } catch (e) {
      console.error('[GDrive] Failed to load tokens', e);
    }
    return null;
  }

  saveTokens(tokens) {
    this.tokens = tokens;
    try {
      fs.writeFileSync(this.tokensPath, JSON.stringify(tokens, null, 2), 'utf8');
    } catch (e) {
      console.error('[GDrive] Failed to save tokens', e);
    }
  }

  clearTokens() {
    this.tokens = null;
    try {
      if (fs.existsSync(this.tokensPath)) {
        fs.unlinkSync(this.tokensPath);
      }
    } catch (e) {
      console.error('[GDrive] Failed to delete tokens file', e);
    }
  }

  isLoggedIn() {
    return Boolean(this.tokens && (this.tokens.access_token || this.tokens.refresh_token));
  }

  getUserProfile() {
    if (!this.tokens) return null;
    return {
      email: this.tokens.email || '',
      name: this.tokens.name || '',
      picture: this.tokens.picture || '',
      lastSync: this.lastSyncTime
    };
  }

  // --- OAuth 2.0 Login Flow ---
  async login(win) {
    return new Promise((resolve, reject) => {
      const port = 4567;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      
      const scopes = [
        'https://www.googleapis.com/auth/drive.appdata',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
      ].join(' ');

      const clientId = (this.tokens && this.tokens.clientId) || DEFAULT_CLIENT_ID;

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&access_type=offline` +
        `&prompt=consent`;

      if (this.server) {
        try { this.server.close(); } catch (e) {}
      }

      this.server = http.createServer(async (req, res) => {
        const reqUrl = url.parse(req.url, true);
        if (reqUrl.pathname === '/callback') {
          const code = reqUrl.query.code;
          const error = reqUrl.query.error;

          if (error || !code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>Ошибка входа через Google</h1><p>Доступ был отклонен.</p>');
            if (this.server) this.server.close();
            return reject(new Error(error || 'Authorization code missing'));
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><title>Вход выполнен</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #0f172a; color: white; text-align: center; margin: 0; }
              .card { background: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 400px; }
              h2 { color: #22c55e; margin-bottom: 10px; }
              p { color: #94a3b8; font-size: 14px; }
            </style>
            </head>
            <body>
              <div class="card">
                <h2>✓ Успешный вход!</h2>
                <p>Ваша учетная запись Google успешно подключена к <strong>WE Time Tracker</strong>.</p>
                <p>Теперь можете закрыть эту вкладку браузера и вернуться в приложение.</p>
              </div>
            </body>
            </html>
          `);

          if (this.server) this.server.close();

          try {
            const tokenData = await this.exchangeCodeForTokens(code, redirectUri, clientId);
            const userInfo = await this.fetchUserInfo(tokenData.access_token);
            
            const savedData = {
              clientId,
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token || (this.tokens && this.tokens.refresh_token),
              expiry_date: Date.now() + (tokenData.expires_in * 1000),
              email: userInfo.email,
              name: userInfo.name,
              picture: userInfo.picture
            };
            this.saveTokens(savedData);

            if (win && !win.isDestroyed()) {
              win.webContents.send('gdrive-status-changed', this.getUserProfile());
            }

            // Immediately trigger initial pull & sync
            await this.pull(win);
            resolve(this.getUserProfile());
          } catch (err) {
            console.error('[GDrive] Exchange failed', err);
            reject(err);
          }
        }
      });

      this.server.listen(port, '127.0.0.1', () => {
        console.log(`[GDrive] Listening on http://127.0.0.1:${port}/callback`);
        shell.openExternal(authUrl);
      });

      this.server.on('error', (err) => {
        console.error('[GDrive] Local auth server error', err);
        reject(err);
      });
    });
  }

  async exchangeCodeForTokens(code, redirectUri, clientId) {
    const postData = new url.URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString();

    return new Promise((resolve, reject) => {
      const req = https.request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode === 200) resolve(parsed);
            else reject(new Error(parsed.error_description || parsed.error || 'Token request failed'));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  async getValidAccessToken() {
    if (!this.tokens) throw new Error('Not logged in to Google');
    
    if (this.tokens.expiry_date && Date.now() < this.tokens.expiry_date - 60000) {
      return this.tokens.access_token;
    }

    if (!this.tokens.refresh_token) {
      throw new Error('Refresh token missing. Please log in again.');
    }

    const postData = new url.URLSearchParams({
      client_id: this.tokens.clientId || DEFAULT_CLIENT_ID,
      refresh_token: this.tokens.refresh_token,
      grant_type: 'refresh_token'
    }).toString();

    return new Promise((resolve, reject) => {
      const req = https.request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode === 200) {
              this.tokens.access_token = parsed.access_token;
              this.tokens.expiry_date = Date.now() + (parsed.expires_in * 1000);
              this.saveTokens(this.tokens);
              resolve(parsed.access_token);
            } else {
              reject(new Error(parsed.error_description || 'Token refresh failed'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  async fetchUserInfo(accessToken) {
    return new Promise((resolve, reject) => {
      const req = https.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
    });
  }

  // --- Google Drive API Operations ---
  async findDriveFile(token) {
    return new Promise((resolve, reject) => {
      const query = encodeURIComponent("name = 'we-tracker-data.json' and 'appDataFolder' in parents and trashed = false");
      const req = https.get(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.files && parsed.files.length > 0) {
              resolve(parsed.files[0]);
            } else {
              resolve(null);
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
    });
  }

  // PULL (Download from Google Drive)
  async pull(win = null) {
    if (!this.isLoggedIn()) return { success: false, reason: 'not_logged_in' };
    if (this.isSyncing) return { success: false, reason: 'already_syncing' };
    this.isSyncing = true;

    try {
      const token = await this.getValidAccessToken();
      const driveFile = await this.findDriveFile(token);

      if (!driveFile) {
        this.isSyncing = false;
        return await this.push(win);
      }

      const localPath = path.join(app.getPath('userData'), 'we-tracker-data.json');
      let localModified = 0;
      if (fs.existsSync(localPath)) {
        localModified = fs.statSync(localPath).mtimeMs;
      }

      const remoteModified = new Date(driveFile.modifiedTime).getTime();

      if (remoteModified > localModified + 1000 || !fs.existsSync(localPath)) {
        console.log('[GDrive] Remote file is newer. Downloading...');
        const remoteContent = await new Promise((resolve, reject) => {
          const req = https.get(`https://www.googleapis.com/drive/v3/files/${driveFile.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
          });
          req.on('error', reject);
        });

        JSON.parse(remoteContent);
        fs.writeFileSync(localPath, remoteContent, 'utf8');
        this.lastSyncTime = new Date().toISOString();

        if (win && !win.isDestroyed()) {
          win.webContents.send('gdrive-data-pulled', { content: remoteContent, lastSync: this.lastSyncTime });
        }
        this.isSyncing = false;
        return { success: true, pulled: true, lastSync: this.lastSyncTime };
      } else {
        console.log('[GDrive] Local file is up-to-date.');
        this.lastSyncTime = new Date().toISOString();
        this.isSyncing = false;
        return { success: true, pulled: false, message: 'Local is up to date', lastSync: this.lastSyncTime };
      }
    } catch (err) {
      console.error('[GDrive] Pull failed:', err);
      this.isSyncing = false;
      return { success: false, error: err.message };
    }
  }

  // PUSH (Upload to Google Drive)
  async push(win = null) {
    if (!this.isLoggedIn()) return { success: false, reason: 'not_logged_in' };
    if (this.isSyncing) return { success: false, reason: 'already_syncing' };
    this.isSyncing = true;

    try {
      const localPath = path.join(app.getPath('userData'), 'we-tracker-data.json');
      if (!fs.existsSync(localPath)) {
        this.isSyncing = false;
        return { success: false, reason: 'no_local_data' };
      }

      const content = fs.readFileSync(localPath, 'utf8');
      const token = await this.getValidAccessToken();
      const existingFile = await this.findDriveFile(token);

      if (existingFile) {
        console.log(`[GDrive] Updating existing file ${existingFile.id}...`);
        await new Promise((resolve, reject) => {
          const req = https.request(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(content)
            }
          }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              if (res.statusCode === 200) resolve(JSON.parse(body));
              else reject(new Error(`Upload failed: ${res.statusCode} ${body}`));
            });
          });
          req.on('error', reject);
          req.write(content);
          req.end();
        });
      } else {
        console.log('[GDrive] Creating new file in appDataFolder...');
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = {
          name: 'we-tracker-data.json',
          mimeType: 'application/json',
          parents: ['appDataFolder']
        };

        const multipartRequestBody =
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          content +
          close_delim;

        await new Promise((resolve, reject) => {
          const req = https.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary="${boundary}"`,
              'Content-Length': Buffer.byteLength(multipartRequestBody)
            }
          }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              if (res.statusCode === 200) resolve(JSON.parse(body));
              else reject(new Error(`Multipart upload failed: ${res.statusCode} ${body}`));
            });
          });
          req.on('error', reject);
          req.write(multipartRequestBody);
          req.end();
        });
      }

      this.lastSyncTime = new Date().toISOString();
      if (win && !win.isDestroyed()) {
        win.webContents.send('gdrive-status-changed', this.getUserProfile());
      }
      this.isSyncing = false;
      return { success: true, pushed: true, lastSync: this.lastSyncTime };
    } catch (err) {
      console.error('[GDrive] Push failed:', err);
      this.isSyncing = false;
      return { success: false, error: err.message };
    }
  }

  async logout(win = null) {
    this.clearTokens();
    if (win && !win.isDestroyed()) {
      win.webContents.send('gdrive-status-changed', null);
    }
    return { success: true };
  }
}

module.exports = new GDriveSync();
