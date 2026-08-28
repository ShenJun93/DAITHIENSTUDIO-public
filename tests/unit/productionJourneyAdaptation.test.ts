import React from 'react';
import { existsSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deriveJourneyCapabilityStages } from '@/application/services/productionJourneyAdaptation';
import { deriveProductionJourneyState } from '@/application/services/productionJourneyService';

Object.assign(globalThis, { React });

function stagesFor(
  productionType: Parameters<typeof deriveJourneyCapabilityStages>[0]['productionType'],
  providerDescriptors: Parameters<typeof deriveJourneyCapabilityStages>[0]['providerDescriptors'] = [],
  projectStatus: Parameters<typeof deriveJourneyCapabilityStages>[0]['projectStatus'] = 'production',
) {
  return deriveJourneyCapabilityStages({ productionType, projectStatus, providerDescriptors });
}

function stageFor(
  productionType: Parameters<typeof deriveJourneyCapabilityStages>[0]['productionType'],
  key: string,
) {
  return stagesFor(productionType).find((stage) => stage.key === key)!;
}

function adaptedEvidence(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'project_1',
    projectSlug: 'adapted-project',
    activeEpisodeId: 'episode_1',
    productionType: 'motion-comic',
    projectStatus: 'production',
    episodeCount: 1,
    scenesCount: 1,
    shotsCount: 1,
    shots: [],
    pendingAssets: 0,
    approvedAssets: 0,
    readyForCompose: false,
    readyShots: 0,
    totalShots: 1,
    missingAnchors: 0,
    hasTimeline: false,
    warnings: [],
    continuityFindings: [],
    exportsCount: 0,
    latestPublishStatus: null,
    providerCanGenerate: true,
    capabilityStages: stagesFor('motion-comic'),
    computedAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
  } as any;
}

function media(
  image: { promptCount: number; generationCount: number; failedGenerationCount: number; assetTotal: number; approvedAssets: number },
  video: { promptCount: number; generationCount: number; failedGenerationCount: number; assetTotal: number; approvedAssets: number },
) {
  return { image, video };
}

describe('production journey capability adaptation', () => {
  it('Motion Comic requires image generation and keeps video optional', () => {
    expect(stageFor('motion-comic', 'generation.image.submit').applicability).toBe('REQUIRED');
    expect(stageFor('motion-comic', 'generation.video.submit').applicability).toBe('OPTIONAL');
  });

  it('Product Ad keeps composer optional', () => {
    expect(stageFor('product-ad', 'composer.compose').applicability).toBe('OPTIONAL');
  });

  it('Cinematic Short Film requires all six mapped capabilities', () => {
    const stages = stagesFor('cinematic-short-film');
    expect(stages).toHaveLength(6);
    expect(stages.every((stage) => stage.applicability === 'REQUIRED')).toBe(true);
  });

  it('null Production Type never infers an identity and resolver blocks all stages', () => {
    const stages = stagesFor(null);
    expect(stages).toHaveLength(6);
    expect(stages.every((stage) => stage.availability.reasonCode === 'PRODUCTION_TYPE_REQUIRED')).toBe(true);
  });
});

describe('Task 2 RED — per-kind persisted media evidence', () => {
  it('summarizes image and video prompt/generation/asset evidence independently', async () => {
    const workspaceModule = await import('@/application/services/creativeWorkspaceService');
    const summarize = (workspaceModule as unknown as Record<string, unknown>).summarizeShotMediaEvidence;

    if (typeof summarize !== 'function') {
      expect(typeof summarize, 'creativeWorkspaceService must expose summarizeShotMediaEvidence').toBe('function');
      return;
    }

    const result = (summarize as Function)(
      [{ kind: 'image' }, { kind: 'video' }, { kind: 'image' }],
      [
        { kind: 'image', status: 'completed' },
        { kind: 'video', status: 'failed' },
        { kind: 'voice', status: 'failed' },
      ],
      [
        { kind: 'image', approvalState: 'approved' },
        { kind: 'video', approvalState: 'pending' },
        { kind: 'voice', approvalState: 'approved' },
      ],
    );

    expect(result).toEqual({
      image: { promptCount: 2, generationCount: 1, failedGenerationCount: 0, assetTotal: 1, approvedAssets: 1 },
      video: { promptCount: 1, generationCount: 1, failedGenerationCount: 1, assetTotal: 1, approvedAssets: 0 },
    });
  });
});

describe('Task 3 RED — capability-aware Journey derivation', () => {
  it('legacy null Production Type blocks Setup and makes selection the primary action', () => {
    const state = deriveProductionJourneyState(
      adaptedEvidence({
        productionType: null,
        capabilityStages: stagesFor(null),
        shots: [],
        shotsCount: 0,
        totalShots: 0,
      }),
    );

    expect(state.phases.find((phase) => phase.phase === 'setup')?.state).toBe('BLOCKED');
    expect(state.blockers.map((issue) => issue.id)).toContain('setup.production-type-required');
    expect(state.primaryAction?.id).toBe('setup.select-production-type');
  });

  it('optional video provider absence does not block a Motion Comic whose required image media is complete', () => {
    const imageOnlyProvider = [{ capabilities: { textToImage: true, textToVideo: false } }] as any;
    const state = deriveProductionJourneyState(
      adaptedEvidence({
        capabilityStages: stagesFor('motion-comic', imageOnlyProvider),
        providerCanGenerate: false,
        readyShots: 1,
        shots: [
          {
            promptCount: 2,
            assetCoverage: { total: 1, approved: 1 },
            mediaEvidence: media(
              { promptCount: 1, generationCount: 1, failedGenerationCount: 0, assetTotal: 1, approvedAssets: 1 },
              { promptCount: 1, generationCount: 0, failedGenerationCount: 0, assetTotal: 0, approvedAssets: 0 },
            ),
          },
        ],
      }),
    );

    expect(state.blockers.some((issue) => issue.id.includes('generation.video.submit'))).toBe(false);
    expect(state.blockers.some((issue) => issue.id === 'produce.provider-unavailable')).toBe(false);
  });

  it('required image capability blocks Produce only while persisted image work is unfinished', () => {
    const unavailableStages = stagesFor('motion-comic', []);
    const unfinished = deriveProductionJourneyState(
      adaptedEvidence({
        capabilityStages: unavailableStages,
        providerCanGenerate: false,
        shots: [
          {
            promptCount: 1,
            assetCoverage: { total: 0, approved: 0 },
            mediaEvidence: media(
              { promptCount: 1, generationCount: 0, failedGenerationCount: 0, assetTotal: 0, approvedAssets: 0 },
              { promptCount: 0, generationCount: 0, failedGenerationCount: 0, assetTotal: 0, approvedAssets: 0 },
            ),
          },
        ],
      }),
    );
    expect(unfinished.blockers.map((issue) => issue.id)).toContain('capability.generation.image.submit');

    const complete = deriveProductionJourneyState(
      adaptedEvidence({
        capabilityStages: unavailableStages,
        providerCanGenerate: false,
        readyShots: 1,
        approvedAssets: 1,
        shots: [
          {
            promptCount: 1,
            assetCoverage: { total: 1, approved: 1 },
            mediaEvidence: media(
              { promptCount: 1, generationCount: 1, failedGenerationCount: 0, assetTotal: 1, approvedAssets: 1 },
              { promptCount: 0, generationCount: 0, failedGenerationCount: 0, assetTotal: 0, approvedAssets: 0 },
            ),
          },
        ],
      }),
    );
    expect(complete.blockers.some((issue) => issue.id === 'capability.generation.image.submit')).toBe(false);
  });

  it('a required image prompt cannot be hidden by an optional video prompt on the same shot', () => {
    const state = deriveProductionJourneyState(
      adaptedEvidence({
        capabilityStages: stagesFor('motion-comic', [{ capabilities: { textToImage: true, textToVideo: true } }] as any),
        shots: [
          {
            promptCount: 1,
            assetCoverage: { total: 0, approved: 0 },
            mediaEvidence: media(
              { promptCount: 0, generationCount: 0, failedGenerationCount: 0, assetTotal: 0, approvedAssets: 0 },
              { promptCount: 1, generationCount: 0, failedGenerationCount: 0, assetTotal: 0, approvedAssets: 0 },
            ),
          },
        ],
      }),
    );

    expect(state.primaryAction?.id).toBe('produce.compile-prompts');
    expect(state.primaryAction?.reason).toContain('image');
  });
});

describe('Task 4 RED — read-only Production Path Summary UI', () => {
  it('renders Production Type plus required/optional capability stages from the Journey read model', async () => {
    const componentPath = 'src/components/creative-workspace/ProductionPathSummary.tsx';
    if (!existsSync(componentPath)) {
      expect(existsSync(componentPath), 'ProductionPathSummary.tsx must exist').toBe(true);
      return;
    }

    const { ProductionPathSummary } = await import('@/components/creative-workspace/ProductionPathSummary');
    const imageOnlyProvider = [{ capabilities: { textToImage: true, textToVideo: false } }] as any;
    const journey = {
      projectId: 'project_1',
      projectSlug: 'adapted-project',
      activeEpisodeId: 'episode_1',
      productionType: 'motion-comic',
      capabilityStages: stagesFor('motion-comic', imageOnlyProvider),
      phases: [],
      currentPhase: 'produce',
      primaryAction: null,
      secondaryActions: [],
      blockers: [],
      warnings: [],
      computedAt: '2026-08-13T00:00:00.000Z',
    } as any;

    const html = renderToStaticMarkup(React.createElement(ProductionPathSummary, { journey }));
    expect(html).toContain('Production path');
    expect(html).toContain('motion-comic');
    expect(html).toContain('Image generation');
    expect(html).toContain('Required');
    expect(html).toContain('Video generation');
    expect(html).toContain('Optional');
    expect(html).toContain('Blocked');
  });
});
