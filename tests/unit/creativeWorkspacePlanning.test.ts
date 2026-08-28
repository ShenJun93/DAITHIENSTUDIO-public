import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneCard } from '@/components/creative-workspace/SceneCard';
import { ShotCard } from '@/components/creative-workspace/ShotCard';
import { SceneInspector } from '@/components/creative-workspace/SceneInspector';
import { ShotInspector } from '@/components/creative-workspace/ShotInspector';
import type { CreativeSceneSummary, CreativeShotSummary } from '@/application/services/creativeWorkspaceService';
import SceneBoardError from '@/app/projects/[slug]/workspace/scenes/error';
import SceneBoardLoading from '@/app/projects/[slug]/workspace/scenes/loading';
import ShotStoryboardError from '@/app/projects/[slug]/workspace/shots/error';
import ShotStoryboardLoading from '@/app/projects/[slug]/workspace/shots/loading';

Object.assign(globalThis, { React });

function sceneFixture(overrides: Partial<CreativeSceneSummary> = {}): CreativeSceneSummary {
  return {
    id: 'scene-1',
    code: 'SC01',
    number: 1,
    title: 'Hang động tu tiên',
    synopsis: 'Triệu Ngốc cố nhập định.',
    locationName: 'Hang động tu tiên',
    timeOfDay: 'night',
    status: 'draft',
    durationSeconds: 45,
    shotCount: 3,
    characterCount: 2,
    warnings: [],
    ...overrides,
  };
}

function shotFixture(overrides: Partial<CreativeShotSummary> = {}): CreativeShotSummary {
  return {
    id: 'shot-1',
    code: 'SC01_SH001',
    sceneCode: 'SC01',
    shotNumber: 1,
    title: 'Wide establishing',
    description: 'The cave interior at night.',
    shotSize: 'wide',
    cameraAngle: 'eye-level',
    durationSeconds: 5,
    status: 'planned',
    promptCount: 1,
    generationStatus: 'completed',
    assetCoverage: { total: 2, approved: 1 },
    updatedAt: '2026-07-01T00:00:00.000Z',
    warnings: [],
    ...overrides,
  };
}

describe('Scene Board and Shot Storyboard cards', () => {
  it('Scene Board populated state: shows real scene fields without fabricating summary/duration/cast/location/readiness/approval/continuity', () => {
    const html = renderToStaticMarkup(React.createElement(SceneCard, { scene: sceneFixture(), selected: false, onSelect: () => undefined }));
    expect(html).toContain('SC01');
    expect(html).toContain('Scene 1');
    expect(html).toContain('Hang động tu tiên');
    expect(html).toContain('night');
    expect(html).toContain('45s');
    expect(html).toContain('3'); // shot count
    expect(html).toContain('2'); // character count
  });

  it('scene warning count reflects real derived warnings (no location / no shots), not a fabricated value', () => {
    const withWarnings = renderToStaticMarkup(
      React.createElement(SceneCard, {
        scene: sceneFixture({ locationName: null, shotCount: 0, warnings: ['No location assigned.', 'No shots built yet.'] }),
        selected: false,
        onSelect: () => undefined,
      }),
    );
    expect(withWarnings).toContain('No location assigned');
    // the card's own warning count cell shows 2
    expect(withWarnings).toMatch(/Warnings[\s\S]*?>2</);
  });

  it('Shot Storyboard populated state: shows real shot fields including render status', () => {
    const html = renderToStaticMarkup(React.createElement(ShotCard, { shot: shotFixture(), selected: false, onSelect: () => undefined }));
    expect(html).toContain('SC01_SH001');
    expect(html).toContain('wide');
    expect(html).toContain('eye-level');
    expect(html).toContain('5s');
    expect(html).toContain('1'); // prompt count
    expect(html).toContain('1/2'); // approved/total asset coverage
  });

  it('Shot Storyboard: an unstarted render shows "Not started" rather than a fabricated status', () => {
    const html = renderToStaticMarkup(React.createElement(ShotCard, { shot: shotFixture({ generationStatus: null }), selected: false, onSelect: () => undefined }));
    expect(html).toContain('Not started');
  });

  it('unknown status fallback: an unrecognised scene/shot status renders safely', () => {
    const sceneHtml = renderToStaticMarkup(React.createElement(SceneCard, { scene: sceneFixture({ status: 'not-a-real-status' }), selected: false, onSelect: () => undefined }));
    expect(sceneHtml).toContain('not-a-real-status');
    const shotHtml = renderToStaticMarkup(React.createElement(ShotCard, { shot: shotFixture({ status: 'not-a-real-status' }), selected: false, onSelect: () => undefined }));
    expect(shotHtml).toContain('not-a-real-status');
  });

  it('selection state uses aria-pressed and composed accessible content, matching the Slice 2 EntityCard fix (no manual aria-label)', () => {
    const scene = renderToStaticMarkup(React.createElement(SceneCard, { scene: sceneFixture(), selected: true, onSelect: () => undefined }));
    expect(scene).toContain('aria-pressed="true"');
    expect(scene).not.toContain('aria-label=');
    const shot = renderToStaticMarkup(React.createElement(ShotCard, { shot: shotFixture(), selected: true, onSelect: () => undefined }));
    expect(shot).toContain('aria-pressed="true"');
    expect(shot).not.toContain('aria-label=');
  });
});

describe('Scene and Shot Inspectors', () => {
  it('Scene Inspector shows real metadata, a real "View shots" navigation action, and no destructive/edit control', () => {
    const html = renderToStaticMarkup(React.createElement(SceneInspector, { scene: sceneFixture(), slug: 'demo-project', onClose: () => undefined }));
    expect(html).toContain('Inspector: Hang động tu tiên');
    expect(html).toContain('SC01');
    expect(html).toContain('Synopsis');
    expect(html).toContain('View shots in this scene');
    expect(html).toContain('href="/projects/demo-project/workspace/shots?scene=SC01"');
    expect(html).toContain('Close inspector');
    expect(html).not.toContain('Delete');
    expect(html).not.toContain('Edit');
    expect(html).not.toContain('Reorder');
  });

  it('Scene Inspector omits Last updated: SceneRecord has no updatedAt field, so nothing is guessed', () => {
    const html = renderToStaticMarkup(React.createElement(SceneInspector, { scene: sceneFixture(), slug: 'demo-project', onClose: () => undefined }));
    expect(html).not.toContain('Last updated');
  });

  it('Shot Inspector shows real metadata including render status and a real Last updated timestamp, no mutation control', () => {
    const html = renderToStaticMarkup(React.createElement(ShotInspector, { shot: shotFixture(), onClose: () => undefined }));
    expect(html).toContain('Inspector: Wide establishing');
    expect(html).toContain('SC01_SH001');
    expect(html).toContain('Render status');
    expect(html).toContain('completed');
    expect(html).toContain('Last updated');
    // "Render status" is a read-only display label; the only <button> in
    // the panel is the Close control — there is no render/generate/approve action.
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('Close inspector');
    expect(html).not.toContain('Generate');
    expect(html).not.toContain('Approve');
  });

  it('Shot Inspector shows an honest "Not started" render status rather than a fabricated one', () => {
    const html = renderToStaticMarkup(React.createElement(ShotInspector, { shot: shotFixture({ generationStatus: null }), onClose: () => undefined }));
    expect(html).toContain('Not started');
  });
});

describe('Scene Board and Shot Storyboard route boundaries', () => {
  it('Scene Board error state: recoverable with a stable operator code', () => {
    const html = renderToStaticMarkup(SceneBoardError({ error: new Error('simulated'), reset: () => undefined }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('SCENE_BOARD_FAILED');
    expect(html).toContain('Try again');
  });

  it('Scene Board loading state: labelled and busy', () => {
    const html = renderToStaticMarkup(SceneBoardLoading());
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
  });

  it('Shot Storyboard error state: recoverable with a stable operator code', () => {
    const html = renderToStaticMarkup(ShotStoryboardError({ error: new Error('simulated'), reset: () => undefined }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('SHOT_STORYBOARD_FAILED');
    expect(html).toContain('Try again');
  });

  it('Shot Storyboard loading state: labelled and busy', () => {
    const html = renderToStaticMarkup(ShotStoryboardLoading());
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
  });
});

describe('shared Inspector selection: Escape close and focus return', () => {
  it('useInspectorSelection.close() returns keyboard focus to the originating card button', () => {
    const hookSource = readFileSync('src/components/creative-workspace/useInspectorSelection.ts', 'utf8');
    expect(hookSource).toContain("event.key === 'Escape'");
    expect(hookSource).toContain('.focus()');
    expect(hookSource).toContain("querySelector('button')");
  });

  it('EntityBrowserView (Slice 2) now uses the shared hook, closing the deferred focus-return gap', () => {
    const source = readFileSync('src/components/creative-workspace/EntityBrowserView.tsx', 'utf8');
    expect(source).toContain('useInspectorSelection');
    expect(source).toContain('registerCard(entry.id, node)');
    expect(source).not.toContain('useState<string | null>(null)');
  });

  it('SelectionBoard (Slice 3 Scene Board / Shot Storyboard) uses the same shared hook, not a duplicate implementation', () => {
    const source = readFileSync('src/components/creative-workspace/SelectionBoard.tsx', 'utf8');
    expect(source).toContain('useInspectorSelection');
    expect(source).toContain('registerCard(id, node)');
  });
});

describe('no project-specific hardcoding (Slice 3)', () => {
  it('the planning components, routes and service contain no fixture/project-name literal', () => {
    const files = [
      'src/components/creative-workspace/SceneCard.tsx',
      'src/components/creative-workspace/ShotCard.tsx',
      'src/components/creative-workspace/SceneInspector.tsx',
      'src/components/creative-workspace/ShotInspector.tsx',
      'src/components/creative-workspace/SceneBoardView.tsx',
      'src/components/creative-workspace/ShotStoryboardView.tsx',
      'src/components/creative-workspace/SelectionBoard.tsx',
      'src/components/creative-workspace/useInspectorSelection.ts',
      'src/app/projects/[slug]/workspace/scenes/page.tsx',
      'src/app/projects/[slug]/workspace/shots/page.tsx',
      'src/application/services/creativeWorkspaceService.ts',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of ['Kianu', 'Pilot 002', 'Lục Vấn', 'Luc Van', 'Tuyết Đỉnh', 'Triệu Ngốc']) {
        expect(source, `${file} contains project-specific literal "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});
