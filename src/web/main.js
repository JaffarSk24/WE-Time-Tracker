// Entry of the phone web app (web.html, npm run build:web).
// Google's sign-in answer is handled first: in the sign-in window and in the
// silent renewal frame the app does not start at all.

import { handleAuthCallback } from './auth.js';

if (!handleAuthCallback()) {
  import('./app.js').then(({ startWebApp }) => startWebApp());
}
