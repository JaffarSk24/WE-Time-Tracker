// Settings of the phone web app.

// OAuth client of type "Web application" in the Google Cloud project of the
// desktop app (we-time-tracker). It is not a secret: a web client id is
// visible in every page that uses it. The Pages workflow passes it in from
// the repository variable GOOGLE_WEB_CLIENT_ID; locally, put
// VITE_GOOGLE_WEB_CLIENT_ID=... into .env.local.
export const CLIENT_ID_PLACEHOLDER = 'SET-VITE_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com';

export const WEB_CLIENT_ID = (import.meta.env && import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID) || CLIENT_ID_PLACEHOLDER;

export function isClientConfigured(id = WEB_CLIENT_ID) {
  return Boolean(id) && id !== CLIENT_ID_PLACEHOLDER && /\.apps\.googleusercontent\.com$/.test(id);
}
