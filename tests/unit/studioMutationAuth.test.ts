import { describe, expect, it } from 'vitest';
import {
  STUDIO_MUTATION_SESSION_TTL_MS,
  authorizeStudioMutation,
  issueStudioSession,
  verifyStudioSession,
} from '@/infrastructure/security/studioMutationAuth';

const KEY = 'studio-key-visible-marker-1234567890';
const NOW_MS = Date.UTC(2026, 7, 10, 3, 0, 0);
const NONCE = Uint8Array.from(Buffer.from('00112233445566778899aabbccddeeff', 'hex'));

describe('studio mutation signed session', () => {
  it('issues a token that verifies with the signing key during its fixed lifetime', () => {
    const token = issueStudioSession(KEY, KEY, NOW_MS, NONCE);

    expect(verifyStudioSession(token, KEY, NOW_MS)).toBe(true);
    expect(verifyStudioSession(token, KEY, NOW_MS + STUDIO_MUTATION_SESSION_TTL_MS - 1)).toBe(true);
  });

  it('rejects expired and future-issued tokens', () => {
    const token = issueStudioSession(KEY, KEY, NOW_MS, NONCE);

    expect(verifyStudioSession(token, KEY, NOW_MS + STUDIO_MUTATION_SESSION_TTL_MS)).toBe(false);
    expect(verifyStudioSession(token, KEY, NOW_MS - 1)).toBe(false);
  });

  it('rejects a token whose payload or signature has been tampered with', () => {
    const token = issueStudioSession(KEY, KEY, NOW_MS, NONCE);
    const parts = token.split('.');
    const nonce = parts[3];
    const signature = parts[4];

    expect(parts).toHaveLength(5);
    expect(nonce).toBeDefined();
    expect(signature).toBeDefined();
    const tamperedNonce = `${nonce?.slice(0, -1)}${nonce?.endsWith('0') ? '1' : '0'}`;
    const tamperedSignature = `${signature?.slice(0, -1)}${signature?.endsWith('0') ? '1' : '0'}`;
    expect(verifyStudioSession(
      [...parts.slice(0, 3), tamperedNonce, signature].join('.'),
      KEY,
      NOW_MS,
    )).toBe(false);
    expect(verifyStudioSession(
      [...parts.slice(0, 4), tamperedSignature].join('.'),
      KEY,
      NOW_MS,
    )).toBe(false);
    expect(verifyStudioSession('not-a-session-token', KEY, NOW_MS)).toBe(false);
  });

  it('invalidates existing sessions when the configured key rotates', () => {
    const token = issueStudioSession(KEY, KEY, NOW_MS, NONCE);

    expect(verifyStudioSession(token, 'rotated-studio-key-0987654321', NOW_MS)).toBe(false);
  });

  it('does not embed the configured credential or a reversible credential encoding', () => {
    const token = issueStudioSession(KEY, KEY, NOW_MS, NONCE);
    const encodedKey = Buffer.from(KEY, 'utf8').toString('base64url');

    expect(token).not.toContain(KEY);
    expect(token).not.toContain(encodedKey);
    expect(Buffer.from(token, 'base64url').toString('utf8')).not.toContain(KEY);
  });

  it('refuses to issue a session when the presented credential is wrong', () => {
    expect(() => issueStudioSession(KEY, 'wrong-key', NOW_MS, NONCE)).toThrowError(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });
});

describe('studio mutation authorization policy', () => {
  it('permits only the explicit mock-only no-key development exception', () => {
    expect(authorizeStudioMutation(
      { apiKey: null, hasNonOfflineProvider: false },
      {},
      NOW_MS,
    )).toBe('open');
    expect(() => authorizeStudioMutation(
      { apiKey: null, hasNonOfflineProvider: true },
      {},
      NOW_MS,
    )).toThrowError(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('accepts a correct header and rejects missing or wrong configured-key credentials', () => {
    const policy = { apiKey: KEY, hasNonOfflineProvider: false };

    expect(authorizeStudioMutation(policy, { presentedKey: KEY }, NOW_MS)).toBe('api-key');
    expect(() => authorizeStudioMutation(policy, {}, NOW_MS))
      .toThrowError(expect.objectContaining({ code: 'UNAUTHORIZED' }));
    expect(() => authorizeStudioMutation(policy, { presentedKey: 'wrong-key' }, NOW_MS))
      .toThrowError(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('allows valid sessions only when the caller opts into the browser transport', () => {
    const token = issueStudioSession(KEY, KEY, NOW_MS, NONCE);
    const policy = { apiKey: KEY, hasNonOfflineProvider: false };

    expect(authorizeStudioMutation(policy, { sessionToken: token, allowSession: true }, NOW_MS)).toBe('session');
    expect(() => authorizeStudioMutation(policy, { sessionToken: token, allowSession: false }, NOW_MS))
      .toThrowError(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('does not fall back to a valid session after an explicit wrong header', () => {
    const token = issueStudioSession(KEY, KEY, NOW_MS, NONCE);

    expect(() => authorizeStudioMutation(
      { apiKey: KEY, hasNonOfflineProvider: false },
      { presentedKey: 'wrong-key', sessionToken: token, allowSession: true },
      NOW_MS,
    )).toThrowError(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });
});
