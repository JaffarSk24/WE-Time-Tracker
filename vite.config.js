import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { URL } from 'url';
import { sharedCjs, webEntryAsIndex, serviceWorker } from './scripts/vite-web-plugins.js';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// The phone web app (npm run build:web), published at
// https://jaffarsk24.github.io/WE-Time-Tracker/app/
const WEB_BASE = '/WE-Time-Tracker/app/';

export default defineConfig(({ mode }) => {
  if (mode === 'web') {
    return {
      base: WEB_BASE,
      define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
      },
      // Icons and the manifest of the installable app; public/ stays the
      // desktop app's.
      publicDir: 'public-web',
      plugins: [sharedCjs(), webEntryAsIndex(WEB_BASE), serviceWorker(pkg.version)],
      build: {
        outDir: 'dist-web',
        emptyOutDir: true,
        rollupOptions: {
          input: 'web.html'
        }
      },
      server: {
        port: 3001,
        open: WEB_BASE
      }
    };
  }

  return {
    // App version comes from package.json — the single source of truth.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    build: {
      rollupOptions: {
        output: {
          // Code-split heavy vendors into their own chunks so the app code
          // loads and caches independently of Chart.js / Lucide.
          manualChunks: {
            chart: ['chart.js/auto'],
            icons: ['lucide']
          }
        }
      }
    },
    server: {
      port: 3000,
      open: true
    }
  };
});
