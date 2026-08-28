import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeImageExecutionConfirmationValue,
  createImageExecutionConfirmationTokenService,
  fingerprintImageExecutionCandidate,
} from '@/application/services/imageExecutionConfirmation';
import { createVideoExecutionConfirmationTokenService } from '@/application/services/videoExecutionConfirmation';

const BASE_TIME_MS = Date.UTC(2026, 7, 13, 12, 45, 0);
const TEST_API_KEY = 'test-studio-key';
const KEY_DOMAIN = 'daithienstudio:image-execution-confirmation:v1';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    projectId: 'prj_safe_image',
    productionType: 'motion-comic',
    projectStatus: 'production',
    shotId: 'shot_001',
    promptId: 'prompt_001',
    promptVersion: 3,
    kind: 'image',
    provider: 'mock',
    model: 'mock-image-v1',
    prompt: 'A paper lantern on a stone table, cinematic still.',
    negativePrompt: 'watermark',
    seed: 42,
    params: {
      count: 1,
      nested: { strength: 0.8, mode: 'reference' },
    },
    referenceAssetIds: ['asset_a', 'asset_b'],
    priority: 50,
    estimatedCostUsd: 0,
    warnings: ['CONTINUITY_WARN: eye line differs'],
    ...overrides,
  };
}

function expectDomainCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error(`Expected DomainError ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

function decodePayload(token: string): Record<string, unknown> {
  const [payloadPart] = token.split('.');
  return JSON.parse(Buffer.from(payloadPart!, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function signPayload(payload: Record<string, unknown>, apiKey = TEST_API_KEY): string {
  const signingKey = createHmac('sha256', Buffer.from(apiKey, 'utf8'))
    .update(KEY_DOMAIN, 'utf8')
    .digest();
  const payloadPart = Buffer.from(
    canonicalizeImageExecutionConfirmationValue(payload),
    'utf8',
  ).toString('base64url');
  const signaturePart = createHmac('sha256', signingKey)
    .update(payloadPart, 'utf8')
    .digest('base64url');
  return `${payloadPart}.${signaturePart}`;
}

describe('image execution confirmation token', () => {
  it('canonicalizes recursively reordered object keys identically', () => {
    const left = {
      z: 9,
      nested: { b: 2, a: 1 },
      params: { count: 1, options: { beta: true, alpha: false } },
    };
    const right = {
      params: { options: { alpha: false, beta: true }, count: 1 },
      nested: { a: 1, b: 2 },
      z: 9,
    };

    expect(canonicalizeImageExecutionConfirmationValue(left)).toBe(
      canonicalizeImageExecutionConfirmationValue(right),
    );
  });

  it('keeps array order semantically significant', () => {
    const first = fingerprintImageExecutionCandidate(
      candidate({ referenceAssetIds: ['asset_a', 'asset_b'] }),
    );
    const second = fingerprintImageExecutionCandidate(
      candidate({ referenceAssetIds: ['asset_b', 'asset_a'] }),
    );

    expect(first).not.toBe(second);
  });

  it('changes the fingerprint when one bound execution field changes', () => {
    const original = fingerprintImageExecutionCandidate(candidate());
    const changed = fingerprintImageExecutionCandidate(candidate({ model: 'mock-image-v2' }));

    expect(original).not.toBe(changed);
  });

  it('issues a five-minute image token and verifies it with the same signing authority', () => {
    const tokenService = createImageExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS,
    });
    const candidateFingerprint = fingerprintImageExecutionCandidate(candidate());

    const issued = tokenService.issue(candidateFingerprint);
    const verified = tokenService.verify(issued.token);

    expect(issued.expiresAt).toBe(new Date(BASE_TIME_MS + 5 * 60_000).toISOString());
    expect(verified).toMatchObject({
      version: 1,
      kind: 'image',
      candidateFingerprint,
      issuedAt: new Date(BASE_TIME_MS).toISOString(),
      expiresAt: new Date(BASE_TIME_MS + 5 * 60_000).toISOString(),
    });
    expect(verified.nonce).toEqual(expect.any(String));
    expect(verified.nonce.length).toBeGreaterThan(0);
  });

  it('rejects token tampering as CONFIRMATION_INVALID', () => {
    const tokenService = createImageExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS,
    });
    const issued = tokenService.issue(fingerprintImageExecutionCandidate(candidate()));
    const last = issued.token.at(-1) ?? '';
    const tampered = `${issued.token.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;

    expectDomainCode(() => tokenService.verify(tampered), 'CONFIRMATION_INVALID');
  });

  it('rejects a correctly signed token with the wrong schema version', () => {
    const tokenService = createImageExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS,
    });
    const issued = tokenService.issue(fingerprintImageExecutionCandidate(candidate()));
    const payload = decodePayload(issued.token);

    expectDomainCode(
      () => tokenService.verify(signPayload({ ...payload, version: 2 })),
      'CONFIRMATION_INVALID',
    );
  });

  it('rejects a correctly signed token for a non-image kind', () => {
    const tokenService = createImageExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS,
    });
    const issued = tokenService.issue(fingerprintImageExecutionCandidate(candidate()));
    const payload = decodePayload(issued.token);

    expectDomainCode(
      () => tokenService.verify(signPayload({ ...payload, kind: 'video' })),
      'CONFIRMATION_INVALID',
    );
  });

  it('rejects a video token signed with the same studio authority', () => {
    const image = createImageExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS,
    });
    const video = createVideoExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS,
    });
    const videoToken = video.issue('d'.repeat(64)).token;

    expectDomainCode(() => image.verify(videoToken), 'CONFIRMATION_INVALID');
  });

  it('rejects a correctly signed token whose issuedAt is in the future', () => {
    const tokenService = createImageExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS,
    });
    const issued = tokenService.issue(fingerprintImageExecutionCandidate(candidate()));
    const payload = decodePayload(issued.token);
    const futureIssuedAt = BASE_TIME_MS + 1;

    expectDomainCode(
      () =>
        tokenService.verify(
          signPayload({
            ...payload,
            issuedAt: new Date(futureIssuedAt).toISOString(),
            expiresAt: new Date(futureIssuedAt + 5 * 60_000).toISOString(),
          }),
        ),
      'CONFIRMATION_INVALID',
    );
  });

  it('rejects a correctly signed token with an impossible TTL interval', () => {
    const tokenService = createImageExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS,
    });
    const issued = tokenService.issue(fingerprintImageExecutionCandidate(candidate()));
    const payload = decodePayload(issued.token);

    expectDomainCode(
      () =>
        tokenService.verify(
          signPayload({
            ...payload,
            expiresAt: new Date(BASE_TIME_MS + 60_000).toISOString(),
          }),
        ),
      'CONFIRMATION_INVALID',
    );
  });

  it('rejects a token issued by a different studio signing authority', () => {
    const issuer = createImageExecutionConfirmationTokenService({
      apiKey: 'studio-key-a',
      nowMs: () => BASE_TIME_MS,
    });
    const verifier = createImageExecutionConfirmationTokenService({
      apiKey: 'studio-key-b',
      nowMs: () => BASE_TIME_MS,
    });
    const issued = issuer.issue(fingerprintImageExecutionCandidate(candidate()));

    expectDomainCode(() => verifier.verify(issued.token), 'CONFIRMATION_INVALID');
  });

  it('reports expiry distinctly from an invalid signature', () => {
    const issuer = createImageExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS,
    });
    const verifierAfterExpiry = createImageExecutionConfirmationTokenService({
      apiKey: TEST_API_KEY,
      nowMs: () => BASE_TIME_MS + 5 * 60_000 + 1,
    });
    const issued = issuer.issue(fingerprintImageExecutionCandidate(candidate()));

    expectDomainCode(() => verifierAfterExpiry.verify(issued.token), 'CONFIRMATION_EXPIRED');
  });

  it('uses one process-local offline signing secret across helper instances', () => {
    const issuer = createImageExecutionConfirmationTokenService({ nowMs: () => BASE_TIME_MS });
    const verifier = createImageExecutionConfirmationTokenService({ nowMs: () => BASE_TIME_MS });
    const issued = issuer.issue(fingerprintImageExecutionCandidate(candidate()));

    expect(verifier.verify(issued.token)).toMatchObject({
      version: 1,
      kind: 'image',
      candidateFingerprint: fingerprintImageExecutionCandidate(candidate()),
    });
  });
});
