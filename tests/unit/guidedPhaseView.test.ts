import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GuidedPhaseView,
  PhaseCriteriaList,
  PhaseContextPanel,
} from '@/components/creative-workspace/GuidedPhaseView';
import { ProductionJourneyHome } from '@/components/creative-workspace/ProductionJourneyHome';
// Raw source text — used only to prove the component contains no
// browser-storage or journey-derivation logic, never to read filesystem
// state from a test (node:fs is off-limits outside
// src/infrastructure/**/scripts/**, per .claude/rules/01-architecture.md #7).
import guidedPhaseViewSource from '@/components/creative-workspace/GuidedPhaseView.tsx?raw';
// Same technique proves purpose/question text stays byte-for-byte in sync
// with the planning document it is copied from (a content-drift regression
// test, per docs/tasks/TASK-UI-PRODUCTION-JOURNEY-001.md §8 Slice 3).
import phasesDoc from '../../docs/product/PRODUCTION-JOURNEY-PHASES.md?raw';
import {
  deriveProductionJourneyState,
  isKnownJourneyRoute,
  JOURNEY_PHASES,
  type JourneyAction,
  type JourneyEvidence,
  type JourneyIssue,
  type JourneyPhase,
  type JourneyPhaseState,
  type JourneyPhaseStateValue,
  type ProductionJourneyState,
} from '@/application/services/productionJourneyService';

Object.assign(globalThis, { React });

const SLUG = 'trieu-ngoc-tap-thu-nghiem';

function phase(overrides: Partial<JourneyPhaseState> & { phase: JourneyPhase }): JourneyPhaseState {
  return { state: 'NOT_STARTED', progress: null, blockers: [], warnings: [], nextActions: [], ...overrides };
}

function journeyFixture(overrides: Partial<ProductionJourneyState> = {}): ProductionJourneyState {
  return {
    projectId: 'project_1',
    projectSlug: SLUG,
    activeEpisodeId: 'episode_1',
    phases: JOURNEY_PHASES.map((p) => phase({ phase: p })),
    currentPhase: 'setup',
    primaryAction: null,
    secondaryActions: [],
    blockers: [],
    warnings: [],
    computedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function action(overrides: Partial<JourneyAction> = {}): JourneyAction {
  return {
    id: 'setup.create-first-episode',
    label: 'Create your first episode',
    reason: 'No episode exists yet — every later step needs one',
    targetRoute: `/projects/${SLUG}`,
    phase: 'setup',
    priority: 1,
    blocking: true,
    evidenceSource: 'episodeService.listEpisodes',
    ...overrides,
  };
}

function issue(overrides: Partial<JourneyIssue> = {}): JourneyIssue {
  return {
    id: 'warning.script-empty',
    severity: 'WARNING',
    phase: 'develop',
    message: 'Script empty',
    reason: 'No script content is available for the selected episode.',
    evidenceSource: 'creativeWorkspaceService.overview().warnings',
    affectedEntity: null,
    targetRoute: `/projects/${SLUG}/script`,
    blocksPhase: false,
    ...overrides,
  };
}

function renderGuidedView(journey: ProductionJourneyState): string {
  return renderToStaticMarkup(React.createElement(GuidedPhaseView, { journey }));
}

function renderHome(journey: ProductionJourneyState): string {
  return renderToStaticMarkup(React.createElement(ProductionJourneyHome, { journey }));
}

/** Extracts a phase's raw markdown section from PRODUCTION-JOURNEY-PHASES.md. */
function extractPhaseSection(heading: string): string {
  const pattern = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = phasesDoc.match(pattern);
  if (!match) throw new Error(`Section not found in PHASES.md: ${heading}`);
  return match[1]!;
}

function extractPurpose(section: string): string {
  const match = section.match(/\*\*Purpose:\*\* ([\s\S]*?)\n\n/);
  if (!match) throw new Error('Purpose field not found');
  return match[1]!.replace(/\s+/g, ' ').trim();
}

function extractQuestion(section: string): string {
  const match = section.match(/\*\*User question answered:\*\* "([\s\S]*?)"\n/);
  if (!match) throw new Error('User question answered field not found');
  return match[1]!.replace(/\s+/g, ' ').trim();
}

const PHASE_HEADING: Record<JourneyPhase, string> = {
  setup: 'Setup',
  develop: 'Develop',
  plan: 'Plan',
  produce: 'Produce',
  review: 'Review',
  finish: 'Finish',
};

function normalize(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('guided phase view', () => {
  it('Current phase view renders from the service result', () => {
    const html = renderGuidedView(journeyFixture({ currentPhase: 'develop' }));
    expect(html).toContain('Guided view: Develop');
    expect(html).toContain('Completion criteria');
  });

  for (const p of JOURNEY_PHASES) {
    it(`Correct phase explanation appears for all six phases: ${p}`, () => {
      const section = extractPhaseSection(PHASE_HEADING[p]);
      const purpose = extractPurpose(section);
      const question = extractQuestion(section);
      const html = renderGuidedView(journeyFixture({ currentPhase: p }));
      const text = normalize(html);
      expect(text).toContain(purpose);
      expect(text).toContain(question);
    });
  }

  it('Completion criteria render with textual states', () => {
    const blockerIssue = issue({ id: 'warning.script-empty', severity: 'BLOCKER', phase: 'develop', blocksPhase: true });
    const html = renderGuidedView(
      journeyFixture({
        currentPhase: 'develop',
        phases: JOURNEY_PHASES.map((p) =>
          phase({ phase: p, state: p === 'develop' ? 'BLOCKED' : 'NOT_STARTED', blockers: p === 'develop' ? [blockerIssue] : [] }),
        ),
      }),
    );
    expect(html).toContain('(Blocked)');
    expect(html).toContain('(Unavailable)');
    expect(html).not.toMatch(/\d+%/);
  });

  it('Unsupported criteria do not appear complete', () => {
    // Setup's "Output profile fields are set" criterion has no field-level
    // evidence (evidence: null) — it must never read "(Complete)", even
    // when Setup's overall phase state is COMPLETE.
    const html = renderGuidedView(
      journeyFixture({
        currentPhase: 'setup',
        phases: JOURNEY_PHASES.map((p) => phase({ phase: p, state: p === 'setup' ? 'COMPLETE' : 'NOT_STARTED' })),
      }),
    );
    const outputProfileLine = html.split('Output profile fields are set')[1]?.slice(0, 120) ?? '';
    expect(outputProfileLine).toContain('(Unavailable)');
    expect(outputProfileLine).not.toContain('(Complete)');
  });

  it('Shortcuts use existing routes only', () => {
    for (const p of JOURNEY_PHASES) {
      const html = renderGuidedView(journeyFixture({ currentPhase: p }));
      const nav = html.match(new RegExp(`<nav aria-label="[^"]*module shortcuts"[^>]*>[\\s\\S]*?</nav>`))?.[0] ?? '';
      const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(isKnownJourneyRoute(href, SLUG), `${href} is not a known journey route`).toBe(true);
      }
    }
  });

  it('No duplicate primary action is introduced: the same action is referenced, never re-selected', () => {
    const develop = action({ id: 'develop.write-script', label: 'Write or paste your script', phase: 'develop', targetRoute: `/projects/${SLUG}/script` });
    const html = renderHome(journeyFixture({ currentPhase: 'develop', primaryAction: develop }));
    // Exactly one primary-action card exists (Slice 2's own, unique heading) —
    // the guided view never renders a second independent action card.
    expect(html.match(/id="journey-primary-action-title"/g)?.length).toBe(1);
    expect(html).toContain('Next step for this phase');
    // The guided view's connection links to the exact same target route the
    // primary-action card itself uses — a reference, never a new selection.
    const connectionMatch = html.match(/Next step for this phase: <a[^>]*href="([^"]+)"/);
    expect(connectionMatch?.[1]).toBe(develop.targetRoute);
  });

  it('references, rather than duplicates, an action belonging to a different phase', () => {
    const produceAction = action({ id: 'produce.compile-prompts', label: 'Compile missing prompts', phase: 'produce', targetRoute: `/projects/${SLUG}` });
    const html = renderGuidedView(journeyFixture({ currentPhase: 'setup', primaryAction: produceAction }));
    expect(html).not.toContain('Compile missing prompts');
    expect(html).toContain('The current recommended action is in the Produce phase');
  });

  it('Blockers and warnings are not fully duplicated from Slice 2', () => {
    const blockerIssue = issue({
      id: 'warning.script-empty',
      severity: 'BLOCKER',
      phase: 'develop',
      message: 'A very specific blocker message that must not repeat verbatim',
      blocksPhase: true,
    });
    const html = renderHome(
      journeyFixture({
        currentPhase: 'develop',
        blockers: [blockerIssue],
        phases: JOURNEY_PHASES.map((p) => phase({ phase: p, state: p === 'develop' ? 'BLOCKED' : 'NOT_STARTED', blockers: p === 'develop' ? [blockerIssue] : [] })),
      }),
    );
    // The full message appears exactly once (Slice 2's blocker banner) —
    // the guided view only shows a count, never the message text again.
    const occurrences = html.match(/A very specific blocker message that must not repeat verbatim/g)?.length ?? 0;
    expect(occurrences).toBe(1);
    expect(html).toContain('1 blocker affects this phase');
  });

  it('Existing Journey Home remains present alongside the guided view', () => {
    const html = renderHome(journeyFixture({ primaryAction: action({ blocking: false }) }));
    expect(html).toContain('Production journey');
    expect(html).toContain('Next action');
    expect(html).toContain('Journey warnings');
    expect(html).toContain('Phase progress');
    expect(html).toContain('Guided view: Setup');
  });

  it('No journey derivation is reimplemented in the UI', () => {
    const codeOnly = guidedPhaseViewSource
      .split('\n')
      .filter((line: string) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    expect(codeOnly).not.toMatch(/from ['"]@\/application\/services\/(creativeWorkspaceService|continuityService|episodeService|exportService|publishService)['"]/);
    expect(codeOnly).not.toMatch(/\.sort\(|priority\s*-|severity\s*===\s*'BLOCKER'\s*\?/);
  });

  it('No localStorage, sessionStorage or IndexedDB use', () => {
    expect(guidedPhaseViewSource).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('renders safely for every phase state value: empty, blocked, in progress, ready and complete', () => {
    const states: JourneyPhaseStateValue[] = ['NOT_STARTED', 'BLOCKED', 'IN_PROGRESS', 'READY', 'COMPLETE'];
    for (const state of states) {
      const blockerIssue = issue({ id: 'warning.script-empty', severity: 'BLOCKER', phase: 'develop', blocksPhase: true });
      expect(() =>
        renderGuidedView(
          journeyFixture({
            currentPhase: 'develop',
            phases: JOURNEY_PHASES.map((p) =>
              phase({ phase: p, state: p === 'develop' ? state : 'NOT_STARTED', blockers: p === 'develop' && state === 'BLOCKED' ? [blockerIssue] : [] }),
            ),
          }),
        ),
      ).not.toThrow();
    }
  });

  it('Keyboard and accessible labels are present', () => {
    const html = renderGuidedView(journeyFixture({ currentPhase: 'develop', primaryAction: action({ phase: 'develop', targetRoute: `/projects/${SLUG}/script` }) }));
    expect(html).toContain('aria-label="Guided view: Develop"');
    expect(html).toMatch(/aria-label="Develop module shortcuts"/);
    // Every shortcut and the primary-action reference are real anchor
    // elements — Tab-reachable, never a div with onClick.
    expect((html.match(/<a /g)?.length ?? 0)).toBeGreaterThanOrEqual(4); // 3 Develop shortcuts + 1 action link
    // Criteria are a real semantic list, not a styled div soup.
    expect(html).toMatch(/<ul[^>]*>[\s\S]*?<li[^>]*>[\s\S]*?<\/li>[\s\S]*?<\/ul>/);
  });

  it('PhaseContextPanel and PhaseCriteriaList are independently composable presentation components', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhaseContextPanel, { journey: journeyFixture(), phaseState: phase({ phase: 'setup', state: 'COMPLETE' }) }),
    );
    expect(html).toContain('Guided view: Setup');
    const criteriaHtml = renderToStaticMarkup(
      React.createElement(PhaseCriteriaList, { phase: 'plan', phaseState: phase({ phase: 'plan', state: 'IN_PROGRESS' }) }),
    );
    expect(criteriaHtml).toContain('Completion criteria');
  });

  it('projectRoute-built shortcuts never resolve to a route outside the accepted allow-list, for any phase', () => {
    for (const p of JOURNEY_PHASES) {
      const html = renderGuidedView(journeyFixture({ currentPhase: p }));
      expect(html).not.toMatch(/href="\/settings|href="\/activity|href="\/journey|href="\/templates/);
    }
  });
});

/**
 * Criterion-to-issue-id drift protection.
 *
 * `PHASE_CRITERIA`'s `evidence.issueIds`/`issuePrefixes` in GuidedPhaseView.tsx
 * are literal strings that must stay in sync with the exact issue ids
 * `productionJourneyService.ts` actually emits (`warning.<key>`,
 * `produce.provider-unavailable`, `continuity.<rule>.<shotCodes>`) — unlike
 * the route suffixes (compile-time enforced via `Parameters<typeof
 * projectRoute>[1]`), this coupling has no type-level guarantee: if the
 * service ever renamed a warning key, `criterionStatus` would silently fall
 * through to 'complete' rather than fail loudly. This block proves the
 * coupling end-to-end using the service's own real, exported
 * `deriveProductionJourneyState` — never a second, hand-typed mirror of its
 * issue ids — so a future rename in productionJourneyService.ts breaks this
 * test, not just the (identical) literal in GuidedPhaseView.tsx.
 */
describe('guided phase view — criterion-to-issue-id drift protection', () => {
  const SLUG2 = 'trieu-ngoc-tap-thu-nghiem';

  function baseEvidence(overrides: Partial<JourneyEvidence> = {}): JourneyEvidence {
    return {
      projectId: 'project_1',
      projectSlug: SLUG2,
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

  const cases: { name: string; phase: JourneyPhase; evidence: Partial<JourneyEvidence>; criterionLabel: string; expectedStatus: 'blocked' | 'incomplete' }[] = [
    {
      name: 'develop / script-empty blocks "A script has been written"',
      phase: 'develop',
      evidence: { warnings: [{ key: 'script-empty', label: 'Script empty', detail: 'No script content', href: `/projects/${SLUG2}/script` }] },
      criterionLabel: 'A script has been written',
      expectedStatus: 'blocked',
    },
    {
      name: 'develop / script-unparsed blocks "The script has been parsed into scenes"',
      phase: 'develop',
      evidence: { warnings: [{ key: 'script-unparsed', label: 'Script unparsed', detail: 'Script has not been parsed', href: `/projects/${SLUG2}/script` }] },
      criterionLabel: 'The script has been parsed into scenes',
      expectedStatus: 'blocked',
    },
    {
      name: 'plan / anchors blocks "Every pinned Bible snapshot has an approved consistency-gate anchor"',
      phase: 'plan',
      evidence: {
        scenesCount: 1,
        shotsCount: 1,
        readyShots: 0,
        totalShots: 1,
        missingAnchors: 1,
        warnings: [{ key: 'anchors', label: 'Missing anchor', detail: 'A pinned snapshot has no anchor', href: `/projects/${SLUG2}/production` }],
      },
      criterionLabel: 'Every pinned Bible snapshot has an approved consistency-gate anchor',
      expectedStatus: 'blocked',
    },
    {
      name: 'plan / shots warns "Every scene has at least one shot"',
      phase: 'plan',
      evidence: {
        scenesCount: 1,
        shotsCount: 0,
        warnings: [{ key: 'shots', label: 'No shots yet', detail: 'Scenes exist with no shots yet', href: `/projects/${SLUG2}/shots` }],
      },
      criterionLabel: 'Every scene has at least one shot',
      expectedStatus: 'incomplete',
    },
    {
      name: 'produce / shot-media warns "Generated media exists for every compiled prompt"',
      phase: 'produce',
      evidence: {
        shotsCount: 1,
        shots: [{ promptCount: 1, assetCoverage: { total: 0, approved: 0 } }],
        warnings: [{ key: 'shot-media', label: 'Media missing', detail: 'Shots are missing generated media', href: `/projects/${SLUG2}/assets` }],
      },
      criterionLabel: 'Generated media exists for every compiled prompt',
      expectedStatus: 'incomplete',
    },
    {
      name: 'produce / generation-failures blocks "No generation job has failed without a resolution"',
      phase: 'produce',
      evidence: {
        shotsCount: 1,
        shots: [{ promptCount: 1, assetCoverage: { total: 0, approved: 0 } }],
        warnings: [{ key: 'generation-failures', label: 'Generation failed', detail: 'A job failed', href: `/projects/${SLUG2}/queue` }],
      },
      criterionLabel: 'No generation job has failed without a resolution',
      expectedStatus: 'blocked',
    },
    {
      name: 'produce / no available provider blocks "A provider is configured for the required generation capability"',
      phase: 'produce',
      evidence: {
        shotsCount: 1,
        shots: [{ promptCount: 1, assetCoverage: { total: 0, approved: 0 } }],
        providerCanGenerate: false,
      },
      criterionLabel: 'A provider is configured for the required generation capability',
      expectedStatus: 'blocked',
    },
    {
      name: 'review / asset-review warns "No generated asset is still awaiting approval"',
      phase: 'review',
      evidence: {
        shotsCount: 1,
        shots: [{ promptCount: 1, assetCoverage: { total: 1, approved: 0 } }],
        pendingAssets: 1,
        warnings: [{ key: 'asset-review', label: 'Assets pending', detail: 'Assets await approval', href: `/projects/${SLUG2}/assets` }],
      },
      criterionLabel: 'No generated asset is still awaiting approval',
      expectedStatus: 'incomplete',
    },
    {
      name: 'review / a continuity finding warns "No continuity finding is unresolved"',
      phase: 'review',
      evidence: {
        shotsCount: 1,
        shots: [{ promptCount: 1, assetCoverage: { total: 0, approved: 0 } }],
        continuityFindings: [{ rule: 'test-rule', severity: 'warning', message: 'A continuity finding', shotCodes: ['EP01_SC01_SH001'] }],
      },
      criterionLabel: 'No continuity finding is unresolved',
      expectedStatus: 'incomplete',
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const journey = deriveProductionJourneyState(baseEvidence(testCase.evidence));
      const html = renderToStaticMarkup(React.createElement(GuidedPhaseView, { journey: { ...journey, currentPhase: testCase.phase } }));
      const line = html.split(testCase.criterionLabel)[1]?.slice(0, 300) ?? '';
      const expectedText = testCase.expectedStatus === 'blocked' ? '(Blocked)' : '(Incomplete)';
      expect(line, `expected "${testCase.criterionLabel}" to show ${expectedText}, got: ${line}`).toContain(expectedText);
      expect(line).toContain('Resolve');
    });
  }
});
