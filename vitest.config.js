import { defineConfig } from 'vitest/config';
import { sharedCjs } from './scripts/vite-web-plugins.js';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test')
  },
  // The phone web app imports gdrive-utils.cjs as 'virtual:gdrive-utils'.
  plugins: [sharedCjs()],
  test: {
    setupFiles: ['./tests/setup.js']
  }
});
