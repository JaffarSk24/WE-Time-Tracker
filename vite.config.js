import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { URL } from 'url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
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
});
