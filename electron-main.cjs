const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let viteProcess = null;
let mainWindow = null;

// --- Файловое хранилище данных пользователя ---
// JSON-файл в userData переживает переустановку приложения и обновление версий
// (в отличие от localStorage, привязанного к origin http://127.0.0.1:PORT).
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
      makeDailyBackup();
      // Атомарная запись: сначала во временный файл, затем rename.
      const tmp = dataFilePath() + '.tmp';
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, dataFilePath());
    } catch (e) {
      console.error('Failed to save data file:', e);
    }
  });
}

function createWindow(url) {
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
        require('electron').shell.openExternal(navigationUrl);
      }
    } catch (e) {
      console.error('Failed to parse URL in will-navigate:', e);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    try {
      const parsedUrl = new URL(openUrl);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        require('electron').shell.openExternal(openUrl);
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
    // In production build, we load the built static files via a lightweight HTTP server
    const http = require('http');
    const mime = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.webp': 'image/webp',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };

    const server = http.createServer((req, res) => {
      let filePath = path.join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'dist', 'index.html');
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });

    const portFile = path.join(app.getPath('userData'), 'port.txt');
    let savedPort = 39103;
    if (fs.existsSync(portFile)) {
      try {
        const fileContent = fs.readFileSync(portFile, 'utf8').trim();
        const parsed = parseInt(fileContent, 10);
        if (!isNaN(parsed) && parsed > 1024 && parsed < 65535) {
          savedPort = parsed;
        }
      } catch (e) {
        console.error('Failed to read saved port, using default', e);
      }
    }

    function listen(port) {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${port} in use, trying next...`);
          listen(port + 1);
        } else {
          console.error('Server error:', err);
        }
      });

      server.listen(port, '127.0.0.1', () => {
        const actualPort = server.address().port;
        try {
          fs.writeFileSync(portFile, actualPort.toString(), 'utf8');
        } catch (e) {
          console.error('Failed to save port to file', e);
        }
        createWindow(`http://127.0.0.1:${actualPort}`);
      });
    }

    listen(savedPort);
  }
});

app.on('window-all-closed', () => {
  if (viteProcess) {
    try {
      viteProcess.kill();
    } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (viteProcess) {
    try {
      viteProcess.kill();
    } catch (e) {}
  }
});
