import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DomainError } from '@/domain/errors';

export const STUDIO_MUTATION_SESSION_COOKIE = 'studio_mutation_session';
export const STUDIO_MUTATION_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const TOKEN_VERSION = 'v1';
const KEY_DOMAIN = 'daithienstudio:mutation-session:v1';

export interface StudioMutationPolicy {
  apiKey: string | null;
  hasNonOfflineProvider: boolean;
}

export interface StudioMutationCredentials {
  presentedKey?: string | null;
  sessionToken?: string | null;
  allowSession?: boolean;
}

export type StudioMutationAuthorization = 'open' | 'api-key' | 'session';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function secretEquals(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

function signingKey(apiKey: string): Buffer {
  return createHash('sha256').update(KEY_DOMAIN, 'utf8').update('\0').update(apiKey, 'utf8').digest();
}

function signature(payload: string, apiKey: string): string {
  return createHmac('sha256', signingKey(apiKey)).update(payload, 'utf8').digest('hex');
}

function unauthorized(message: string): never {
  throw new DomainError('UNAUTHORIZED', message);
}

export function issueStudioSession(
  apiKey: string,
  presentedKey: string,
  nowMs = Date.now(),
  nonce: Uint8Array = randomBytes(16),
): string {
  if (!apiKey || !secretEquals(presentedKey, apiKey)) {
    return unauthorized('The studio key is invalid.');
  }
  if (!Number.isSafeInteger(nowMs) || nonce.byteLength < 16) {
    throw new DomainError('VALIDATION_FAILED', 'The session request is invalid.');
  }
  const issuedAt = nowMs;
  const expiresAt = issuedAt + STUDIO_MUTATION_SESSION_TTL_MS;
  const payload = `${TOKEN_VERSION}.${issuedAt}.${expiresAt}.${Buffer.from(nonce).toString('hex')}`;
  return `${payload}.${signature(payload, apiKey)}`;
}

export function verifyStudioSession(token: string, apiKey: string, nowMs = Date.now()): boolean {
  if (!apiKey || !Number.isSafeInteger(nowMs)) return false;
  const parts = token.split('.');
  if (parts.length !== 5) return false;
  const version = parts[0]!;
  const issuedRaw = parts[1]!;
  const expiresRaw = parts[2]!;
  const nonceHex = parts[3]!;
  const actualSignature = parts[4]!;
  if (
    version !== TOKEN_VERSION ||
    !/^\d+$/.test(issuedRaw) ||
    !/^\d+$/.test(expiresRaw) ||
    !/^[a-f0-9]{32,128}$/.test(nonceHex) ||
    !/^[a-f0-9]{64}$/.test(actualSignature)
  ) return false;

  const issuedAt = Number(issuedRaw);
  const expiresAt = Number(expiresRaw);
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    issuedAt > nowMs ||
    expiresAt <= nowMs ||
    expiresAt - issuedAt !== STUDIO_MUTATION_SESSION_TTL_MS
  ) return false;

  const payload = parts.slice(0, 4).join('.');
  return secretEquals(actualSignature, signature(payload, apiKey));
}

export function authorizeStudioMutation(
  policy: StudioMutationPolicy,
  credentials: StudioMutationCredentials,
  nowMs = Date.now(),
): StudioMutationAuthorization {
  if (!policy.apiKey) {
    if (policy.hasNonOfflineProvider) {
      return unauthorized('Configure STUDIO_API_KEY before enabling a paid provider or accepting mutations.');
    }
    return 'open';
  }

  if (credentials.presentedKey != null) {
    if (secretEquals(credentials.presentedKey, policy.apiKey)) return 'api-key';
    return unauthorized('This mutation must present valid studio authorization.');
  }

  if (
    credentials.allowSession !== false &&
    credentials.sessionToken &&
    verifyStudioSession(credentials.sessionToken, policy.apiKey, nowMs)
  ) return 'session';

  return unauthorized('This mutation must present valid studio authorization.');
}
