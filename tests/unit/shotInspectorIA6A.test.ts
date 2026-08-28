import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GenerationsContent,
  type AssetRecord,
  type GenerationRecord,
} from '@/components/shot-inspector/GenerationsContent';
import generationsSource from '@/components/shot-inspector/GenerationsContent.tsx?raw';
import pageSource from '@/app/projects/[slug]/shots/[code]/page.tsx?raw';

Object.assign(globalThis, { React });

describe('ShotInspectorIA6A — Generations Workspace Read-Only', () => {
  const dummyGenerations: GenerationRecord[] = [
    {
      id: 'gen-1',
      status: 'completed',
      kind: 'image',
      provider: 'mock',
      model: 'test-model',
      estimatedCostUsd: 0.015,
      actualCostUsd: 0.012,
      attempts: 1,
      maxAttempts: 3,
      errorCode: null,
      errorMessage: null,
    }
  ];

  const dummyAssets: AssetRecord[] = [
    {
      id: 'asset-1',
      mimeType: 'image/png',
      name: 'test-image.png',
      approvalState: 'pending',
      kind: 'image',
      sizeBytes: 102400,
      url: 'http://localhost/test-image.png',
      version: 1,
      checksum: 'a'.repeat(64),
      generation: {
        id: 'gen-1',
        provider: 'mock',
        model: 'test-model',
        actualCostUsd: 0.012,
        promptId: 'prompt-1',
        promptVersion: 1,
      },
      prompt: { id: 'prompt-1', version: 1, lintOk: true, blockingFindingCount: 0 },
      quality: { id: 'qr-1', score: 100, passed: true, createdAt: '2026-08-08T00:00:00.000Z' },
      approval: null,
      lineageHref: '/projects/test-slug/assets?focus=asset-1',
      approveAction: async () => ({ ok: true, message: 'approved' }),
      rejectAction: async () => ({ ok: true, message: 'rejected' }),
      qualityAction: async () => ({ ok: true, message: 'checked' }),
    }
  ];

  it('renders GenerationsContent with existing generation records, assets and cost summary', () => {
    const html = renderToStaticMarkup(
      React.createElement(GenerationsContent, {
        generations: dummyGenerations,
        assets: dummyAssets,
        projectSlug: 'test-slug'
      })
    );

    expect(html).toContain('Generations (1)');
    expect(html).toContain('mock/test-model');

    expect(html).toContain('Assets (1)');
    expect(html).toContain('test-image.png');
    expect(html).toContain('http://localhost/test-image.png');
    expect(html).toContain('Lineage →');

    expect(html).toContain('Cost summary');
    expect(html).toContain('Encumbered');
    expect(html).toContain('$0.0150');
    expect(html).toContain('Actual');
    expect(html).toContain('$0.0120');

    expect(html).not.toContain('Process queue now');
    expect(html).toContain('Compare / review');
    expect(html).toContain('Select up to two real assets');
    expect(html).not.toContain('Retry');
    expect(html).not.toContain('Cancel');
    expect(html).not.toContain('<form');
  });

  it('renders empty states understandably', () => {
    const html = renderToStaticMarkup(
      React.createElement(GenerationsContent, {
        generations: [],
        assets: [],
        projectSlug: 'test-slug'
      })
    );

    expect(html).toContain('Nothing generated for this shot yet');
    expect(html).toContain('No assets for this shot yet');

    expect(html).not.toContain('Cost summary');
  });

  it('GenerationsContent component does not contain forbidden mutations or dependencies', () => {
    expect(generationsSource).not.toContain('enqueueGenerationAction');
    expect(generationsSource).not.toContain('cancelGenerationAction');
    expect(generationsSource).not.toContain('fetch(');
    expect(generationsSource).not.toContain('method: "POST"');
    expect(generationsSource).not.toContain('decideAssetAction');
    expect(generationsSource).not.toContain('<form');
  });

  it('page.tsx delegates generations through the bounded compare read path without duplicated inline cards', () => {
    expect(pageSource).not.toContain('const generationsCardContent');
    expect(pageSource).not.toContain('const assetsCardContent');
    expect(pageSource).toContain('<GenerationsContent');

    expect(pageSource).toContain('checkQualityAction');
    expect(pageSource).toContain('decideAssetAction');
    expect(pageSource).toContain("activeTab === 'generations'");
    expect(pageSource).toContain('loadAssetCompareReadCandidates');
    expect(pageSource).toContain('assets: compareAssets');
    expect(pageSource).not.toContain('drainQueueAction');
  });
});
