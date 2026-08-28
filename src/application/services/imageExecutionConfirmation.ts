import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { DomainError } from '@/domain/errors';

const CONFIRMATION_VERSION = 1 as const;
const CONFIRMATION_KIND = 'image' as const;
const CONFIRMATION_TTL_MS = 5 * 60_000;
const KEY_DOMAIN = 'daithienstudio:image-execution-confirmation:v1';
const OFFLINE_PROCESS_SECRET = randomBytes(32);

export interface ImageExecutionConfirmationPayload {
  version: typeof CONFIRMATION_VERSION;
  kind: typeof CONFIRMATION_KIND;
  candidateFingerprint: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface ImageExecutionConfirmationTokenServiceOptions {
  apiKey?: string | null;
  nowMs?: () => number;
}

function invalidConfirmation(message = 'Image execution confirmation is invalid.'): DomainError {
  return new DomainError('CONFIRMATION_INVALID', message);
}

function normalizeCanonicalValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalidConfirmation('Image execution confirmation contains a non-finite number.');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : normalizeCanonicalValue(entry)));
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(objectValue).sort()) {
      const entry = objectValue[key];
      if (entry === undefined) continue;
      normalized[key] = normalizeCanonicalValue(entry);
    }
    return normalized;
  }

  throw invalidConfirmation('Image execution confirmation contains an unsupported value.');
}

export function canonicalizeImageExecutionConfirmationValue(value: unknown): string {
  return JSON.stringify(normalizeCanonicalValue(value));
}

export function fingerprintImageExecutionCandidate(candidate: unknown): string {
  return createHash('sha256')
    .update(canonicalizeImageExecutionConfirmationValue(candidate), 'utf8')
    .digest('hex');
}

function deriveSigningKey(apiKey?: string | null): Buffer {
  const configured = apiKey?.trim();
  const source = configured ? Buffer.from(configured, 'utf8') : OFFLINE_PROCESS_SECRET;
  return createHmac('sha256', source).update(KEY_DOMAIN, 'utf8').digest();
}

function decodePayload(payloadPart: string): unknown {
  try {
    const json = Buffer.from(payloadPart, 'base64url').toString('utf8');
    return JSON.parse(json) as unknown;
  } catch {
    throw invalidConfirmation();
  }
}

function validatePayload(value: unknown, nowMs: number): ImageExecutionConfirmationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidConfirmation();
  }

  const payload = value as Record<string, unknown>;
  if (payload.version !== CONFIRMATION_VERSION || payload.kind !== CONFIRMATION_KIND) {
    throw invalidConfirmation();
  }
  if (
    typeof payload.candidateFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(payload.candidateFingerprint) ||
    typeof payload.issuedAt !== 'string' ||
    typeof payload.expiresAt !== 'string' ||
    typeof payload.nonce !== 'string' ||
    payload.nonce.length === 0
  ) {
    throw invalidConfirmation();
  }

  const issuedAtMs = Date.parse(payload.issuedAt);
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    issuedAtMs > nowMs ||
    expiresAtMs - issuedAtMs !== CONFIRMATION_TTL_MS
  ) {
    throw invalidConfirmation();
  }

  if (nowMs > expiresAtMs) {
    throw new DomainError('CONFIRMATION_EXPIRED', 'Image execution confirmation has expired.');
  }

  return {
    version: CONFIRMATION_VERSION,
    kind: CONFIRMATION_KIND,
    candidateFingerprint: payload.candidateFingerprint,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
  };
}

export function createImageExecutionConfirmationTokenService(
  options: ImageExecutionConfirmationTokenServiceOptions = {},
) {
  const signingKey = deriveSigningKey(options.apiKey);
  const nowMs = options.nowMs ?? Date.now;

  return {
    issue(candidateFingerprint: string): { token: string; expiresAt: string } {
      if (!/^[a-f0-9]{64}$/.test(candidateFingerprint)) {
        throw invalidConfirmation('Image execution candidate fingerprint is invalid.');
      }

      const issuedAtMs = nowMs();
      const payload: ImageExecutionConfirmationPayload = {
        version: CONFIRMATION_VERSION,
        kind: CONFIRMATION_KIND,
        candidateFingerprint,
        issuedAt: new Date(issuedAtMs).toISOString(),
        expiresAt: new Date(issuedAtMs + CONFIRMATION_TTL_MS).toISOString(),
        nonce: randomBytes(16).toString('base64url'),
      };
      const payloadPart = Buffer.from(
        canonicalizeImageExecutionConfirmationValue(payload),
        'utf8',
      ).toString('base64url');
      const signaturePart = createHmac('sha256', signingKey)
        .update(payloadPart, 'utf8')
        .digest('base64url');

      return {
        token: `${payloadPart}.${signaturePart}`,
        expiresAt: payload.expiresAt,
      };
    },

    verify(token: string): ImageExecutionConfirmationPayload {
      if (typeof token !== 'string') throw invalidConfirmation();
      const parts = token.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw invalidConfirmation();

      const [payloadPart, signaturePart] = parts;
      const expectedSignature = createHmac('sha256', signingKey)
        .update(payloadPart, 'utf8')
        .digest();

      let suppliedSignature: Buffer;
      try {
        suppliedSignature = Buffer.from(signaturePart, 'base64url');
      } catch {
        throw invalidConfirmation();
      }

      if (
        suppliedSignature.toString('base64url') !== signaturePart ||
        suppliedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(suppliedSignature, expectedSignature)
      ) {
        throw invalidConfirmation();
      }

      return validatePayload(decodePayload(payloadPart), nowMs());
    },
  };
}
