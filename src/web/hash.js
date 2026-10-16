// SHA-256 of a text as hex, the same value as the desktop app's
// crypto.createHash('sha256').update(text).digest('hex').

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text || '');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
