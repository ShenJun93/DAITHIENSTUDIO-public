import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deriveJourneyCapabilityStages } from '@/application/services/productionJourneyAdaptation';
import { deriveProductionJourneyState } from '@/application/services/productionJourneyService';
import { ProductionPathSummary } from '@/components/creative-workspace/ProductionPathSummary';
import { GuidedPhaseView } from '@/components/creative-workspace/GuidedPhaseView';

Object.assign(globalThis, { React });

const capableProviders = [{ capabilities: { textToImage: true, textToVideo: true } }] as any;

function stages(projectStatus: 'production' | 'archived' = 'production') {
  return deriveJourneyCapabilityStages({
    productionType: 'motion-comic',
    projectStatus,
    providerDescriptors: capableProviders,
  });
}

function stagesForType(
  productionType: Parameters<typeof deriveJourneyCapabilityStages>[0]['productionType'],
  providerDescriptors: Parameters<typeof deriveJourneyCapabilityStages>[0]['providerDescriptors'] = capableProviders,
) {
  return deriveJourneyCapabilityStages({
    productionType,
    projectStatus: 'production',
    providerDescriptors,
  });
}

function media(
  image: { promptCount: number; generationCount: number; failedGenerationCount: number; assetTotal: number; approvedAssets: number },
  video = { promptCount: 0, generationCount: 0, failedGenerationCount: 0, assetTotal: 0, approvedAssets: 0 },
) {
  return { image, video };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'project_review',
    projectSlug: 'review-project',
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
    capabilityStages: stages(),
    computedAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
  } as any;
}

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

describe('Production Journey Part 2 review regressions', () => {
  it('does not mark Produce complete when another shot still lacks a required image prompt', () => {
    const state = deriveProductionJourneyState(evidence({
      shotsCount: 2,
      totalShots: 2,
      readyShots: 1,
      shots: [
        {
          promptCount: 1,
          assetCoverage: { total: 1, approved: 1 },
          mediaEvidence: media({ promptCount: 1, generationCount: 1, failedGenerationCount: 0, assetTotal: 1, approvedAssets: 1 }),
        },
        {
          promptCount: 0,
          assetCoverage: { total: 0, approved: 0 },
          mediaEvidence: media({ promptCount: 0, generationCount: 0, failedGenerationCount: 0, assetTotal: 0, approvedAssets: 0 }),
        },
      ],
    }));

    expect(state.phases.find((phase) => phase.phase === 'produce')?.state).toBe('IN_PROGRESS');
    expect(state.primaryAction?.id).toBe('produce.compile-prompts');
  });

  it('does not block Export on an archived project until required Compose has produced a timeline', () => {
    const state = deriveProductionJourneyState(evidence({
      projectStatus: 'archived',
      capabilityStages: stages('archived'),
      readyForCompose: true,
      readyShots: 1,
      hasTimeline: false,
      shots: [
        {
          promptCount: 1,
          assetCoverage: { total: 2, approved: 2 },
          mediaEvidence: media(
            { promptCount: 1, generationCount: 1, failedGenerationCount: 0, assetTotal: 1, approvedAssets: 1 },
            { promptCount: 0, generationCount: 0, failedGenerationCount: 0, assetTotal: 1, approvedAssets: 1 },
          ),
        },
      ],
    }));

    expect(state.blockers.map((issue) => issue.id)).toContain('capability.composer.compose');
    expect(state.blockers.map((issue) => issue.id)).not.toContain('capability.export.create');
  });

  it('groups the Production Path summary by Produce, Review, and Finish', () => {
    const journey = deriveProductionJourneyState(evidence());
    const html = renderToStaticMarkup(React.createElement(ProductionPathSummary, { journey }));
    const text = visibleText(html);

    expect(text).toContain('Produce');
    expect(text).toContain('Review');
    expect(text).toContain('Finish');
  });

  it('shows an adapted required generation provider blocker as Blocked in Guided Phase criteria', () => {
    const state = deriveProductionJourneyState(evidence({
      capabilityStages: stagesForType('motion-comic', []),
      shots: [
        {
          promptCount: 1,
          assetCoverage: { total: 0, approved: 0 },
          mediaEvidence: media({ promptCount: 1, generationCount: 0, failedGenerationCount: 0, assetTotal: 0, approvedAssets: 0 }),
        },
      ],
    }));

    const html = renderToStaticMarkup(React.createElement(GuidedPhaseView, { journey: state }));
    const text = visibleText(html);
    expect(text).toContain('A provider is configured for the required generation capability(Blocked)');
  });

  it('labels optional Asset approval as Optional instead of a mandatory completion criterion', () => {
    const optionalStages = stagesForType('silent-comedy');
    const reviewPhase = {
      phase: 'review',
      state: 'COMPLETE',
      progress: null,
      blockers: [],
      warnings: [
        {
          id: 'warning.asset-review',
          severity: 'WARNING',
          phase: 'review',
          message: '1 asset pending review',
          reason: 'Optional approval remains pending',
          evidenceSource: 'test',
          affectedEntity: null,
          targetRoute: '/projects/review-project/assets',
          blocksPhase: false,
        },
      ],
      nextActions: [],
    } as any;
    const journey = {
      projectId: 'project_review',
      projectSlug: 'review-project',
      activeEpisodeId: 'episode_1',
      productionType: 'silent-comedy',
      capabilityStages: optionalStages,
      phases: [reviewPhase],
      currentPhase: 'review',
      primaryAction: null,
      secondaryActions: [],
      blockers: [],
      warnings: reviewPhase.warnings,
      computedAt: '2026-08-13T00:00:00.000Z',
    } as any;

    const html = renderToStaticMarkup(React.createElement(GuidedPhaseView, { journey }));
    const text = visibleText(html);
    expect(text).toContain('No generated asset is still awaiting approval — Optional');
  });
});
