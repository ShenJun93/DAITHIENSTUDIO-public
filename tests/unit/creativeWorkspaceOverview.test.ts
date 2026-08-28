import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkspaceOverview } from '@/components/creative-workspace/WorkspaceOverview';
import type { CreativeWorkspaceOverview } from '@/application/services/creativeWorkspaceService';

Object.assign(globalThis, { React });

function workspaceFixture(): CreativeWorkspaceOverview {
  return {
    project: {
      id: 'project-1', workspaceId: 'workspace-1', slug: 'persisted-project', title: 'Persisted Project',
      description: 'A stored description', genre: 'drama', format: 'motion-comic', productionType: 'motion-comic', targetAudience: 'general',
      platform: 'youtube', language: 'vi', durationTargetSeconds: 90, aspectRatio: '16:9',
      secondaryAspectRatios: ['9:16'], frameRate: 24, resolution: '1920x1080', styleId: null,
      status: 'development', ownerId: 'owner-1',
      creativeBrief: { logline: '', synopsis: '', theme: '', tone: '', references: [], hook: '', cliffhanger: '', beats: [], premise: '', approvedParts: [] },
      costLimitUsd: 10, productionStrategy: 'hybrid', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    activeEpisodeId: null,
    productionType: 'motion-comic',
    productionStrategy: 'hybrid',
    counts: { scenes: 2, shots: 5, bibles: 3, assets: 2, approvedAssets: 1, pendingAssets: 1 },
    readiness: { readyForStoryboard: false, readyForCompose: false, readyShots: 1, totalShots: 5, missingAnchors: 2 },
    journey: [
      { key: 'project', label: 'Project', state: 'complete', detail: 'development', href: '/projects/persisted-project' },
      { key: 'script', label: 'Script', state: 'in-progress', detail: 'draft · v1', href: '/projects/persisted-project/script' },
    ],
    warnings: [{ key: 'anchors', label: 'Production references incomplete', detail: '2 pinned snapshots need anchors.', href: '/projects/persisted-project/production' }],
    hasProductionData: true,
  };
}

describe('creative workspace overview UI', () => {
  it('Show persisted production type, journey, readiness, warnings and output profile', () => {
    const html = renderToStaticMarkup(React.createElement(WorkspaceOverview, { workspace: workspaceFixture() }));
    expect(html).toContain('motion-comic');
    expect(html).toContain('hybrid production');
    expect(html).toContain('Project journey');
    expect(html).toContain('1 / 5 shots');
    expect(html).toContain('Production references incomplete');
    expect(html).toContain('16:9 · 1920x1080');
    expect(html).toContain('1m 30s');
  });

  it('Show an honest empty state without fabricated production values', () => {
    const workspace = workspaceFixture();
    workspace.hasProductionData = false;
    workspace.counts = { scenes: 0, shots: 0, bibles: 0, assets: 0, approvedAssets: 0, pendingAssets: 0 };
    const html = renderToStaticMarkup(React.createElement(WorkspaceOverview, { workspace }));
    expect(html).toContain('This project has no production data yet');
    expect(html).toContain('Open story workspace');
    expect(html).not.toContain('sample data');
  });
});
