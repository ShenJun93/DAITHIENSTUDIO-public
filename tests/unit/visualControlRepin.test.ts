import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VisualControlSection } from '@/components/visual-control/VisualControlSection';
import { PinnedReferencesSummary } from '@/components/visual-control/PinnedReferencesSummary';
import { ProjectStyleReview } from '@/components/visual-control/ProjectStyleReview';
import { ReferenceRepinControl } from '@/components/visual-control/ReferenceRepinControl';
import {
  buildVersionOptions,
  isRepinChange,
  isWellFormedVersionId,
  pendingRepinText,
  shouldConfirmRepin,
  type RepinData,
} from '@/components/visual-control/visualControlRepin';
import type {
  ApprovedReferenceState,
  PinnedReferenceState,
  VisualControlState,
} from '@/domain/visualControl/types';

Object.assign(globalThis, { React });

const characterPin: PinnedReferenceState = {
  kind: 'character',
  refId: 'char_1',
  code: 'CHAR001',
  versionId: 'CHAR001_V1',
  source: 'shot-field',
  resolved: true,
  resolvableReason: null,
};

const locationPin: PinnedReferenceState = {
  kind: 'location',
  refId: 'loc_1',
  code: 'LOC001',
  versionId: 'LOC001_V1',
  source: 'shot-field',
  resolved: true,
  resolvableReason: null,
};

const stylePin: PinnedReferenceState = {
  kind: 'style',
  refId: 'style_1',
  code: 'STY001',
  versionId: 'STY001_V1',
  source: 'prompt-lockref',
  resolved: true,
  resolvableReason: null,
};

const approvedCharacter: ApprovedReferenceState = {
  kind: 'character',
  refId: 'char_1',
  versionId: 'CHAR001_V1',
  approvedAssetIds: ['asset_1', 'asset_2'],
  role: 'identity-anchor',
};

const repinData: RepinData = {
  action: async () => ({ ok: true, message: 'ok' }),
  versionsByRef: {
    'character:char_1': [
      { versionId: 'CHAR001_V1', label: 'CHAR001_V1' },
      { versionId: 'CHAR001_V2', label: 'CHAR001_V2' },
    ],
    'location:loc_1': [{ versionId: 'LOC001_V1', label: 'LOC001_V1' }],
  },
  names: {
    'character:char_1': 'Ngốc',
    'location:loc_1': 'Nhà mái ngói',
  },
  projectStyle: {
    isProjectLevel: true,
    styleId: 'style_1',
    code: 'STY001',
    name: 'Cổ trang nhẹ',
    currentVersion: 2,
    lockedVersionId: null,
    resolved: true,
  },
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

describe('visualControlRepin — pure repin helpers', () => {
  it('builds ascending version options for an entity code', () => {
    expect(buildVersionOptions('CHAR001', [3, 1, 2])).toEqual([
      { versionId: 'CHAR001_V1', label: 'CHAR001_V1' },
      { versionId: 'CHAR001_V2', label: 'CHAR001_V2' },
      { versionId: 'CHAR001_V3', label: 'CHAR001_V3' },
    ]);
  });

  it('drops non-positive and non-integer versions', () => {
    expect(buildVersionOptions('CHAR001', [0, -1, 1.5])).toEqual([]);
  });

  it('detects a repin change only when the selection differs from the pin', () => {
    expect(isRepinChange('CHAR001_V1', 'CHAR001_V2')).toBe(true);
    expect(isRepinChange('CHAR001_V1', 'CHAR001_V1')).toBe(false);
    expect(isRepinChange(null, 'CHAR001_V1')).toBe(true);
    expect(isRepinChange('CHAR001_V1', '')).toBe(false);
  });

  it('requires confirmation only when replacing a valid existing pin', () => {
    expect(shouldConfirmRepin('CHAR001_V1', true)).toBe(true);
    expect(shouldConfirmRepin(null, true)).toBe(false);
    expect(shouldConfirmRepin('CHAR001_V1', false)).toBe(false);
  });

  it('describes the pending change for pin, repin and no-op', () => {
    expect(pendingRepinText('character', 'CHAR001', null, 'CHAR001_V1')).toBe('Will pin character CHAR001 to CHAR001_V1.');
    expect(pendingRepinText('character', 'CHAR001', 'CHAR001_V1', 'CHAR001_V2')).toBe(
      'Will repin character CHAR001 from CHAR001_V1 to CHAR001_V2.',
    );
    expect(pendingRepinText('character', 'CHAR001', 'CHAR001_V1', 'CHAR001_V1')).toBe(
      'No change to character CHAR001; already pinned to CHAR001_V1.',
    );
  });

  it('recognises well-formed bible snapshot ids only', () => {
    expect(isWellFormedVersionId('CHAR001_V1')).toBe(true);
    expect(isWellFormedVersionId('LOC010_V12')).toBe(true);
    expect(isWellFormedVersionId('STY001_V0')).toBe(true);
    expect(isWellFormedVersionId('SE-CHAR-1_V1')).toBe(false);
    expect(isWellFormedVersionId('CHAR001')).toBe(false);
  });
});

describe('ReferenceRepinControl — entity-scoped version selector', () => {
  it('offers exactly the versions that belong to the pinned entity', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReferenceRepinControl, {
        kind: 'character',
        refId: 'char_1',
        code: 'CHAR001',
        name: 'Ngốc',
        currentVersionId: 'CHAR001_V1',
        resolved: true,
        resolvableReason: null,
        versions: [
          { versionId: 'CHAR001_V1', label: 'CHAR001_V1' },
          { versionId: 'CHAR001_V2', label: 'CHAR001_V2' },
        ],
        action: async () => ({ ok: true, message: 'ok' }),
      }),
    );
    expect(html).toContain('Version for CHAR001');
    expect(html).toContain('CHAR001_V1');
    expect(html).toContain('CHAR001_V2');
    expect(html).not.toContain('CHAR002');
    expect((html.match(/<option/g) ?? []).length).toBe(2);
  });

  it('labels the selector for assistive technology', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReferenceRepinControl, {
        kind: 'character',
        refId: 'char_1',
        code: 'CHAR001',
        name: 'Ngốc',
        currentVersionId: 'CHAR001_V1',
        resolved: true,
        resolvableReason: null,
        versions: [{ versionId: 'CHAR001_V1', label: 'CHAR001_V1' }],
        action: async () => ({ ok: true, message: 'ok' }),
      }),
    );
    expect(html).toMatch(/<label for="[^"]+"[^>]*>Version for CHAR001<\/label>/);
    expect(html).toMatch(/<select[^>]*id="[^"]+"/);
  });

  it('shows the idempotent state when the selection matches the current pin', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReferenceRepinControl, {
        kind: 'character',
        refId: 'char_1',
        code: 'CHAR001',
        name: 'Ngốc',
        currentVersionId: 'CHAR001_V1',
        resolved: true,
        resolvableReason: null,
        versions: [
          { versionId: 'CHAR001_V1', label: 'CHAR001_V1' },
          { versionId: 'CHAR001_V2', label: 'CHAR001_V2' },
        ],
        action: async () => ({ ok: true, message: 'ok' }),
      }),
    );
    expect(html).toContain('Repinned');
    expect(html).toContain('is pinned to CHAR001_V1');
  });

  it('announces the pending repin change before persistence', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReferenceRepinControl, {
        kind: 'character',
        refId: 'char_1',
        code: 'CHAR001',
        name: 'Ngốc',
        currentVersionId: null,
        resolved: false,
        resolvableReason: 'NO_PIN',
        versions: [{ versionId: 'CHAR001_V1', label: 'CHAR001_V1' }],
        action: async () => ({ ok: true, message: 'ok' }),
      }),
    );
    expect(html).toContain('Repin');
    expect(html).toContain('Will pin character CHAR001 to CHAR001_V1.');
    expect(html).toContain('role="status"');
  });

  it('surfaces an unresolved pinned snapshot as a correction, not a replacement', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReferenceRepinControl, {
        kind: 'character',
        refId: 'char_1',
        code: 'CHAR001',
        name: 'Ngốc',
        currentVersionId: 'CHAR001_V9',
        resolved: false,
        resolvableReason: 'MISSING_REFERENCE',
        versions: [{ versionId: 'CHAR001_V1', label: 'CHAR001_V1' }],
        action: async () => ({ ok: true, message: 'ok' }),
      }),
    );
    expect(html).toContain('CHAR001_V9');
    expect(html).toContain('snapshot unresolved');
  });

  it('renders a disabled state when no bible versions exist yet', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReferenceRepinControl, {
        kind: 'character',
        refId: 'char_1',
        code: 'CHAR001',
        name: 'Ngốc',
        currentVersionId: null,
        resolved: false,
        resolvableReason: 'NO_PIN',
        versions: [],
        action: async () => ({ ok: true, message: 'ok' }),
      }),
    );
    expect(html).toContain('No bible versions saved');
    expect(html).toContain('disabled=""');
  });
});

describe('VisualControlSection with VC3 repin data', () => {
  it('operator can see pinned references per shot', () => {
    const state = makeState({ pinnedReferences: [characterPin, locationPin, stylePin] });
    const html = renderToStaticMarkup(
      React.createElement(VisualControlSection, { shotCode: 'SHOT-001', state, repin: repinData }),
    );
    expect(html).toContain('Pinned references');
    expect(html).toContain('CHAR001_V1');
    expect(html).toContain('LOC001_V1');
    expect(html).toContain('STY001_V1');
    expect(html).toContain('3 pins');
  });

  it('operator can check the approved snapshot for each reference', () => {
    const state = makeState({ pinnedReferences: [characterPin], approvedReferences: [approvedCharacter] });
    const html = renderToStaticMarkup(
      React.createElement(VisualControlSection, { shotCode: 'SHOT-001', state, repin: repinData }),
    );
    expect(html).toContain('approved snapshot');
    expect(html).toContain('CHAR001_V1');
    expect(html).toContain('2 approved assets');
  });

  it('renders a repin control only for shot-field Character/Location/Prop pins', () => {
    const state = makeState({ pinnedReferences: [characterPin, locationPin, stylePin] });
    const html = renderToStaticMarkup(
      React.createElement(VisualControlSection, { shotCode: 'SHOT-001', state, repin: repinData }),
    );
    // Character + Location get selectors; the Style pin is a prompt-lockref and stays read-only.
    expect((html.match(/Version for /g) ?? []).length).toBe(2);
  });

  it('keeps the style pin read-only even when repin data is present', () => {
    const state = makeState({ pinnedReferences: [stylePin] });
    const html = renderToStaticMarkup(
      React.createElement(PinnedReferencesSummary, {
        pins: state.pinnedReferences,
        approvedReferences: state.approvedReferences,
        repin: repinData,
      }),
    );
    expect(html).toContain('STY001_V1');
    expect(html).toContain('prompt-lockref');
    expect(html).not.toMatch(/<select/);
    expect(html).not.toMatch(/<button/);
  });

  it('shows the project-level style with its resolved version and no repin control', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProjectStyleReview, { projectStyle: repinData.projectStyle }),
    );
    expect(html).toContain('Project style');
    expect(html).toContain('project-level');
    expect(html).toContain('STY001');
    expect(html).toContain('Cổ trang nhẹ');
    expect(html).toContain('resolved V2');
    expect(html).toContain('this is not a shot-level pin');
  });

  it('shows the missing-style state when the project has no style', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProjectStyleReview, {
        projectStyle: { ...repinData.projectStyle, styleId: null, code: '', name: '', currentVersion: null, resolved: false },
      }),
    );
    expect(html).toContain('No project style set');
    expect(html).not.toMatch(/<select/);
  });
});
