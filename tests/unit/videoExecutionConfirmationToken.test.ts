import { describe, expect, it } from 'vitest';
import {
  confirmVideoGenerationSchema,
  prepareVideoGenerationSchema,
} from '@/domain/schemas';
import { createImageExecutionConfirmationTokenService } from '@/application/services/imageExecutionConfirmation';
import {
  canonicalizeVideoExecutionConfirmationValue,
  createVideoExecutionConfirmationTokenService,
  fingerprintVideoExecutionCandidate,
} from '@/application/services/videoExecutionConfirmation';

describe('video execution confirmation token', () => {
  it('accepts only kind=video prepare requests', () => {
    expect(prepareVideoGenerationSchema.parse({
      projectId: 'project-1',
      kind: 'video',
      params: {},
      referenceAssetIds: [],
    }).kind).toBe('video');

    expect(() => prepareVideoGenerationSchema.parse({
      projectId: 'project-1',
      kind: 'image',
      params: {},
      referenceAssetIds: [],
    })).toThrow();
  });

  it('canonicalizes keys deterministically while preserving array order', () => {
    expect(canonicalizeVideoExecutionConfirmationValue({ b: 2, a: [2, 1] }))
      .toBe('{"a":[2,1],"b":2}');
    expect(fingerprintVideoExecutionCandidate({ a: 1, b: 2 }))
      .toBe(fingerprintVideoExecutionCandidate({ b: 2, a: 1 }));
  });

  it('issues exactly a five-minute video token and verifies it', () => {
    const now = Date.parse('2026-08-14T00:00:00.000Z');
    const service = createVideoExecutionConfirmationTokenService({
      apiKey: 'studio-test-key',
      nowMs: () => now,
    });
    const fingerprint = 'a'.repeat(64);
    const issued = service.issue(fingerprint);
    expect(Date.parse(issued.expiresAt) - now).toBe(5 * 60_000);
    expect(service.verify(issued.token)).toMatchObject({
      version: 1,
      kind: 'video',
      candidateFingerprint: fingerprint,
    });
  });

  it('rejects tampering, expiry, and an image token', () => {
    let now = Date.parse('2026-08-14T00:00:00.000Z');
    const video = createVideoExecutionConfirmationTokenService({
      apiKey: 'studio-test-key',
      nowMs: () => now,
    });
    const issued = video.issue('b'.repeat(64));
    expect(() => video.verify(`${issued.token}x`)).toThrow();

    const image = createImageExecutionConfirmationTokenService({
      apiKey: 'studio-test-key',
      nowMs: () => now,
    });
    expect(() => video.verify(image.issue('c'.repeat(64)).token)).toThrow();

    now += 5 * 60_000 + 1;
    expect(() => video.verify(issued.token)).toThrow();
  });

  it('requires a non-empty confirm token', () => {
    expect(() => confirmVideoGenerationSchema.parse({
      request: {
        projectId: 'project-1',
        kind: 'video',
        params: {},
        referenceAssetIds: [],
      },
      confirmationToken: '',
    })).toThrow();
  });
});
