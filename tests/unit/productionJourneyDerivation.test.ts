import { describe, expect, it } from 'vitest';
import {
  JOURNEY_PHASES,
  deriveProductionJourneyState,
  isKnownJourneyRoute,
  type JourneyEvidence,
} from '@/application/services/productionJourneyService';

function baseEvidence(overrides: Partial<JourneyEvidence> = {}): JourneyEvidence {
  return {
    projectId: 'project_1',
    projectSlug: 'trieu-ngoc-tap-thu-nghiem',
    activeEpisodeId: 'episode_1',
    episodeCount: 1,
    scenesCount: 0,
    shotsCount: 0,
    shots: [],
    pendingAssets: 0,
    approvedAssets: 0,
    readyForCompose: false,
    readyShots: 0,
    totalShots: 0,
    missingAnchors: 0,
    warnings: [],
    continuityFindings: [],
    exportsCount: 0,
    latestPublishStatus: null,
    providerCanGenerate: true,
    computedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('production journey read model — pure derivation', () => {
  it('Always returns exactly six phases in canonical order', () => {
    const state = deriveProductionJourneyState(baseEvidence());
    expect(state.phases.map((phase) => phase.phase)).toEqual([...JOURNEY_PHASES]);
    expect(state.phases).toHaveLength(6);
  });

  it('a new project with no episode shows Setup as the only actionable phase', () => {
    const state = deriveProductionJourneyState(baseEvidence({ episodeCount: 0, activeEpisodeId: null }));

    expect(state.phases.every((phase) => phase.state === 'NOT_STARTED')).toBe(true);
    expect(state.phases.every((phase) => phase.blockers.length === 0 && phase.warnings.length === 0)).toBe(true);
    expect(state.primaryAction?.id).toBe('setup.create-first-episode');
    expect(state.primaryAction?.targetRoute).toBe('/projects/trieu-ngoc-tap-thu-nghiem');
  });

  it('Episode with no Scene leaves Plan/Produce/Review/Finish Not Started', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({ warnings: [], scenesCount: 0 }), // script implicitly parsed (no script warnings), zero scenes
    );

    const develop = state.phases.find((phase) => phase.phase === 'develop')!;
    expect(develop.state).toBe('IN_PROGRESS');
    for (const phase of ['plan', 'produce', 'review', 'finish'] as const) {
      const found = state.phases.find((p) => p.phase === phase)!;
      expect(found.state).toBe('NOT_STARTED');
      expect(found.blockers).toHaveLength(0);
      expect(found.warnings).toHaveLength(0);
      expect(found.nextActions).toHaveLength(0);
    }
  });

  it('Scene with no Shot produces a Plan warning and the build-shots action', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 2,
        shotsCount: 0,
        warnings: [{ key: 'shots', label: 'Shots missing', detail: 'No persisted shots.', href: '/projects/trieu-ngoc-tap-thu-nghiem/shots' }],
      }),
    );

    const plan = state.phases.find((phase) => phase.phase === 'plan')!;
    expect(plan.state).toBe('IN_PROGRESS');
    expect(plan.warnings.map((issue) => issue.id)).toEqual(['warning.shots']);
    expect(plan.blockers).toHaveLength(0);
    expect(state.primaryAction?.id).toBe('plan.build-shots');
    expect(state.primaryAction?.blocking).toBe(false);
    for (const phase of ['produce', 'review', 'finish'] as const) {
      expect(state.phases.find((p) => p.phase === phase)!.state).toBe('NOT_STARTED');
    }
  });

  it('Shot planning incomplete: shots exist with no compiled prompt yet', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 1,
        totalShots: 1,
        shots: [{ promptCount: 0, assetCoverage: { total: 0, approved: 0 } }],
      }),
    );

    const produce = state.phases.find((phase) => phase.phase === 'produce')!;
    expect(produce.state).toBe('NOT_STARTED');
    expect(state.primaryAction?.id).toBe('produce.compile-prompts');
    expect(state.primaryAction?.phase).toBe('produce');
  });

  it('Prompt-ready state: prompts compiled but no assets generated yet', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 1,
        totalShots: 1,
        shots: [{ promptCount: 1, assetCoverage: { total: 0, approved: 0 } }],
      }),
    );

    const produce = state.phases.find((phase) => phase.phase === 'produce')!;
    expect(produce.state).toBe('IN_PROGRESS');
    expect(produce.progress).toBeNull();
  });

  it('Missing compiled prompts across several shots is reported by count', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 3,
        readyShots: 3,
        totalShots: 3,
        shots: [
          { promptCount: 1, assetCoverage: { total: 1, approved: 1 } },
          { promptCount: 0, assetCoverage: { total: 0, approved: 0 } },
          { promptCount: 0, assetCoverage: { total: 0, approved: 0 } },
        ],
      }),
    );

    const action = state.primaryAction;
    expect(action?.id).toBe('produce.compile-prompts');
    expect(action?.reason).toContain('2 shot(s)');
  });

  it('a project with a blocked generation provider shows the blocker before any Produce-phase warning', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 2,
        readyShots: 2,
        totalShots: 2,
        providerCanGenerate: false,
        shots: [
          { promptCount: 1, assetCoverage: { total: 0, approved: 0 } },
          { promptCount: 0, assetCoverage: { total: 0, approved: 0 } }, // a lower-priority Produce warning also present
        ],
      }),
    );

    expect(state.primaryAction?.id).toBe('produce.configure-provider');
    expect(state.primaryAction?.priority).toBe(0);
    expect(state.primaryAction?.targetRoute).toBe('/providers');
    const produce = state.phases.find((phase) => phase.phase === 'produce')!;
    expect(produce.state).toBe('BLOCKED');
    expect(produce.blockers.map((issue) => issue.id)).toContain('produce.provider-unavailable');
  });

  it('Unsupported capability never creates an action when there is nothing to generate yet', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 0,
        totalShots: 1,
        providerCanGenerate: false,
        shots: [{ promptCount: 0, assetCoverage: { total: 0, approved: 0 } }], // no compiled prompt yet
      }),
    );

    expect(state.primaryAction?.id).not.toBe('produce.configure-provider');
    expect(state.blockers.some((issue) => issue.id === 'produce.provider-unavailable')).toBe(false);
  });

  it('Pending asset review surfaces a Review action', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 1,
        totalShots: 1,
        pendingAssets: 3,
        warnings: [{ key: 'asset-review', label: 'Asset review pending', detail: '3 assets pending.', href: '/projects/trieu-ngoc-tap-thu-nghiem/assets' }],
        shots: [{ promptCount: 1, assetCoverage: { total: 3, approved: 0 } }],
      }),
    );

    const review = state.phases.find((phase) => phase.phase === 'review')!;
    expect(review.warnings.map((issue) => issue.id)).toEqual(['warning.asset-review']);
    expect(state.primaryAction?.id).toBe('review.pending-assets');
  });

  it('Produce is not Complete while approved assets are still fewer than total (pending review)', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 1,
        totalShots: 1,
        pendingAssets: 1,
        shots: [{ promptCount: 1, assetCoverage: { total: 1, approved: 0 } }],
      }),
    );

    const produce = state.phases.find((phase) => phase.phase === 'produce')!;
    expect(produce.state).toBe('IN_PROGRESS');
    expect(produce.progress).toBe(0);
  });

  it('currentPhase reports the first BLOCKED phase even when an earlier phase is only Not Started', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        episodeCount: 1,
        scenesCount: 0, // Develop stays IN_PROGRESS (not blocked, not started downstream)
        warnings: [{ key: 'script-empty', label: 'Script empty', detail: 'x', href: '/projects/trieu-ngoc-tap-thu-nghiem/script' }],
      }),
    );

    const develop = state.phases.find((phase) => phase.phase === 'develop')!;
    expect(develop.state).toBe('BLOCKED');
    expect(state.currentPhase).toBe('develop');
  });

  it('currentPhase reports the first phase not Complete when nothing is blocked', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 0, // Plan stays IN_PROGRESS; nothing is BLOCKED anywhere
      }),
    );

    const plan = state.phases.find((phase) => phase.phase === 'plan')!;
    expect(plan.state).toBe('IN_PROGRESS');
    expect(state.currentPhase).toBe('plan');
  });

  it('Export-ready state recommends running the export', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 1,
        totalShots: 1,
        readyForCompose: true,
        shots: [{ promptCount: 1, assetCoverage: { total: 1, approved: 1 } }],
      }),
    );

    const finish = state.phases.find((phase) => phase.phase === 'finish')!;
    expect(finish.state).toBe('READY');
    expect(state.primaryAction?.id).toBe('finish.run-export');
    expect(state.primaryAction?.targetRoute).toBe('/projects/trieu-ngoc-tap-thu-nghiem/export');
  });

  it('a fully complete project shows all six phases as Complete with no primary action', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 1,
        totalShots: 1,
        readyForCompose: true,
        exportsCount: 1,
        latestPublishStatus: 'completed',
        shots: [{ promptCount: 1, assetCoverage: { total: 1, approved: 1 } }],
      }),
    );

    expect(state.phases.every((phase) => phase.state === 'COMPLETE')).toBe(true);
    expect(state.primaryAction).toBeNull();
    expect(state.secondaryActions).toHaveLength(0);
    expect(state.currentPhase).toBe('finish');
  });

  it('Unknown progress returns null instead of a fabricated percentage', () => {
    const state = deriveProductionJourneyState(baseEvidence());
    const setup = state.phases.find((phase) => phase.phase === 'setup')!;
    const develop = state.phases.find((phase) => phase.phase === 'develop')!;
    const review = state.phases.find((phase) => phase.phase === 'review')!;
    const finish = state.phases.find((phase) => phase.phase === 'finish')!;

    expect(setup.progress).toBeNull();
    expect(develop.progress).toBeNull();
    expect(review.progress).toBeNull();
    expect(finish.progress).toBeNull();
  });

  it('exactly one primary next action is shown', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 0,
        totalShots: 1,
        pendingAssets: 2,
        missingAnchors: 1,
        warnings: [
          { key: 'anchors', label: 'Production references incomplete', detail: '1 pinned snapshot needs an anchor.', href: '/projects/trieu-ngoc-tap-thu-nghiem/production' },
          { key: 'asset-review', label: 'Asset review pending', detail: '2 assets pending.', href: '/projects/trieu-ngoc-tap-thu-nghiem/assets' },
        ],
        shots: [{ promptCount: 1, assetCoverage: { total: 2, approved: 0 } }],
      }),
    );

    expect(state.primaryAction).not.toBeNull();
    // Exactly one action is the primary; every other candidate lands in secondaryActions.
    const allActionIds = state.phases.flatMap((phase) => phase.nextActions.map((action) => action.id));
    const uniqueIds = new Set(allActionIds);
    expect(uniqueIds.has(state.primaryAction!.id)).toBe(true);
    expect(state.primaryAction?.id).toBe('plan.resolve-missing-anchors'); // lower priority band (2) than review (4)
  });

  it('Blocker outranks warning: a continuity error wins over a lower-priority Produce warning', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 1,
        totalShots: 1,
        continuityFindings: [{ rule: 'location-break', severity: 'error', message: 'Location changes without a transition.', shotCodes: ['EP01_SC01_SH001'] }],
        shots: [{ promptCount: 0, assetCoverage: { total: 0, approved: 0 } }],
      }),
    );

    expect(state.primaryAction?.id).toBe('review.resolve-continuity-errors');
    expect(state.primaryAction?.priority).toBe(0);
    const review = state.phases.find((phase) => phase.phase === 'review')!;
    expect(review.state).toBe('BLOCKED');
    expect(review.blockers).toHaveLength(1);
  });

  it('Stable action tiebreak: same priority band, earlier phase wins', () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 3,
        shotsCount: 0,
        missingAnchors: 1,
        warnings: [
          { key: 'script-empty', label: 'Script empty', detail: 'No script content.', href: '/projects/trieu-ngoc-tap-thu-nghiem/script' },
        ],
      }),
    );

    // develop.write-script and plan.resolve-missing-anchors are both priority 2;
    // develop precedes plan in JOURNEY_PHASES, so develop must win the tie.
    expect(state.primaryAction?.id).toBe('develop.write-script');
    expect(state.primaryAction?.phase).toBe('develop');
  });

  it("every phase's module shortcut points at a real, already-existing route", () => {
    const state = deriveProductionJourneyState(
      baseEvidence({
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 0,
        totalShots: 1,
        missingAnchors: 1,
        pendingAssets: 1,
        providerCanGenerate: false,
        continuityFindings: [
          { rule: 'location-break', severity: 'error', message: 'x', shotCodes: ['EP01_SC01_SH001'] },
          { rule: 'prop-continuity-gap', severity: 'warning', message: 'y', shotCodes: ['EP01_SC01_SH002'] },
        ],
        warnings: [
          { key: 'anchors', label: 'a', detail: 'a', href: '/projects/trieu-ngoc-tap-thu-nghiem/production' },
          { key: 'asset-review', label: 'b', detail: 'b', href: '/projects/trieu-ngoc-tap-thu-nghiem/assets' },
          { key: 'generation-failures', label: 'c', detail: 'c', href: '/projects/trieu-ngoc-tap-thu-nghiem/queue' },
        ],
        shots: [{ promptCount: 1, assetCoverage: { total: 1, approved: 0 } }],
      }),
    );

    const allRoutes = [
      ...state.blockers.map((issue) => issue.targetRoute),
      ...state.warnings.map((issue) => issue.targetRoute),
      ...(state.primaryAction ? [state.primaryAction.targetRoute] : []),
      ...state.secondaryActions.map((action) => action.targetRoute),
    ];
    expect(allRoutes.length).toBeGreaterThan(0);
    for (const route of allRoutes) {
      expect(isKnownJourneyRoute(route, state.projectSlug)).toBe(true);
      expect(route).not.toContain('/nodeplot');
      expect(route).not.toMatch(/\/settings$/);
      expect(route).not.toMatch(/\/activity$/);
    }
  });

  it('No route ever targets a different project slug', () => {
    const state = deriveProductionJourneyState(baseEvidence({ projectSlug: 'my-project', episodeCount: 0 }));
    expect(state.primaryAction?.targetRoute.startsWith('/projects/my-project')).toBe(true);
    expect(isKnownJourneyRoute('/projects/other-project', 'my-project')).toBe(false);
  });

  it('Derivation is a pure, idempotent function of its evidence', () => {
    const evidence = Object.freeze(
      baseEvidence({ scenesCount: 1, shotsCount: 1, readyShots: 1, totalShots: 1, shots: [{ promptCount: 1, assetCoverage: { total: 1, approved: 1 } }] }),
    );
    const first = deriveProductionJourneyState(evidence);
    const second = deriveProductionJourneyState(evidence);
    expect(second).toEqual(first);
  });
});
