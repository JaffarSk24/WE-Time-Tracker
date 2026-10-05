// Checks that a packaged build actually contains every file the main process
// requires. Version 1.8.0 shipped without gdrive-utils.cjs, which the build
// file list did not mention, and the app died on launch with "Cannot find
// module". Running from source never catches that: the file is right there.
//
//   node scripts/check-package.cjs
const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const root = path.join(__dirname, '..');
const bundles = [
  path.join(root, 'release', 'mac', 'WE Time Tracker.app', 'Contents', 'Resources', 'app.asar'),
  path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar')
];

// Everything the main process loads at runtime, plus the bundled OAuth client
// without which the sync section hides itself.
const required = fs.readdirSync(root)
  .filter(f => f.endsWith('.cjs'))
  .concat(['oauth-credentials.json', 'icon.png'])
  .filter(f => fs.existsSync(path.join(root, f)));

let failed = false;
bundles.forEach(bundle => {
  if (!fs.existsSync(bundle)) {
    console.log(`skipped (not built): ${path.relative(root, bundle)}`);
    return;
  }
  const inside = new Set(asar.listPackage(bundle).map(p => p.replace(/^[/\\]/, '')));
  const missing = required.filter(f => !inside.has(f));
  if (missing.length) {
    failed = true;
    console.error(`MISSING from ${path.relative(root, bundle)}: ${missing.join(', ')}`);
  } else {
    console.log(`ok: ${path.relative(root, bundle)} (${required.length} files)`);
  }
});

if (failed) {
  console.error('\nAdd the missing files to "build.files" in package.json before releasing.');
  process.exit(1);
}
