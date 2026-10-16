const {
  app, BrowserWindow, ipcMain, protocol, Tray, Menu, nativeImage, shell, screen, dialog,
  globalShortcut, powerMonitor, Notification
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const gdriveSync = require('./gdrive-sync.cjs');
const updater = require('./updater.cjs');
const reminders = require('./reminders-utils.cjs');
const trayUtils = require('./tray-utils.cjs');

let viteProcess = null;
let mainWindow = null;
let lastUrl = null;
let tray = null;
let trayTimerState = null;
let trayTickInterval = null;
let mainWindowHasOpened = false;

const STORAGE_KEY = 'we_time_tracker_data';

// Custom app:// scheme instead of an HTTP server: stable origin (data not tied
// to a port) and no open localhost port (path traversal closed).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// --- File-based user data storage ---
// The JSON file in userData survives app reinstalls and version updates.
const dataFilePath = () => path.join(app.getPath('userData'), 'we-tracker-data.json');
const backupsDir = () => path.join(app.getPath('userData'), 'backups');
const BACKUPS_TO_KEEP = 14;

// Once a day, before the first overwrite, keep a copy of the current file.
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
  // Atomic write: to a temp file first, then rename.
  const tmp = dataFilePath() + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, dataFilePath());
}

// Tagged snapshot of the current data file, used before a cloud pull replaces
// it, or of the given content (the cloud copy, before this computer's data
// replaces it). Returns the backup path so the user can be told where it went.
function snapshotDataFile(tag, content = null) {
  try {
    const src = dataFilePath();
    if (content === null && !fs.existsSync(src)) return null;
    fs.mkdirSync(backupsDir(), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupsDir(), `we-tracker-data-${tag}-${stamp}.json`);
    if (content === null) fs.copyFileSync(src, dest);
    else fs.writeFileSync(dest, content, 'utf8');
    return dest;
  } catch (e) {
    console.error('Snapshot failed:', e);
    return null;
  }
}

function readDataFile() {
  try {
    return fs.readFileSync(dataFilePath(), 'utf8');
  } catch (e) {
    return null;
  }
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
    scheduleDataRefresh(json);
  });

  // Data found in localStorage that is not in the data file is never thrown
  // away — it is written next to the backups so it can be imported manually.
  ipcMain.on('storage:save-recovery', (event, json) => {
    if (typeof json !== 'string' || !json) return;
    try {
      fs.mkdirSync(backupsDir(), { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(backupsDir(), `recovered-localstorage-${stamp}.json`), json, 'utf8');
      console.log('Saved leftover localStorage data to backups');
    } catch (e) {
      console.error('Failed to save recovery copy:', e);
    }
  });
}

// --- Updates from GitHub Releases ---
// The updater itself lives in updater.cjs: it downloads the new version and
// installs it in place once the app quits, then starts it again. What stays
// here is the cleanup after the older flow (up to 1.8.x), which downloaded a
// disk image or setup into the temp folder and opened it.

// Unmounts disk images opened from our downloaded installers. Matching is done
// on the file name, not the full path: hdiutil reports the resolved location
// (/private/var/...) while Electron hands out the symlinked one (/var/...), and
// the image can still be attached after its file is gone.
function detachUpdateImages(isOurs) {
  try {
    const { execFileSync } = require('child_process');
    const info = execFileSync('hdiutil', ['info'], { encoding: 'utf8' });
    // Each attached image is one block listing its source path and devices.
    info.split(/^=+$/m).forEach(block => {
      const imagePath = (block.match(/^image-path\s*:\s*(.+)$/m) || [])[1];
      if (!imagePath || !isOurs(path.basename(imagePath.trim()))) return;
      const device = (block.match(/^\s*(\/dev\/disk\d+)\s/m) || [])[1];
      if (!device) return;
      try {
        execFileSync('hdiutil', ['detach', device, '-quiet']);
      } catch (e) {
        execFileSync('hdiutil', ['detach', device, '-force', '-quiet']);
      }
      console.log('Detached update image', path.basename(imagePath.trim()));
    });
  } catch (e) {
    console.error('Could not detach update image:', e.message);
  }
}

// Installers downloaded by the older updater are ~100 MB each and would
// otherwise pile up in the temp folder. On macOS the disk image usually stays
// mounted after the user drags the app across, and the space is only released
// once that volume is detached — so unmount first, then delete.
function cleanupDownloadedUpdates() {
  const isOurs = (name) => /^WE-Time-Tracker-update-\d+\.(dmg|exe)$/.test(name);

  // Run this first and unconditionally: an image can stay attached even after
  // its file was removed, and it holds the disk space until it is detached.
  if (process.platform === 'darwin') {
    detachUpdateImages(isOurs);
  }
  let dir;
  try {
    dir = app.getPath('temp');
  } catch (e) {
    return;
  }

  let leftovers;
  try {
    leftovers = fs.readdirSync(dir).filter(isOurs).map(f => path.join(dir, f));
  } catch (e) {
    return;
  }
  if (leftovers.length === 0) return;

  leftovers.forEach(file => {
    try {
      fs.unlinkSync(file);
      console.log('Removed downloaded installer', path.basename(file));
    } catch (e) {
      console.error('Could not remove installer:', e.message);
    }
  });
}

function initUpdatesIpc() {
  updater.cleanup();
  ipcMain.handle('updates:check', () => updater.check());
  ipcMain.handle('updates:download', () => updater.download((p) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updates:progress', p);
    }
  }));
  ipcMain.handle('updates:install', () => {
    const result = updater.install();
    // Quitting goes through before-quit, so the last session reaches Google
    // Drive before the new version replaces this one.
    if (result.ok && result.quit) setTimeout(() => app.quit(), 100);
    return result;
  });
}

// --- Menubar (tray) mini-timer ---
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

// Only macOS can show text next to the tray icon; elsewhere the elapsed time
// goes into the tooltip, which is what the Windows taskbar tray can display.
function updateTrayTitle() {
  if (!tray) return;
  const isMac = process.platform === 'darwin';

  if (!trayTimerState) {
    if (isMac) tray.setTitle('🦅');
    tray.setToolTip('WE Time Tracker');
    return;
  }

  const elapsed = formatTrayElapsed(trayTimerState);
  const marker = trayTimerState.isPaused ? '⏸' : '▶';
  if (isMac) tray.setTitle(`🦅 ${marker} ${elapsed}`);
  tray.setToolTip(
    `${marker} ${elapsed}${trayTimerState.description ? ' — ' + trayTimerState.description : ''}`
  );
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
  const lang = ru ? 'ru' : 'en';
  // Quick start: the latest distinct tasks, one click continues one.
  const recent = recentTasksCache.length
    ? [
      { type: 'separator' },
      { label: reminders.mainText(lang, 'recentHeader'), enabled: false },
      ...recentTasksCache.map(task => ({
        label: trayUtils.taskLabel(task, reminders.mainText(lang, 'noDescription')),
        click: () => startTaskFromTray(task)
      }))
    ]
    : [];
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: ru ? 'Открыть WE Time Tracker' : 'Open WE Time Tracker', click: () => showMainWindow() },
    {
      label: ru ? 'Остановить таймер' : 'Stop timer',
      enabled: !!trayTimerState,
      click: () => stopTimerFromTray()
    },
    ...recent,
    { type: 'separator' },
    { label: ru ? 'Выйти' : 'Quit', click: () => app.quit() }
  ]));
}

function initTray() {
  // macOS shows the timer as menu-bar text, so an empty image keeps it clean.
  // Windows and Linux need a real icon or the tray entry is invisible.
  // The icon is read by native code, which cannot look inside app.asar — the
  // build unpacks it, so point at the unpacked copy when running packaged.
  const iconFile = path.join(__dirname, 'icon.png').replace('app.asar', 'app.asar.unpacked');
  const trayImage = process.platform === 'darwin'
    ? nativeImage.createEmpty()
    : nativeImage.createFromPath(iconFile).resize({ width: 16, height: 16 });

  tray = new Tray(trayImage);
  tray.on('click', () => showMainWindow());
  rebuildTrayMenu();
  updateTrayTitle();

  ipcMain.on('timer:sync', (event, state) => setTrayTimerState(state));
}

function setTrayTimerState(state) {
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
}

function windowAlive() {
  return !!(mainWindow && !mainWindow.isDestroyed());
}

// Stop the timer from the tray: if the window is alive, stop via the renderer
// (single logic in store.js); if there's no window, main writes the log itself
// with the same rules (tray-utils.cjs).
function stopTimerFromTray() {
  if (windowAlive()) {
    mainWindow.webContents.send('timer:stop-request');
    return;
  }
  if (!trayTimerState) return;
  try {
    const state = JSON.parse(fs.readFileSync(dataFilePath(), 'utf8'));
    if (trayUtils.stopTimerOnState(state, Date.now())) {
      saveDataFile(JSON.stringify(state));
      refreshFromData(state);
    }
  } catch (e) {
    console.error('Tray stop failed:', e);
  }
  setTrayTimerState(null);
}

// Continue a task from the tray or the hotkey: the running timer is stopped
// first, exactly like the play button of today's list.
function startTaskFromTray(task) {
  const payload = {
    description: task.description || '',
    clientId: task.clientId || null,
    projectId: task.projectId || null,
    billable: task.billable !== undefined ? task.billable : true
  };
  if (windowAlive()) {
    mainWindow.webContents.send('timer:start-request', payload);
    return;
  }
  try {
    const raw = readDataFile();
    if (!raw) return;
    const state = JSON.parse(raw);
    trayUtils.startTimerOnState(state, payload, Date.now());
    saveDataFile(JSON.stringify(state));
    refreshFromData(state);
    setTrayTimerState(trayUtils.traySnapshot(state));
  } catch (e) {
    console.error('Tray start failed:', e);
  }
}

// --- Settings read from the data file, recent tasks, notifications ---
let reminderSettings = reminders.mergeReminderSettings({});
let appLanguage = 'en';
let recentTasksCache = [];
let dataRefreshTimer = null;
const liveNotifications = new Set();

// Re-reads what main needs from the data (a parsed state or its JSON).
function refreshFromData(data) {
  let state = data;
  if (typeof data === 'string' || data === null || data === undefined) {
    try {
      state = data ? JSON.parse(data) : null;
    } catch (e) {
      return;
    }
  }
  const settings = (state && state.settings) || {};
  reminderSettings = reminders.mergeReminderSettings(settings);
  appLanguage = settings.language === 'ru' ? 'ru' : 'en';
  recentTasksCache = state ? trayUtils.recentTasks(state, 5) : [];
  applyHotkey();
  rebuildTrayMenu();
}

// Saves come in bursts; parse the file once they settle.
function scheduleDataRefresh(json) {
  if (dataRefreshTimer) clearTimeout(dataRefreshTimer);
  dataRefreshTimer = setTimeout(() => {
    dataRefreshTimer = null;
    refreshFromData(json);
  }, 400);
}

function notify(title, body) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: false });
    // Keep a reference, otherwise the click handler can be collected.
    liveNotifications.add(n);
    const drop = () => liveNotifications.delete(n);
    n.on('click', () => {
      drop();
      showMainWindow();
    });
    n.on('close', drop);
    n.show();
    setTimeout(drop, 10 * 60000);
  } catch (e) {
    console.error('Notification failed:', e.message);
  }
}

// --- Global hotkey: stop the running timer, or continue the last task ---
let hotkeyRegistered = false;

function applyHotkey() {
  if (!app.isReady()) return;
  const want = reminderSettings.hotkeyEnabled;
  if (want && !hotkeyRegistered) {
    try {
      hotkeyRegistered = globalShortcut.register(reminders.HOTKEY, onHotkey);
      if (!hotkeyRegistered) console.error('Hotkey is taken by another app:', reminders.HOTKEY);
    } catch (e) {
      console.error('Hotkey registration failed:', e.message);
    }
  } else if (!want && hotkeyRegistered) {
    globalShortcut.unregister(reminders.HOTKEY);
    hotkeyRegistered = false;
  }
}

function onHotkey() {
  const lang = appLanguage;
  if (trayTimerState) {
    const desc = trayTimerState.description || reminders.mainText(lang, 'noDescription');
    const elapsed = formatTrayElapsed(trayTimerState);
    stopTimerFromTray();
    notify(reminders.mainText(lang, 'stoppedTitle'), `${desc} (${elapsed})`);
    return;
  }
  const last = recentTasksCache[0];
  if (!last) {
    notify(reminders.mainText(lang, 'nothingTitle'), reminders.mainText(lang, 'nothingBody'));
    return;
  }
  startTaskFromTray(last);
  notify(reminders.mainText(lang, 'startedTitle'), trayUtils.taskLabel(last, reminders.mainText(lang, 'noDescription')));
}

// --- Idle and sleep detection, reminders (work with the window closed) ---
const WATCH_INTERVAL_MS = 15000;
let idleState = reminders.createIdleState();
let pendingIdlePrompt = null;
let longTimerNotified = { key: null, level: 0 };
let noTimerSinceMs = null;
let lastWorkReminderMs = null;

function idleSeconds() {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch (e) {
    return 0;
  }
}

// The user is back from an absence: bring the window up and let the renderer
// ask what to do with the time (the store does the math).
function showIdlePrompt(prompt) {
  pendingIdlePrompt = prompt;
  if (windowAlive() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('idle:prompt', prompt);
  }
  showMainWindow();
}

function handleIdleStep(result) {
  idleState = result.state;
  if (result.prompt) showIdlePrompt(result.prompt);
}

function watchTick() {
  const nowMs = Date.now();
  const idle = idleSeconds();
  const timer = trayTimerState;

  handleIdleStep(reminders.idleTick(idleState, {
    nowMs, idleSeconds: idle, timer, idleMinutes: reminderSettings.idleMinutes
  }));

  // Long-running timer, once per period for the same timer.
  const key = timer ? (timer.originalStartTime || timer.description || 'timer') : null;
  if (key !== longTimerNotified.key) longTimerNotified = { key, level: 0 };
  const level = reminders.longTimerDue({
    timer, nowMs, hours: reminderSettings.longTimerHours, lastLevel: longTimerNotified.level
  });
  if (level) {
    longTimerNotified.level = level;
    const lang = appLanguage;
    const hours = reminders.mainText(lang, 'hours', { n: level * reminderSettings.longTimerHours });
    notify(
      reminders.mainText(lang, 'longTitle', { hours }),
      reminders.mainText(lang, 'longBody', { task: (timer && timer.description) || reminders.mainText(lang, 'noDescription') })
    );
  }

  // Nothing running during working hours.
  if (reminders.isRunning(timer)) {
    noTimerSinceMs = null;
  } else if (noTimerSinceMs === null) {
    noTimerSinceMs = nowMs;
  }
  if (reminders.workReminderDue({
    nowMs, work: reminderSettings.workReminder, timer, idleSeconds: idle,
    idleSinceMs: noTimerSinceMs, lastNotifiedMs: lastWorkReminderMs
  })) {
    lastWorkReminderMs = nowMs;
    notify(reminders.mainText(appLanguage, 'workTitle'), reminders.mainText(appLanguage, 'workBody'));
  }
}

function initWatchers() {
  const away = (kind) => () => handleIdleStep(reminders.idleSystemAway(idleState, {
    nowMs: Date.now(), timer: trayTimerState, idleMinutes: reminderSettings.idleMinutes, kind
  }));
  const back = (kind) => () => handleIdleStep(reminders.idleSystemBack(idleState, {
    nowMs: Date.now(), timer: trayTimerState, idleMinutes: reminderSettings.idleMinutes, kind
  }));
  try {
    powerMonitor.on('suspend', away('suspend'));
    powerMonitor.on('lock-screen', away('lock'));
    powerMonitor.on('resume', back('resume'));
    powerMonitor.on('unlock-screen', back('unlock'));
  } catch (e) {
    console.error('Power events unavailable:', e.message);
  }
  setInterval(watchTick, WATCH_INTERVAL_MS);
}

function initRemindersIpc() {
  // Settings changed in the renderer (it has saved the file already).
  ipcMain.on('settings:changed', () => refreshFromData(readDataFile()));
  ipcMain.on('idle:resolved', () => { pendingIdlePrompt = null; });
  ipcMain.handle('login-item:get', () => {
    try {
      return { ok: true, openAtLogin: app.getLoginItemSettings().openAtLogin };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('login-item:set', (_e, enabled) => {
    try {
      app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
      return { ok: true, openAtLogin: app.getLoginItemSettings().openAtLogin };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

// --- Serve static files via app:// (inside dist only, no server) ---
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
      // Hard-restrict paths to the dist root
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

// --- One-time localStorage migration from the old origin http://127.0.0.1:<port> ---
// Versions <= 1.2.x kept data in localStorage tied to the server port.
// Spin up that origin in a hidden window, read the data and move it to the file.
function migrateLegacyLocalStorage(done) {
  // Only macOS ever ran the versions that kept data in localStorage behind a
  // local HTTP server, so elsewhere there is nothing to migrate. It also uses a
  // throwaway window that would be the only open one during startup — closing
  // it fires 'window-all-closed', which quits the app off macOS.
  if (process.platform !== 'darwin' || fs.existsSync(dataFilePath())) {
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
    } catch (e) { /* use the default port */ }
  }

  const http = require('http');
  const distRoot = path.join(__dirname, 'dist');
  const server = http.createServer((req, res) => {
    // Minimal safe response: we only need a document with the right origin
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

  server.once('error', () => finish(null)); // port busy — nothing to migrate from
  server.listen(port, '127.0.0.1', () => {
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
    // Load an image, not index.html — same origin, but the app code does not run
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

  // Safety net against a hung migration
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
  // Open filling the whole usable screen area. workArea excludes the macOS
  // menu bar and Dock (and the Windows taskbar), so this is a normal maximized
  // window — not native fullscreen, which would hide those.
  const { workArea } = screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    minWidth: 900,
    minHeight: 600,
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

  mainWindowHasOpened = true;
  mainWindow.loadURL(url);

  // Pull cloud data right after the UI is ready, and only pull: nothing goes
  // up on launch. The renderer reloads itself when data actually arrives, so
  // it never keeps a stale copy in memory.
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingIdlePrompt && windowAlive()) {
      mainWindow.webContents.send('idle:prompt', pendingIdlePrompt);
    }
    if (!gdriveSync.isLoggedIn()) return;
    gdriveSync.sync(mainWindow, { silent: true, pullOnly: true }).catch(err => {
      console.error('[GDrive] Startup sync failed:', err);
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // On macOS closing the window keeps the app running in the menu bar, so
    // upload here too, otherwise a session could sit unsynced for days. The
    // upload steps aside if the cloud holds data this computer has not seen.
    if (gdriveSync.isLoggedIn()) {
      gdriveSync.push(null).catch(err => console.error('[GDrive] Close push failed:', err));
    }
  });
}

function initGDriveIpc() {
  gdriveSync.init({
    readLocal: readDataFile,
    writeLocal: saveDataFile,
    backupLocal: snapshotDataFile,
    localModified: () => {
      try {
        return fs.statSync(dataFilePath()).mtime.toISOString();
      } catch (e) {
        return null;
      }
    }
  });

  ipcMain.handle('gdrive:status', () => gdriveSync.getStatus());
  ipcMain.handle('gdrive:login', async () => await gdriveSync.login(mainWindow));
  ipcMain.handle('gdrive:logout', async () => await gdriveSync.logout(mainWindow));
  ipcMain.handle('gdrive:sync', async (_e, opts) => await gdriveSync.sync(mainWindow, {
    pullOnly: Boolean(opts && opts.pullOnly)
  }));
}

// --- Client report (PDF) ---
// The renderer builds the report HTML (src/client-report.js); here it is
// rendered in a hidden window with scripts off, printed to an A4 PDF with
// page numbers, and saved where the user chooses.
function initReportIpc() {
  ipcMain.handle('report:pdf', async (_e, html, suggestedName) => {
    if (typeof html !== 'string' || !html) return { ok: false, error: 'empty' };
    const safeName = String(suggestedName || 'Report.pdf').replace(/[\\/:*?"<>|]/g, ' ').trim() || 'Report.pdf';
    const tmpFile = path.join(app.getPath('temp'), `we-report-${Date.now()}-${process.pid}.html`);
    let win = null;
    try {
      fs.writeFileSync(tmpFile, html, 'utf8');
      win = new BrowserWindow({
        show: false,
        webPreferences: { javascript: false, contextIsolation: true, sandbox: true, nodeIntegration: false }
      });
      // The report is static: nothing in it may open or navigate anywhere.
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (event) => event.preventDefault());
      await win.loadFile(tmpFile);
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: '<div style="width:100%; font-size:8px; color:#9ca3af; text-align:center; font-family:Arial, sans-serif;">'
          + '<span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      });
      const result = await dialog.showSaveDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
        defaultPath: path.join(app.getPath('documents'), safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(result.filePath, pdf);
      return { ok: true, filePath: result.filePath };
    } catch (e) {
      console.error('Client report PDF failed:', e);
      return { ok: false, error: e.message };
    } finally {
      if (win && !win.isDestroyed()) win.destroy();
      try { fs.unlinkSync(tmpFile); } catch (e) { /* already gone */ }
    }
  });
}

app.whenReady().then(() => {
  // A leftover installer here means the previous update is finished (or was
  // abandoned) — either way the file is dead weight now.
  cleanupDownloadedUpdates();
  initStorageIpc();
  initUpdatesIpc();
  initGDriveIpc();
  initReportIpc();
  initRemindersIpc();
  // Settings, recent tasks and the hotkey come from the data file, so they
  // work before (and without) a window.
  refreshFromData(readDataFile());
  initWatchers();
  // A tray failure (a missing or unreadable icon on Windows, for instance)
  // must never prevent the main window from being created.
  try {
    initTray();
  } catch (e) {
    console.error('Tray unavailable:', e.message);
  }

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

// macOS: clicking the dock icon reopens the window
// (previously the app lingered with no way to reopen it after the window closed)
app.on('activate', () => {
  showMainWindow();
});

// Electron does not await async listeners on quit events, so the upload has to
// hold the quit open explicitly — otherwise the process dies mid-request and
// the last working session never reaches the cloud.
// The wait is capped: a slow or missing network must never trap the user in an
// app that refuses to close. Unsent data stays local and goes up on next sync.
const QUIT_UPLOAD_TIMEOUT_MS = 8000;
let pendingQuitUpload = false;
app.on('before-quit', (event) => {
  if (pendingQuitUpload || !gdriveSync.isLoggedIn()) return;
  event.preventDefault();
  pendingQuitUpload = true;

  const upload = gdriveSync.push(null)
    .catch(err => console.error('[GDrive] Quit push failed:', err));
  const deadline = new Promise(resolve => setTimeout(resolve, QUIT_UPLOAD_TIMEOUT_MS));

  Promise.race([upload, deadline]).then(() => app.quit());
});

app.on('window-all-closed', () => {
  if (viteProcess) {
    try {
      viteProcess.kill();
    } catch (e) { /* ignore */ }
  }
  // Off macOS, closing the last window quits the app — but during startup a
  // helper window can open and close before the main one exists, and quitting
  // then would kill the app before it ever showed anything.
  if (process.platform !== 'darwin' && mainWindowHasOpened) {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // By now the last upload is done or has timed out.
  updater.launchPendingInstaller();
  if (viteProcess) {
    try {
      viteProcess.kill();
    } catch (e) { /* ignore */ }
  }
});
