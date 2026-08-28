import { describe, expect, it } from 'vitest';
import { canonical, type ContentHash } from '@/domain/visualControl/canonical';
import {
  approvedVersionRefCompact,
  parseVersionId,
  sortApprovedVersionRefs,
  type ApprovedVersionRef,
} from '@/domain/visualControl/approvedVersions';
import {
  continuityFingerprintContent,
  fingerprintContinuity,
} from '@/domain/visualControl/continuityFingerprint';
import { fingerprintVisualPackage } from '@/domain/visualControl/fingerprint';
import { deriveVisualControlState } from '@/domain/visualControl/derive';
import type { VisualControlEvidence, VisualPackageFingerprintInput } from '@/domain/visualControl/types';

/** Deterministic stand-in for sha256 — the domain contract only needs a ContentHash. */
function hash(content: string): string {
  let h = 2166136261;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h:${(h >>> 0).toString(16)}`;
}

function baseEvidence(overrides: Partial<VisualControlEvidence> = {}): VisualControlEvidence {
  return {
    projectId: 'project_1',
    projectSlug: 'trieu-ngoc-tap-thu-nghiem',
    shotId: 'shot_1',
    shotCode: 'EP01_SC01_SH001',
    shot: {
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      cameraMovement: { type: 'static', speed: 'medium' },
      lens: '50mm',
      durationSeconds: 5,
      lighting: 'day',
      importance: 'normal',
      dialogue: '',
      emotion: 'neutral',
      continuityIn: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] } },
      continuityOut: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] } },
      intentionalChanges: [],
    },
    sceneCode: 'SC01',
    neighbors: { previousShotCode: 'EP01_SC01_SH000', nextShotCode: null },
    pinnedReferences: [],
    approvedAnchors: [],
    approvedShotKeyframeAssetIds: [],
    prompts: { image: null, video: null },
    continuity: { findings: [], transitionNote: '' },
    shotAssets: [],
    bindings: [],
    outputProfile: { aspectRatio: '16:9', resolution: '1920x1080', frameRate: 30 },
    capability: { image: true, video: true },
    computedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function basePackageInput(overrides: Partial<VisualPackageFingerprintInput> = {}): VisualPackageFingerprintInput {
  return {
    shotVisualFields: {
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      cameraMovement: { type: 'static', speed: 'medium' },
      lens: '50mm',
      durationSeconds: 5,
      lighting: 'day',
      importance: 'normal',
      dialogue: '',
      emotion: 'neutral',
      continuityIn: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] } },
      continuityOut: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] } },
      intentionalChanges: [],
    },
    pinnedReferences: [],
    prompt: { image: null, video: null },
    assets: [],
    continuityFingerprint: [],
    outputProfile: { aspectRatio: '16:9', resolution: '1920x1080', frameRate: 30 },
    ...overrides,
  };
}

describe('canonical — deterministic serialization', () => {
  it('is identical for two objects with different key insertion order', () => {
    const a = { b: 1, a: [2, 1], c: { z: true, y: null } };
    const b = { c: { y: null, z: true }, a: [1, 2], b: 1 };
    expect(canonical(a)).toBe(canonical(b));
  });

  it('sorts arrays of primitives and arrays of objects by default', () => {
    expect(canonical(['beta', 'alpha'])).toBe(canonical(['alpha', 'beta']));
    expect(canonical([{ name: 'b' }, { name: 'a' }])).toBe(canonical([{ name: 'a' }, { name: 'b' }]));
  });

  it('preserves pre-sorted object arrays when sortObjectArrays is false', () => {
    const first = canonical([{ id: 'b' }, { id: 'a' }], { sortObjectArrays: false });
    const second = canonical([{ id: 'a' }, { id: 'b' }], { sortObjectArrays: false });
    expect(first).not.toBe(second);
  });

  it('drops undefined object values and preserves null', () => {
    const withUndefined = canonical({ keep: 'x', drop: undefined, nil: null });
    const withoutUndefined = canonical({ keep: 'x', nil: null });
    expect(withUndefined).toBe(withoutUndefined);
    expect(withUndefined).toContain('"nil":null');
  });

  it('normalises undefined inside arrays to null', () => {
    expect(canonical([undefined, 1])).toBe(canonical([null, 1]));
  });

  it('renders Dates as ISO strings', () => {
    expect(canonical(new Date('2026-01-01T00:00:00.000Z'))).toBe('"2026-01-01T00:00:00.000Z"');
  });
});

describe('ApprovedVersionRef — canonical tuple', () => {
  it('sorts by kind group, then code, then version number', () => {
    const refs: ApprovedVersionRef[] = [
      { kind: 'style', entityId: 's1', code: 'STY001', versionId: 'STY001_V1', versionNumber: 1 },
      { kind: 'character', entityId: 'c1', code: 'CHAR001', versionId: 'CHAR001_V2', versionNumber: 2 },
      { kind: 'character', entityId: 'c2', code: 'CHAR002', versionId: 'CHAR002_V1', versionNumber: 1 },
      { kind: 'prompt', entityId: 'p1', code: 'prompt_1', versionId: 'prompt_1@3', versionNumber: 3 },
    ];
    const sorted = sortApprovedVersionRefs([...refs].reverse());
    expect(sorted.map((ref) => ref.code)).toEqual(['CHAR001', 'CHAR002', 'prompt_1', 'STY001']);
  });

  it('has one canonical string representation per ref', () => {
    const a: ApprovedVersionRef = { kind: 'character', entityId: 'c1', code: 'CHAR001', versionId: 'CHAR001_V1', versionNumber: 1 };
    expect(approvedVersionRefCompact(a)).toBe('CHAR001_V1');
    const b: ApprovedVersionRef = { kind: 'prompt', entityId: 'p1', code: 'prompt_1', versionId: 'prompt_1@3', versionNumber: 3 };
    expect(approvedVersionRefCompact(b)).toBe('prompt_1@3');
  });

  it('parseVersionId accepts snapshot ids and prompt@version ids', () => {
    expect(parseVersionId('CHAR001_V2')).toEqual({ code: 'CHAR001', version: 2 });
    expect(parseVersionId('prompt_1@3')).toEqual({ code: 'prompt_1', version: 3 });
    expect(() => parseVersionId('not-a-version')).toThrow();
  });
});

describe('continuity fingerprint — stable content', () => {
  const findingA = {
    rule: 'char-state.consistency',
    severity: 'warning' as const,
    classification: 'missing-transition' as const,
    message: 'Costume changed from blue to red',
    field: 'characters.CHAR001.costume',
    expected: 'blue',
    actual: 'red',
    sceneCode: 'SC01',
    shotCodes: ['EP01_SC01_SH002', 'EP01_SC01_SH001'],
  };
  const findingB = { ...findingA, message: 'A totally different sentence' };

  it('excludes the raw message from the digest', () => {
    expect(continuityFingerprintContent([findingA], '')).toEqual(continuityFingerprintContent([findingB], ''));
    expect(fingerprintContinuity([findingA], '', hash)).toBe(fingerprintContinuity([findingB], '', hash));
  });

  it('produces the same digest for regenerated identical findings', () => {
    const regenerated = continuityFingerprintContent(
      [
        { ...findingA, shotCodes: ['EP01_SC01_SH001', 'EP01_SC01_SH002'] },
        { ...findingB, rule: 'environment.time', field: 'environment.time', expected: 'day', actual: 'night', classification: 'missing-transition', shotCodes: ['EP01_SC01_SH001'] },
      ],
      'note',
    );
    expect(regenerated).toHaveLength(2);
    const again = continuityFingerprintContent(
      [
        { ...findingB, rule: 'environment.time', field: 'environment.time', expected: 'day', actual: 'night', classification: 'missing-transition', shotCodes: ['EP01_SC01_SH001'] },
        { ...findingA, shotCodes: ['EP01_SC01_SH002', 'EP01_SC01_SH001'] },
      ],
      'note',
    );
    expect(regenerated).toEqual(again);
  });

  it('changes the digest when a missing-transition becomes an intentional-change', () => {
    const missing = fingerprintContinuity([findingA], '', hash);
    const intentional = fingerprintContinuity([{ ...findingA, classification: 'intentional-change' }], '', hash);
    expect(intentional).not.toBe(missing);
  });

  it('changes the digest when a transition note is added or removed', () => {
    const plain = fingerprintContinuity([findingA], '', hash);
    const noted = fingerprintContinuity([findingA], 'Directors chose the swap', hash);
    expect(noted).not.toBe(plain);
  });
});

describe('fingerprintVisualPackage — stable package digest', () => {
  const refA: ApprovedVersionRef = { kind: 'character', entityId: 'c1', code: 'CHAR001', versionId: 'CHAR001_V1', versionNumber: 1 };
  const refB: ApprovedVersionRef = { kind: 'location', entityId: 'l1', code: 'LOC001', versionId: 'LOC001_V2', versionNumber: 2 };
  const content = [
    { rule: 'char-state.consistency', classification: 'missing-transition' as const, severity: 'warning' as const, field: 'characters.CHAR001.costume', expected: 'blue', actual: 'red', shotCodes: ['EP01_SC01_SH002'], transitionNote: '' },
  ];
  const asset = { assetId: 'asset_1', role: 'identity-anchor' as const, targetType: 'character' as const, targetId: 'c1', approvalState: 'approved' as const };

  it('is order-insensitive for refs, assets and continuity content', () => {
    const first = fingerprintVisualPackage(
      basePackageInput({
        pinnedReferences: [refA, refB],
        assets: [asset],
        continuityFingerprint: content,
      }),
      hash,
    );
    const reversed = fingerprintVisualPackage(
      basePackageInput({
        pinnedReferences: [refB, refA],
        assets: [{ ...asset }],
        continuityFingerprint: content,
      }),
      hash,
    );
    expect(reversed).toBe(first);
  });

  it('changes when a shot visual field changes', () => {
    const base = fingerprintVisualPackage(basePackageInput(), hash);
    const changed = fingerprintVisualPackage(
      basePackageInput({ shotVisualFields: { ...basePackageInput().shotVisualFields, lighting: 'night' } }),
      hash,
    );
    expect(changed).not.toBe(base);
  });

  it('changes when an approved reference changes version', () => {
    const base = fingerprintVisualPackage(basePackageInput({ pinnedReferences: [refA] }), hash);
    const bumped = fingerprintVisualPackage(
      basePackageInput({ pinnedReferences: [{ ...refA, versionId: 'CHAR001_V2', versionNumber: 2 }] }),
      hash,
    );
    expect(bumped).not.toBe(base);
  });

  it('changes when the output profile changes', () => {
    const base = fingerprintVisualPackage(basePackageInput(), hash);
    const changed = fingerprintVisualPackage(basePackageInput({ outputProfile: { aspectRatio: '9:16', resolution: '1080x1920', frameRate: 30 } }), hash);
    expect(changed).not.toBe(base);
  });
});

describe('deriveVisualControlState — pure read model', () => {
  const evidence = baseEvidence({
    pinnedReferences: [
      { kind: 'character', refId: 'char_1', code: 'CHAR001', versionId: 'CHAR001_V1', source: 'shot-field', resolved: true, resolvableReason: null },
    ],
    approvedAnchors: [
      { kind: 'character', refId: 'char_1', snapshotId: 'CHAR001_V1', approvedAssetIds: ['asset_1'], role: 'identity-anchor' },
    ],
    prompts: {
      image: {
        kind: 'image',
        promptId: 'prompt_img_1',
        version: 3,
        compiled: 'shotSize:medium\nlens:50mm',
        negative: '',
        lint: { ok: true, score: 100, issues: [], characterCount: 1 },
        lockRefs: { characters: [{ id: 'char_1', code: 'CHAR001', version: 1 }], style: null, location: null, props: [] },
      },
      video: null,
    },
    continuity: {
      findings: [
        {
          rule: 'char-state.consistency',
          severity: 'warning',
          classification: 'missing-transition',
          message: 'Costume changed',
          field: 'characters.CHAR001.costume',
          expected: 'blue',
          actual: 'red',
          sceneCode: 'SC01',
          shotCodes: ['EP01_SC01_SH001'],
        },
      ],
      transitionNote: '',
    },
    shotAssets: [{ assetId: 'asset_1', kind: 'image', name: 'char.png', approvalState: 'approved' }],
    bindings: [
      { assetId: 'asset_1', targetType: 'character', targetId: 'char_1', targetVersionId: 'CHAR001_V1', role: 'identity-anchor', approvalState: 'approved' },
    ],
  });

  it('is deterministic: the same evidence derives to the same state', () => {
    const first = deriveVisualControlState(evidence, hash);
    const second = deriveVisualControlState(evidence, hash);
    expect(second).toEqual(first);
    expect(second.packageFingerprint).toBe(first.packageFingerprint);
  });

  it('carries the approved references and asset review state', () => {
    const state = deriveVisualControlState(evidence, hash);
    expect(state.approvedReferences).toEqual([
      { kind: 'character', refId: 'char_1', versionId: 'CHAR001_V1', approvedAssetIds: ['asset_1'], role: 'identity-anchor' },
    ]);
    expect(state.assets).toHaveLength(1);
    expect(state.assets[0]).toMatchObject({ assetId: 'asset_1', isRequiredReference: true, contributesToReadiness: true });
    expect(state.prompt.image).toMatchObject({ promptId: 'prompt_img_1', version: 3, lintOk: true });
    expect(state.continuity.blockers).toHaveLength(0);
  });

  it('changes the package fingerprint when a shot field changes', () => {
    const before = deriveVisualControlState(evidence, hash).packageFingerprint;
    const changed = deriveVisualControlState(
      baseEvidence({ ...evidence, shot: { ...evidence.shot, lighting: 'night' } }),
      hash,
    ).packageFingerprint;
    expect(changed).not.toBe(before);
  });

  it('changes the package fingerprint when a continuity finding changes', () => {
    const before = deriveVisualControlState(evidence, hash).packageFingerprint;
    const changedEvidence = baseEvidence({
      ...evidence,
      continuity: {
        ...evidence.continuity,
        findings: [{ ...evidence.continuity.findings[0]!, classification: 'intentional-change' }],
      },
    });
    const after = deriveVisualControlState(changedEvidence, hash);
    expect(after.continuity.fingerprint).not.toBe(
      deriveVisualControlState(evidence, hash).continuity.fingerprint,
    );
    expect(after.packageFingerprint).not.toBe(before);
  });

  it('changes the package fingerprint when a prompt version changes', () => {
    const before = deriveVisualControlState(evidence, hash).packageFingerprint;
    const bumped = baseEvidence({
      ...evidence,
      prompts: {
        ...evidence.prompts,
        image: { ...evidence.prompts.image!, version: 4 },
      },
    });
    expect(deriveVisualControlState(bumped, hash).packageFingerprint).not.toBe(before);
  });

  it('changes the package fingerprint when a bound asset approval changes', () => {
    const before = deriveVisualControlState(evidence, hash).packageFingerprint;
    const rejected = baseEvidence({
      ...evidence,
      bindings: evidence.bindings.map((binding) => ({ ...binding, approvalState: 'rejected' })),
      shotAssets: evidence.shotAssets.map((asset) => ({ ...asset, approvalState: 'rejected' })),
    });
    const after = deriveVisualControlState(rejected, hash);
    expect(after.packageFingerprint).not.toBe(before);
    expect(after.assets[0]).toMatchObject({ isRequiredReference: true, contributesToReadiness: false });
  });
});
