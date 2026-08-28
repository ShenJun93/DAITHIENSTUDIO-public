import { describe, expect, it } from 'vitest';
import {
  continuityFingerprintContent,
  fingerprintContinuity,
} from '@/domain/visualControl/continuityFingerprint';

/** Deterministic stand-in for sha256; the domain contract only requires stable hashing. */
function hash(content: string): string {
  let h = 2166136261;
  for (let i = 0; i < content.length; i += 1) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h:${(h >>> 0).toString(16)}`;
}

const finding = {
  rule: 'character-costume-change',
  severity: 'warning' as const,
  classification: 'missing-transition' as const,
  message: 'Presentation text A',
  field: 'CHAR001.costume',
  expected: 'blue',
  actual: 'red',
  sceneCode: 'SC01',
  shotCodes: ['SHOT-002', 'SHOT-001'],
};

const collision = {
  ...finding,
  message: 'Presentation text B',
  expected: 'green',
  actual: 'black',
  shotCodes: ['SHOT-004', 'SHOT-003'],
};

describe('VC6 continuity fingerprint contract', () => {
  it('is invariant to finding order even when rule and field collide', () => {
    const forward = continuityFingerprintContent([finding, collision], 'operator note');
    const reversed = continuityFingerprintContent([collision, finding], 'operator note');

    expect(reversed).toEqual(forward);
    expect(fingerprintContinuity([collision, finding], 'operator note', hash)).toBe(
      fingerprintContinuity([finding, collision], 'operator note', hash),
    );
  });

  it('is invariant to shotCodes order', () => {
    const reversedCodes = { ...finding, shotCodes: [...finding.shotCodes].reverse() };

    expect(continuityFingerprintContent([reversedCodes], '')).toEqual(
      continuityFingerprintContent([finding], ''),
    );
    expect(fingerprintContinuity([reversedCodes], '', hash)).toBe(
      fingerprintContinuity([finding], '', hash),
    );
  });

  it('normalizes exactly the decision-relevant canonical members', () => {
    expect(continuityFingerprintContent([finding], '  operator note  ')).toEqual([
      {
        rule: 'character-costume-change',
        classification: 'missing-transition',
        severity: 'warning',
        field: 'CHAR001.costume',
        expected: 'blue',
        actual: 'red',
        shotCodes: ['SHOT-001', 'SHOT-002'],
        transitionNote: '  operator note  ',
      },
    ]);
  });

  it('does not make presentation message or derived sceneCode part of fingerprint identity', () => {
    const presentationOnlyChange = {
      ...finding,
      message: 'A different human-readable sentence',
      sceneCode: 'DERIVED-SCENE-LABEL',
    };

    expect(continuityFingerprintContent([presentationOnlyChange], '')).toEqual(
      continuityFingerprintContent([finding], ''),
    );
    expect(fingerprintContinuity([presentationOnlyChange], '', hash)).toBe(
      fingerprintContinuity([finding], '', hash),
    );
  });

  it.each([
    ['rule', { rule: 'character-hair-change' }],
    ['classification', { classification: 'intentional-change' as const }],
    ['severity', { severity: 'error' as const }],
    ['field', { field: 'CHAR001.hair' }],
    ['expected', { expected: 'short' }],
    ['actual', { actual: 'long' }],
    ['shotCodes', { shotCodes: ['SHOT-001', 'SHOT-003'] }],
  ])('changes fingerprint when decision-relevant %s changes', (_name, change) => {
    expect(fingerprintContinuity([{ ...finding, ...change }], '', hash)).not.toBe(
      fingerprintContinuity([finding], '', hash),
    );
  });

  it('changes fingerprint when transition-note evidence changes', () => {
    expect(fingerprintContinuity([finding], 'intentional transition', hash)).not.toBe(
      fingerprintContinuity([finding], '', hash),
    );
  });

  it('is deterministic and does not mutate input findings or shotCodes', () => {
    const input = [{ ...finding, shotCodes: [...finding.shotCodes] }, { ...collision, shotCodes: [...collision.shotCodes] }];
    const before = structuredClone(input);

    const first = fingerprintContinuity(input, 'operator note', hash);
    const second = fingerprintContinuity(input, 'operator note', hash);

    expect(second).toBe(first);
    expect(input).toEqual(before);
  });
});
