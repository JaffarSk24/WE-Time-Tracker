// Renders the phone app icons (public-web/) from assets/icon.svg. Unlike the
// desktop icon, these are full-bleed: the plate fills the whole square with
// no transparent margin, shadow or rounded corners, because iOS and Android
// round the corners themselves and paint any transparency white.
//   npx electron scripts/render-phone-icons.cjs
// A changed icon gets a new suffix (-vN) here, in manifest.webmanifest, web.html
// and PUBLIC_FILES: iOS keeps an icon per address, and a ?v= query did not
// make it take a new one. The files are 8-bit RGBA, as in WE Budget.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { encodeRgbaPng } = require('./png-rgba.cjs');

const root = path.join(__dirname, '..');
const PLATE = '#4C536D';
const source = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');

// The plate without margin and rounding, drawn on the given viewBox.
function fullBleed(viewBox, size) {
  return source
    .replace('width="1024" height="1024" viewBox="0 0 1024 1024"', `width="${size}" height="${size}" viewBox="${viewBox}"`)
    .replace('<rect x="100" y="100" width="824" height="824" rx="185" fill="#4C536D" filter="url(#tile-shadow)"/>',
      `<rect x="-200" y="-200" width="1424" height="1424" fill="${PLATE}"/>`)
    .replace('<rect x="100" y="100" width="824" height="824" rx="185"/>', '<rect x="-200" y="-200" width="1424" height="1424"/>')
    .replace('<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#tile-light)"/>',
      '<rect x="-200" y="-200" width="1424" height="1424" fill="url(#tile-light)"/>');
}

const FULL = '100 100 824 824';
const OUTPUTS = [
  { file: 'apple-touch-icon-v5.png', size: 180, viewBox: FULL },
  { file: 'icon-192-v5.png', size: 192, viewBox: FULL },
  { file: 'icon-512-v5.png', size: 512, viewBox: FULL }
];

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const { file, size, viewBox } of OUTPUTS) {
    const svg = fullBleed(viewBox, size);
    if (/rx="185"/.test(svg)) throw new Error('rounded plate left in ' + file);
    const win = new BrowserWindow({
      width: size, height: size, show: false, frame: false,
      backgroundColor: PLATE, webPreferences: { offscreen: true }
    });
    const html = `<html><body style="margin:0;background:${PLATE};overflow:hidden">${svg}</body></html>`;
    const tmp = path.join(app.getPath('temp'), `we-tracker-phone-icon-${size}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    await win.loadFile(tmp);
    await new Promise(r => setTimeout(r, 400));
    const captured = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    const image = captured.getSize().width === size
      ? captured
      : captured.resize({ width: size, height: size, quality: 'best' });
    // toBitmap() is BGRA; the plate is opaque, so alpha is always 255.
    const bgra = image.toBitmap();
    const rgba = Buffer.alloc(bgra.length);
    for (let i = 0; i < bgra.length; i += 4) {
      rgba[i] = bgra[i + 2];
      rgba[i + 1] = bgra[i + 1];
      rgba[i + 2] = bgra[i];
      rgba[i + 3] = 255;
    }
    fs.writeFileSync(path.join(root, 'public-web', file), encodeRgbaPng(size, size, rgba));
    console.log('wrote', file, image.getSize());
    win.destroy();
    fs.unlinkSync(tmp);
  }
  app.quit();
});
