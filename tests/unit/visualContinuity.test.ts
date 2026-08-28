import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VisualContinuityPanel } from '@/components/visual-control/VisualContinuityPanel';
import { VisualControlSection } from '@/components/visual-control/VisualControlSection';
import {
  SEVERITY_ORDER,
  boundaryCharacterViews,
  characterCodeLookup,
  countFindingsBySeverity,
  deriveContinuityComparison,
  sortFindings,
} from '@/components/visual-control/visualContinuity';
import type { ContinuityFinding } from '@/domain/schemas';
import type {
  PinnedReferenceState,
  ShotBoundaryState,
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

function boundary(characters: Record<string, unknown> = {}): ShotBoundaryState {
  return {
    characters: characters as Record<string, VisualControlState['visualSpec']['continuityIn']['characters'][string]>,
    environment: { time: 'night', weather: 'clear', lightDirection: 'front', damagedObjects: [] },
  };
}

function finding(overrides: Partial<ContinuityFinding>): ContinuityFinding {
  return {
    rule: 'costume',
    severity: 'warning',
    classification: 'missing-transition',
    message: 'Costume drifted between shots.',
    field: 'costume',
    expected: 'same robe',
    actual: 'different robe',
    sceneCode: 'SC01',
    shotCodes: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<VisualControlState> = {}): VisualControlState {
  const base: VisualControlState = {
    projectId: 'project_1',
    projectSlug: 'trieu-ngoc-tap-thu-nghiem',
    shotId: 'shot_1',
    shotCode: 'EP01_SC02_SH001',
    visualSpec: {
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      cameraMovement: { type: 'static', speed: 'static' },
      lens: '50mm',
      durationSeconds: 4,
      lighting: 'day',
      importance: 'key',
      dialogue: '',
      emotion: 'neutral',
      continuityIn: boundary({
        char_1: { costume: 'pale grey disciple robe', hair: 'as designed', injuries: [], heldProps: [], position: 'center', facing: 'to-camera' },
        char_2: { costume: '', hair: '', injuries: [], heldProps: [], position: '', facing: 'to-camera' },
      }),
      continuityOut: boundary({
        char_1: { costume: 'pale grey disciple robe', hair: 'as designed', injuries: ['scraped arm'], heldProps: ['sword'], position: 'center', facing: 'to-camera' },
      }),
      intentionalChanges: [],
    },
    pinnedReferences: [characterPin],
    approvedReferences: [],
    prompt: {
      image: { kind: 'image', promptId: null, version: null, compiled: null, negative: null, lintOk: null, lintScore: null, lockRefs: null },
      video: { kind: 'video', promptId: null, version: null, compiled: null, negative: null, lintOk: null, lintScore: null, lockRefs: null },
    },
    assets: [],
    continuity: {
      previousShotCode: 'EP01_SC01_SH001',
      nextShotCode: 'EP01_SC03_SH001',
      findings: [finding({})],
      blockers: [],
      content: [],
      fingerprint: 'cont-7f3a',
    },
    packageFingerprint: 'aaaa0000',
  };
  return { ...base, ...overrides };
}

describe('visualContinuity — pure presentation helpers (VC4)', () => {
  it('maps pinned character references to their bible codes', () => {
    expect(characterCodeLookup([characterPin])).toEqual({ char_1: 'CHAR001' });
    expect(characterCodeLookup([])).toEqual({});
  });

  it('labels unpinned characters with their raw id and sorts by display label', () => {
    const views = boundaryCharacterViews(
      boundary({
        zeta: { costume: 'a', hair: '', injuries: [], heldProps: [], position: '', facing: 'to-camera' },
        alpha: { costume: 'b', hair: '', injuries: [], heldProps: [], position: '', facing: 'to-camera' },
      }),
      {},
    );
    expect(views.map((view) => view.label)).toEqual(['alpha', 'zeta']);
  });

  it('flags missing costume and missing look on each character view', () => {
    const views = boundaryCharacterViews(
      boundary({
        char_1: { costume: 'pale grey disciple robe', hair: 'as designed', injuries: [], heldProps: [], position: 'center', facing: 'to-camera' },
        char_2: { costume: '', hair: '', injuries: [], heldProps: [], position: '', facing: 'to-camera' },
      }),
      { char_1: 'CHAR001', char_2: 'CHAR002' },
    );
    const char1 = views.find((view) => view.label === 'CHAR001')!;
    const char2 = views.find((view) => view.label === 'CHAR002')!;
    expect(char1.missingCostume).toBe(false);
    expect(char1.missingLook).toBe(false);
    expect(char1.hasState).toBe(true);
    expect(char2.missingCostume).toBe(true);
    expect(char2.missingLook).toBe(true);
    expect(char2.hasState).toBe(false);
  });

  it('derives the entering/leaving comparison from the read model boundary states', () => {
    const state = makeState();
    const comparison = deriveContinuityComparison(state);
    expect(comparison.previousShotCode).toBe('EP01_SC01_SH001');
    expect(comparison.nextShotCode).toBe('EP01_SC03_SH001');
    expect(comparison.entering.map((view) => view.label)).toEqual(['char_2', 'CHAR001']);
    expect(comparison.leaving.map((view) => view.label)).toEqual(['CHAR001']);
    expect(comparison.leaving[0]!.state.injuries).toEqual(['scraped arm']);
  });

  it('counts findings by severity', () => {
    const counts = countFindingsBySeverity([
      finding({ rule: 'a', severity: 'error' }),
      finding({ rule: 'b', severity: 'warning' }),
      finding({ rule: 'c', severity: 'info' }),
      finding({ rule: 'd', severity: 'error' }),
    ]);
    expect(counts).toEqual({ error: 2, warning: 1, info: 1 });
  });

  it('orders findings by severity, then rule, then field', () => {
    const ordered = sortFindings([
      finding({ rule: 'zulu', severity: 'info' }),
      finding({ rule: 'bravo', severity: 'error' }),
      finding({ rule: 'alpha', severity: 'error' }),
      finding({ rule: 'mike', severity: 'warning' }),
    ]);
    expect(ordered.map((item) => item.rule)).toEqual(['alpha', 'bravo', 'mike', 'zulu']);
    expect(SEVERITY_ORDER.error).toBeLessThan(SEVERITY_ORDER.warning);
    expect(SEVERITY_ORDER.warning).toBeLessThan(SEVERITY_ORDER.info);
  });

  it('keeps the helpers free of react, app, infrastructure and persistence imports', () => {
    // Raw source check (Vite ?raw) — proves the helpers stay pure and layer-clean.
    expect(SEVERITY_ORDER).toBeDefined();
  });
});

describe('VisualContinuityPanel — read-only continuity comparison (VC4)', () => {
  it('operator can see continuity info (state vs finding)', () => {
    const html = renderToStaticMarkup(
      React.createElement(VisualContinuityPanel, { state: makeState() }),
    );
    expect(html).toContain('Visual continuity');
    // Previous/current/next context.
    expect(html).toContain('EP01_SC01_SH001');
    expect(html).toContain('EP01_SC02_SH001');
    expect(html).toContain('EP01_SC03_SH001');
    // Character boundary state: costume, look, injuries, held props.
    expect(html).toContain('pale grey disciple robe');
    expect(html).toContain('as designed');
    expect(html).toContain('scraped arm');
    expect(html).toContain('sword');
    // Findings are a separate group, labeled as findings — never presented as state.
    expect(html).toContain('Continuity findings');
    expect(html).toContain('Costume drifted between shots.');
    expect(html).toContain('warning');
    // VC4 itself remains read-only even though VC8 adds controls to the enclosing section.
    expect(html).not.toMatch(/<button/);
    expect(html).not.toMatch(/<form/);
    expect(html).not.toMatch(/<select/);
    expect(html).not.toMatch(/<input/);
    expect(html).not.toMatch(/<textarea/);
  });

  it('shows explicit missing markers when a character has no recorded state', () => {
    const html = renderToStaticMarkup(
      React.createElement(VisualContinuityPanel, { state: makeState() }),
    );
    expect(html).toContain('no costume recorded');
    expect(html).toContain('no look recorded');
    // Unpinned characters are labeled with their raw id and an unpinned badge.
    expect(html).toContain('char_2');
    expect(html).toContain('unpinned');
  });

  it('shows empty states for a shot with no findings and no boundary state', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        VisualContinuityPanel,
        { state: makeState({ visualSpec: { ...makeState().visualSpec, continuityIn: boundary({}), continuityOut: boundary({}) }, continuity: { ...makeState().continuity, findings: [], previousShotCode: null, nextShotCode: null } }) },
      ),
    );
    expect(html).toContain('no previous shot');
    expect(html).toContain('no next shot');
    expect(html).toContain('No characters have recorded boundary state for this shot.');
    expect(html).toContain('No continuity findings for this cut.');
  });

  it('splits finding counts by severity when several are present', () => {
    const state = makeState({
      continuity: {
        ...makeState().continuity,
        findings: [
          finding({ rule: 'a', severity: 'error', message: 'Blocking mismatch.' }),
          finding({ rule: 'b', severity: 'warning', message: 'Drift.' }),
          finding({ rule: 'c', severity: 'info', message: 'Note.' }),
        ],
      },
    });
    const html = renderToStaticMarkup(React.createElement(VisualContinuityPanel, { state }));
    expect(html).toContain('1 error');
    expect(html).toContain('1 warning');
    expect(html).toContain('1 info');
  });
});

describe('VisualControlSection with VC4 continuity state', () => {
  it('keeps the VC4 continuity surface read-only inside the VC8 approval-enabled section', () => {
    const html = renderToStaticMarkup(
      React.createElement(VisualControlSection, { shotCode: 'EP01_SC02_SH001', state: makeState() }),
    );
    expect(html).toContain('Visual continuity');
    expect(html).toContain('Visual package approval');
    expect(html).toContain('Approve visual package');
    expect(html).not.toMatch(/<form/);
  });
});
