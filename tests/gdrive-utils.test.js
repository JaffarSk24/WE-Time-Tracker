import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { grantsDrive, isInsufficientScope, pendingSignIn, DRIVE_SCOPE } = require('../gdrive-utils.cjs');

describe('grantsDrive', () => {
  it('accepts a token that carries the Drive permission', () => {
    expect(grantsDrive(`${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`)).toBe(true);
  });

  it('rejects a sign-in where the Drive checkbox was left unticked', () => {
    expect(grantsDrive('https://www.googleapis.com/auth/userinfo.email openid')).toBe(false);
  });

  it('takes a response without a scope list at its word', () => {
    expect(grantsDrive('')).toBe(true);
    expect(grantsDrive(undefined)).toBe(true);
  });
});

describe('isInsufficientScope', () => {
  it('recognises the 403 Google sends when Drive access is missing', () => {
    const body = '{"error":{"code":403,"message":"Request had insufficient authentication scopes."}}';
    expect(isInsufficientScope(403, body)).toBe(true);
  });

  it('does not mistake other failures for a missing permission', () => {
    expect(isInsufficientScope(404, 'File not found')).toBe(false);
    expect(isInsufficientScope(403, 'The user has exceeded their quota')).toBe(false);
  });
});

describe('pendingSignIn', () => {
  it('asks for nothing while the account is connected', () => {
    expect(pendingSignIn({ signInNeeded: { reason: 'expired' } }, true)).toBeNull();
  });

  it('reports an expired session together with the account it belonged to', () => {
    const state = { signInNeeded: { reason: 'expired', email: 'a@b.com' } };
    expect(pendingSignIn(state, false)).toEqual({ reason: 'expired', email: 'a@b.com' });
  });

  it('reports a sign-in that never granted Drive access', () => {
    const state = { signInNeeded: { reason: 'drive_scope', email: 'a@b.com' } };
    expect(pendingSignIn(state, false)).toEqual({ reason: 'drive_scope', email: 'a@b.com' });
  });

  it('catches installs broken by an older version, which left only a sync record', () => {
    expect(pendingSignIn({ remoteModified: '2026-10-01T10:00:00Z' }, false)).toEqual({ reason: 'expired', email: '' });
    expect(pendingSignIn({ syncedHash: 'abc' }, false)).toEqual({ reason: 'expired', email: '' });
  });

  it('stays quiet after the user signed out on purpose', () => {
    const afterLogout = { signInNeeded: null, syncedHash: null, remoteModified: null };
    expect(pendingSignIn(afterLogout, false)).toBeNull();
  });

  it('stays quiet for someone who never turned sync on', () => {
    expect(pendingSignIn({}, false)).toBeNull();
    expect(pendingSignIn(null, false)).toBeNull();
  });
});
