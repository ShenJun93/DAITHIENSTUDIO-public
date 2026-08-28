import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VisualControlSection } from '@/components/visual-control/VisualControlSection';
import { VisualControlLoading } from '@/components/visual-control/VisualControlLoading';
import { VisualControlError } from '@/components/visual-control/VisualControlError';
import { BLOCKER_CODES, deriveReadinessEvidence } from '@/components/visual-control/readinessEvidence';
import type {
  AssetReviewState,
  PinnedReferenceState,
  PromptReviewState,
  VisualControlState,
} from '@/domain/visualControl/types';

Object.assign(globalThis, { React });

const imagePrompt: PromptReviewState = {
  kind: 'image',
  promptId: 'prompt_img_1',
  version: 3,
  compiled: 'A young girl at a window, soft morning light',
  negative: 'blurry, distorted',
  lintOk: true,
  lintScore: 92,
  lockRefs: {
    characters: [{ id: 'char_1', code: 'CHAR001', version: 1 }],
    style: null,
    location: null,
    props: [],
  },
};

const resolvedPin: PinnedReferenceState = {
  kind: 'character',
  refId: 'char_1',
  code: 'CHAR001',
  versionId: 'CHAR001_V1',
  source: 'shot-field',
  resolved: true,
  resolvableReason: null,
};

const unresolvedPin: PinnedReferenceState = {
  kind: 'character',
  refId: 'char_1',
  code: 'CHAR001',
  versionId: 'CHAR001_V1',
  source: 'shot-field',
  resolved: false,
  resolvableReason: 'MISSING_REFERENCE',
};

const approvedRequiredAsset: AssetReviewState = {
  assetId: 'asset_1',
  kind: 'image',
  name: 'anchor.png',
  approvalState: 'approved',
  boundRole: 'identity-anchor',
  isRequiredReference: true,
  contributesToReadiness: true,
};

const pendingRequiredAsset: AssetReviewState = {
  assetId: 'asset_1',
  kind: 'image',
  name: 'anchor.png',
  approvalState: 'pending',
  boundRole: 'identity-anchor',
  isRequiredReference: true,
  contributesToReadiness: false,
};

function makeState(overrides: Partial<VisualControlState> = {}): VisualControlState {
  const base: VisualControlState = {
    projectId: 'project_1',
    projectSlug: 'trieu-ngoc-tap-thu-nghiem',
    shotId: 'shot_1',
    shotCode: 'SHOT-001',
    visualSpec: {
      shotSize: 'medium',
      cameraAngle: 'low-angle',
      cameraMovement: { type: 'static', speed: 'static' },
      lens: '50mm',
      durationSeconds: 4,
      lighting: 'day',
      importance: 'key',
      dialogue: 'Con nhớ mẹ lắm.',
      emotion: 'yearning',
      continuityIn: {
        characters: {},
        environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] },
      },
      continuityOut: {
        characters: {},
        environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] },
      },
      intentionalChanges: [],
    },
    pinnedReferences: [],
    approvedReferences: [],
    prompt: {
      image: { kind: 'image', promptId: null, version: null, compiled: null, negative: null, lintOk: null, lintScore: null, lockRefs: null },
      video: { kind: 'video', promptId: null, version: null, compiled: null, negative: null, lintOk: null, lintScore: null, lockRefs: null },
    },
    assets: [],
    continuity: {
      previousShotCode: 'SHOT-000',
      nextShotCode: 'SHOT-002',
      findings: [],
      blockers: [],
      content: [],
      fingerprint: 'cont-0000',
    },
    packageFingerprint: 'aaaa0000',
  };
  return { ...base, ...overrides };
}

const completeState = makeState({
  pinnedReferences: [resolvedPin],
  approvedReferences: [
    { kind: 'character', refId: 'char_1', versionId: 'CHAR001_V1', approvedAssetIds: ['asset_1'], role: 'identity-anchor' },
  ],
  prompt: { ...makeState().prompt, image: imagePrompt },
  assets: [approvedRequiredAsset],
});

describe('deriveReadinessEvidence — pure readiness derivation', () => {
  it('reports an empty shot with no fabricated readiness', () => {
    const evidence = deriveReadinessEvidence(makeState());
    expect(evidence.hasContent).toBe(false);
    expect(evidence.completion).toBe('empty');
    expect(evidence.pins).toBeNull();
    expect(evidence.approvals).toBeNull();
    expect(evidence.execution).toBe('not-authorized');
    expect(evidence.blockers).toEqual([]);
    expect(evidence.presentation).toMatchObject({ tone: 'info', label: 'No visual control evidence' });
  });

  it('keeps evidence complete, approval and execution as distinct facts', () => {
    const evidence = deriveReadinessEvidence(completeState);
    expect(evidence.completion).toBe('complete');
    expect(evidence.pins).toBe('all-pinned');
    expect(evidence.approvals).toBe('approved');
    expect(evidence.continuity).toBe('clean');
    // Package evidence completeness remains distinct from VC8 package approval and provider execution authority.
    expect(evidence.execution).toBe('not-authorized');
    expect(evidence.blockers.map((blocker) => blocker.code)).toEqual([BLOCKER_CODES.EXECUTION_NOT_AUTHORIZED]);
    expect(evidence.presentation).toMatchObject({ tone: 'warning', label: 'Execution not authorized' });
  });

  it('surfaces an unresolved pin as the first NOT_READY reason', () => {
    const evidence = deriveReadinessEvidence(makeState({ pinnedReferences: [unresolvedPin] }));
    expect(evidence.pins).toBe('unresolved');
    expect(evidence.completion).toBe('partial');
    expect(evidence.blockers.map((blocker) => blocker.code)).toContain(BLOCKER_CODES.BLOCKED_PIN);
    expect(evidence.presentation).toMatchObject({ tone: 'blocked', label: 'Unresolved reference pin' });
  });

  it('flags a missing compiled prompt as a NOT_READY reason', () => {
    const evidence = deriveReadinessEvidence(makeState({ pinnedReferences: [resolvedPin] }));
    expect(evidence.blockers.some((blocker) => blocker.code === BLOCKER_CODES.PROMPT_MISSING)).toBe(true);
  });

  it('flags a required reference asset that is not yet approved', () => {
    const evidence = deriveReadinessEvidence(
      makeState({
        pinnedReferences: [resolvedPin],
        prompt: { ...makeState().prompt, image: imagePrompt },
        assets: [pendingRequiredAsset],
      }),
    );
    expect(evidence.approvals).toBe('missing-approval');
    expect(evidence.blockers.some((blocker) => blocker.code === BLOCKER_CODES.APPROVAL_PENDING)).toBe(true);
  });

  it('surfaces continuity blockers as a NOT_READY reason', () => {
    const evidence = deriveReadinessEvidence(
      makeState({
        pinnedReferences: [resolvedPin],
        prompt: { ...makeState().prompt, image: imagePrompt },
        assets: [approvedRequiredAsset],
        continuity: {
          previousShotCode: 'SHOT-000',
          nextShotCode: 'SHOT-002',
          findings: [],
          blockers: [
            {
              rule: 'environment-continuity',
              severity: 'error',
              classification: 'continuity-violation',
              message: 'Lighting jumps from day to night.',
              field: 'lighting',
              expected: 'day',
              actual: 'night',
              sceneCode: 'SCENE-001',
              shotCodes: ['SHOT-001'],
            },
          ],
          content: [],
          fingerprint: 'cont-0001',
        },
      }),
    );
    expect(evidence.continuity).toBe('blocked');
    expect(evidence.blockers.some((blocker) => blocker.code === BLOCKER_CODES.CONTINUITY_BLOCKED)).toBe(true);
    expect(evidence.presentation).toMatchObject({ tone: 'blocked', label: 'Continuity blocker' });
  });

  it('is a pure function of the read model: same input, same output', () => {
    expect(deriveReadinessEvidence(completeState)).toEqual(deriveReadinessEvidence(completeState));
  });
});

const sectionMarkup = (state: VisualControlState) =>
  renderToStaticMarkup(React.createElement(VisualControlSection, { shotCode: 'SHOT-001', state }));

describe('VisualControlSection — evidence shell with bounded VC8 package approval', () => {
  it('operator can see shot visual readiness from the Readiness strip', () => {
    const html = sectionMarkup(completeState);
    expect(html).toContain('Visual Control');
    expect(html).toContain('Evidence complete');
    expect(html).toContain('All pinned');
    expect(html).toContain('References approved');
    expect(html).toContain('Continuity clean');
    expect(html).toContain('Execution pending');
    expect(html).toContain('Execution not authorized');
    expect(html).toContain('no render approval (VC8) is recorded yet');
  });

  it('operator can see the prompt for the exact shot, with exact versions', () => {
    const html = sectionMarkup(completeState);
    expect(html).toContain('Prompt versions');
    expect(html).toContain('v3');
    expect(html).toContain('prompt_img_1');
    expect(html).toContain('A young girl at a window, soft morning light');
    expect(html).toContain('lint ok');
  });

  it('operator can see the reason each shot is not ready', () => {
    const state = makeState({ pinnedReferences: [unresolvedPin] });
    const html = sectionMarkup(state);
    expect(html).toContain('Unresolved reference pin');
    expect(html).toContain('BLOCKED_PIN');
    expect(html).toContain('character pin char_1 cannot be resolved');
    expect(html).toContain('PROMPT_MISSING');
  });

  it('renders every package evidence summary and the exact VC8 decision fingerprint', () => {
    const html = sectionMarkup(completeState);
    expect(html).toContain('Shot visual specification');
    expect(html).toContain('low-angle');
    expect(html).toContain('Pinned references');
    expect(html).toContain('CHAR001_V1');
    expect(html).toContain('Bound assets');
    expect(html).toContain('anchor.png');
    expect(html).toContain('Visual continuity');
    expect(html).toContain('SHOT-000');
    expect(html).toContain('Visual package approval');
    expect(html).toContain('Decision target:');
    expect(html).toContain('aaaa0000');
  });

  it('keeps evidence read-only while exposing only the bounded VC8 package-decision controls', () => {
    const html = sectionMarkup(completeState);
    expect(html).toContain('Approve visual package');
    expect(html).toContain('Request changes');
    expect(html).toContain('Reject package');
    expect(html).toContain('Refresh approval state');
    expect(html).toContain('<textarea');
    expect(html).not.toMatch(/<form/);
    expect(html).not.toMatch(/<input/);
    expect(html).not.toMatch(/<select/);
    // Native details interaction remains available for evidence inspection.
    expect(html).toContain('<details');
  });

  it('renders the loading skeleton with a busy, labelled state', () => {
    const html = renderToStaticMarkup(React.createElement(VisualControlLoading));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading Visual Control');
  });

  it('renders the error state read-only when the read model cannot be gathered', () => {
    const html = renderToStaticMarkup(
      React.createElement(VisualControlError, { reason: 'Not a supported version id: "SE-CHAR-1_V1"' }),
    );
    expect(html).toContain('Visual Control');
    expect(html).toContain('Visual control evidence unavailable');
    expect(html).toContain('Not a supported version id');
    expect(html).toContain('SE-CHAR-1_V1');
    expect(html).not.toMatch(/<button/);
    expect(html).not.toMatch(/<form/);
  });
});
