const { app, BrowserWindow, ipcMain, protocol, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let viteProcess = null;
let mainWindow = null;
let lastUrl = null;
let tray = null;
let trayTimerState = null;
let trayTickInterval = null;

const STORAGE_KEY = 'we_time_tracker_data';

// Кастомная схема app:// вместо HTTP-сервера: стабильный origin (данные не
// привязаны к порту) и никакого открытого localhost-порта (path traversal закрыт).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// --- Файловое хранилище данных пользователя ---
// JSON-файл в userData переживает переустановку приложения и обновление версий.
const dataFilePath = () => path.join(app.getPath('userData'), 'we-tracker-data.json');
const backupsDir = () => path.join(app.getPath('userData'), 'backups');
const BACKUPS_TO_KEEP = 14;

// Раз в день перед первой перезаписью откладываем копию текущего файла.
function makeDailyBackup() {
  try {
    const src = dataFilePath();
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(backupsDir(), { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const dest = path.join(backupsDir(), `we-tracker-data-${stamp}.json`);
    if (fs.existsSync(dest)) return;
    fs.copyFileSync(src, dest);
    const old = fs.readdirSync(backupsDir())
      .filter(f => f.startsWith('we-tracker-data-') && f.endsWith('.json'))
      .sort();
    while (old.length > BACKUPS_TO_KEEP) {
      fs.unlinkSync(path.join(backupsDir(), old.shift()));
    }
  } catch (e) {
    console.error('Backup failed:', e);
  }
}

function saveDataFile(json) {
  makeDailyBackup();
  // Атомарная запись: сначала во временный файл, затем rename.
  const tmp = dataFilePath() + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, dataFilePath());
}

function initStorageIpc() {
  ipcMain.on('storage:load', (event) => {
    try {
      event.returnValue = fs.readFileSync(dataFilePath(), 'utf8');
    } catch (e) {
      event.returnValue = null;
    }
  });

  ipcMain.on('storage:save', (event, json) => {
    if (typeof json !== 'string') return;
    try {
      saveDataFile(json);
    } catch (e) {
      console.error('Failed to save data file:', e);
    }
  });
}

// --- Проверка и скачивание обновлений с GitHub Releases ---
// Полноценный «тихий» автоапдейт (electron-updater) на macOS требует валидной
// Developer ID подписи; с ad-hoc он падает на проверке. Поэтому: сверяем версию
// с последним релизом и, если новее, скачиваем dmg и открываем его для установки.
const GITHUB_REPO = 'JaffarSk24/WE-Time-Tracker';
const appVersion = () => app.getVersion();

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      method: 'GET',
      headers: { 'User-Agent': 'WE-Time-Tracker', 'Accept': 'application/vnd.github+json' }
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`GitHub API ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const doGet = (u, redirects) => {
      https.get(u, { headers: { 'User-Agent': 'WE-Time-Tracker' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects > 5) { reject(new Error('too many redirects')); return; }
          res.resume();
          doGet(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`download ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const out = fs.createWriteStream(destPath);
        res.on('data', chunk => {
          received += chunk.length;
          if (total && onProgress) onProgress(received / total);
        });
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve(destPath)));
        out.on('error', reject);
      }).on('error', reject);
    };
    doGet(url, 0);
  });
}

function initUpdatesIpc() {
  ipcMain.handle('updates:check', async () => {
    try {
      const release = await fetchLatestRelease();
      const latest = release.tag_name || release.name || '';
      const isNewer = compareVersions(latest, appVersion()) > 0;
      const dmg = (release.assets || []).find(a => a.name && a.name.endsWith('.dmg'));
      return {
        ok: true,
        current: appVersion(),
        latest: latest.replace(/^v/, ''),
        available: isNewer && !!dmg,
        downloadUrl: dmg ? dmg.browser_download_url : null,
        notes: release.body || ''
      };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('updates:download', async (event, url) => {
    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
      return { ok: false, error: 'invalid url' };
    }
    try {
      const dest = path.join(app.getPath('temp'), `WE-Time-Tracker-update-${Date.now()}.dmg`);
      await downloadFile(url, dest, (p) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updates:progress', p);
        }
      });
      // Открываем dmg — пользователь перетаскивает приложение в Applications
      await shell.openPath(dest);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });
}

// --- Menubar (tray) мини-таймер ---
function formatTrayElapsed(state) {
  let elapsed = state.accumulatedTime || 0;
  if (!state.isPaused && state.startTime) {
    elapsed += Date.now() - new Date(state.startTime).getTime();
  }
  const totalSecs = Math.floor(elapsed / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
  const s = String(totalSecs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function updateTrayTitle() {
  if (!tray) return;
  if (!trayTimerState) {
    tray.setTitle('🦅');
    tray.setToolTip('WE Time Tracker');
    return;
  }
  const prefix = trayTimerState.isPaused ? '🦅 ⏸' : '🦅 ▶';
  tray.setTitle(`${prefix} ${formatTrayElapsed(trayTimerState)}`);
  tray.setToolTip(trayTimerState.description || 'WE Time Tracker');
}

function getAppLanguage() {
  try {
    const state = JSON.parse(fs.readFileSync(dataFilePath(), 'utf8'));
    return state.settings && state.settings.language === 'ru' ? 'ru' : 'en';
  } catch (e) {
    return 'en';
  }
}

function rebuildTrayMenu() {
  if (!tray) return;
  const ru = getAppLanguage() === 'ru';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: ru ? 'Открыть WE Time Tracker' : 'Open WE Time Tracker', click: () => showMainWindow() },
    {
      label: ru ? 'Остановить таймер' : 'Stop timer',
      enabled: !!trayTimerState,
      click: () => stopTimerFromTray()
    },
    { type: 'separator' },
    { label: ru ? 'Выйти' : 'Quit', click: () => app.quit() }
  ]));
}

function initTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.on('click', () => showMainWindow());
  rebuildTrayMenu();
  updateTrayTitle();

  ipcMain.on('timer:sync', (event, state) => {
    trayTimerState = state || null;
    updateTrayTitle();
    rebuildTrayMenu();

    if (trayTimerState && !trayTimerState.isPaused) {
      if (!trayTickInterval) {
        trayTickInterval = setInterval(updateTrayTitle, 1000);
      }
    } else if (trayTickInterval) {
      clearInterval(trayTickInterval);
      trayTickInterval = null;
    }
  });
}

// Остановка таймера из tray: если окно живо — стопим через рендерер (одна
// логика в store.js); если окна нет — main сам дописывает запись в файл.
function stopTimerFromTray() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:stop-request');
    return;
  }
  if (!trayTimerState) return;
  try {
    const state = JSON.parse(fs.readFileSync(dataFilePath(), 'utf8'));
    const timer = state.activeTimer;
    if (timer) {
      let total = timer.accumulatedTime || 0;
      if (!timer.isPaused && timer.startTime) {
        total += Date.now() - new Date(timer.startTime).getTime();
      }
      const endTime = new Date().toISOString();
      const startTime = new Date(Date.now() - total).toISOString();
      state.timeLogs.push({
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        description: (timer.description || '').trim(),
        clientId: timer.clientId || null,
        projectId: timer.projectId || null,
        startTime,
        endTime,
        billable: timer.billable !== undefined ? timer.billable : true,
        paid: false,
        rateAtTime: trayTimerState.rateAtTime || 0
      });
      state.activeTimer = null;
      saveDataFile(JSON.stringify(state));
    }
  } catch (e) {
    console.error('Tray stop failed:', e);
  }
  trayTimerState = null;
  updateTrayTitle();
  rebuildTrayMenu();
  if (trayTickInterval) {
    clearInterval(trayTickInterval);
    trayTickInterval = null;
  }
}

// --- Раздача статики через app:// (только внутри dist, без сервера) ---
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon'
};

function registerAppProtocol() {
  const distRoot = path.join(__dirname, 'dist');
  protocol.handle('app', (request) => {
    try {
      const u = new URL(request.url);
      let pathname = decodeURIComponent(u.pathname);
      if (!pathname || pathname === '/') pathname = '/index.html';

      let file = path.normalize(path.join(distRoot, pathname));
      // Жёсткое ограничение путей корнем dist
      if (file !== distRoot && !file.startsWith(distRoot + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!fs.existsSync(file)) {
        file = path.join(distRoot, 'index.html');
      }
      const data = fs.readFileSync(file);
      const mime = MIME[path.extname(file)] || 'application/octet-stream';
      return new Response(data, { headers: { 'Content-Type': mime } });
    } catch (e) {
      console.error('app:// handler error:', e);
      return new Response('Internal error', { status: 500 });
    }
  });
}

// --- Одноразовая миграция localStorage со старого origin http://127.0.0.1:<port> ---
// Версии <= 1.2.x держали данные в localStorage, привязанном к порту сервера.
// Поднимаем этот origin в скрытом окне, забираем данные и переносим в файл.
function migrateLegacyLocalStorage(done) {
  if (fs.existsSync(dataFilePath())) {
    done();
    return;
  }

  const portFile = path.join(app.getPath('userData'), 'port.txt');
  let port = 39103;
  if (fs.existsSync(portFile)) {
    try {
      const parsed = parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10);
      if (!isNaN(parsed) && parsed > 1024 && parsed < 65535) {
        port = parsed;
      }
    } catch (e) { /* используем дефолтный порт */ }
  }

  const http = require('http');
  const distRoot = path.join(__dirname, 'dist');
  const server = http.createServer((req, res) => {
    // Минимальный безопасный ответ: нам нужен только документ с нужным origin
    let file = path.normalize(path.join(distRoot, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]));
    if (!file.startsWith(distRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(distRoot, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/html' });
    res.end(fs.readFileSync(file));
  });

  let finished = false;
  const finish = (win) => {
    if (finished) return;
    finished = true;
    if (win && !win.isDestroyed()) win.destroy();
    try { server.close(); } catch (e) { /* ignore */ }
    done();
  };

  server.once('error', () => finish(null)); // порт занят — мигрировать неоткуда
  server.listen(port, '127.0.0.1', () => {
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
    // Загружаем картинку, а не index.html — origin тот же, но код приложения не выполняется
    win.loadURL(`http://127.0.0.1:${port}/white-eagles-logo-white.webp`)
      .then(() => win.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`))
      .then(data => {
        if (data) {
          try {
            const parsed = JSON.parse(data);
            const hasData = (parsed.clients || []).length || (parsed.projects || []).length || (parsed.timeLogs || []).length;
            if (hasData) {
              saveDataFile(data);
              console.log('Migrated legacy localStorage data to file storage');
            }
          } catch (e) {
            console.error('Legacy data parse failed:', e);
          }
        }
      })
      .catch(e => console.error('Legacy migration failed:', e))
      .then(() => finish(win));
  });

  // Страховка от зависания миграции
  setTimeout(() => finish(null), 10000);
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  } else if (lastUrl) {
    createWindow(lastUrl);
  }
}

function createWindow(url) {
  lastUrl = url;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'WE Time Tracker',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Remove default menu for a clean native app look
  mainWindow.setMenu(null);

  // Open external links in the default browser
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    } catch (e) {
      console.error('Failed to parse URL in will-navigate:', e);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    try {
      const parsedUrl = new URL(openUrl);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        shell.openExternal(openUrl);
      }
    } catch (e) {
      console.error('Failed to parse URL in setWindowOpenHandler:', e);
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initStorageIpc();
  initUpdatesIpc();
  initTray();

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    // Start Vite dev server dynamically
    viteProcess = spawn('npx', ['vite', '--port', '3003', '--no-open'], {
      shell: true,
      stdio: 'inherit'
    });

    // Wait a brief moment for Vite to start up, then open browser window
    setTimeout(() => {
      createWindow('http://localhost:3003');
    }, 1500);
  } else {
    registerAppProtocol();
    migrateLegacyLocalStorage(() => {
      createWindow('app://bundle/index.html');
    });
  }
});

// macOS: клик по иконке в доке заново открывает окно
// (раньше после закрытия окна приложение оставалось висеть без способа открыть его)
app.on('activate', () => {
  showMainWindow();
});

app.on('window-all-closed', () => {
  if (viteProcess) {
    try {
      viteProcess.kill();
    } catch (e) { /* ignore */ }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (viteProcess) {
    try {
      viteProcess.kill();
    } catch (e) { /* ignore */ }
  }
});
