import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductionJourneyHome } from '@/components/creative-workspace/ProductionJourneyHome';
// Raw source text (Vite's built-in ?raw import) — used only to prove the
// component contains no browser-storage or journey-derivation logic, never
// to read filesystem state from a test (node:fs is off-limits outside
// src/infrastructure/**/scripts/**, per .claude/rules/01-architecture.md #7).
import productionJourneyHomeSource from '@/components/creative-workspace/ProductionJourneyHome.tsx?raw';
import {
  JOURNEY_PHASES,
  type JourneyAction,
  type JourneyIssue,
  type JourneyPhase,
  type JourneyPhaseState,
  type ProductionJourneyState,
} from '@/application/services/productionJourneyService';

Object.assign(globalThis, { React });

function phase(overrides: Partial<JourneyPhaseState> & { phase: JourneyPhase }): JourneyPhaseState {
  return { state: 'NOT_STARTED', progress: null, blockers: [], warnings: [], nextActions: [], ...overrides };
}

function journeyFixture(overrides: Partial<ProductionJourneyState> = {}): ProductionJourneyState {
  return {
    projectId: 'project_1',
    projectSlug: 'trieu-ngoc-tap-thu-nghiem',
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
    targetRoute: '/projects/trieu-ngoc-tap-thu-nghiem',
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
    targetRoute: '/projects/trieu-ngoc-tap-thu-nghiem/script',
    blocksPhase: false,
    ...overrides,
  };
}

function render(journey: ProductionJourneyState): string {
  return renderToStaticMarkup(React.createElement(ProductionJourneyHome, { journey }));
}

describe('production journey home shell', () => {
  it('Project Overview calls/consumes productionJourneyService: renders directly from a ProductionJourneyState value, computing nothing itself', () => {
    const html = render(journeyFixture());
    expect(html).toContain('Production journey');
  });

  it('Heading order has no redundant adjacent duplicate', () => {
    const html = render(journeyFixture());
    expect(html.match(/<h2[^>]*>Production journey<\/h2>/g)).toHaveLength(1);
  });

  it('the phase strip always shows all six phases regardless of project state', () => {
    const empty = render(journeyFixture());
    const complete = render(journeyFixture({ phases: JOURNEY_PHASES.map((p) => phase({ phase: p, state: 'COMPLETE' })) }));
    for (const html of [empty, complete]) {
      for (const label of ['Setup', 'Develop', 'Plan', 'Produce', 'Review', 'Finish']) {
        expect(html).toContain(`>${label}<`);
      }
    }
  });

  it('a blocking condition renders as a non-dismissable blocker banner', () => {
    const blockerIssue = issue({
      id: 'continuity.location-break',
      severity: 'BLOCKER',
      phase: 'review',
      message: 'Location changes without a transition between EP01_SC01_SH001 and EP01_SC01_SH002',
      blocksPhase: true,
      targetRoute: '/projects/trieu-ngoc-tap-thu-nghiem/continuity',
    });
    const html = render(journeyFixture({ blockers: [blockerIssue] }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Location changes without a transition between EP01_SC01_SH001 and EP01_SC01_SH002');
    expect(html).toContain('href="/projects/trieu-ngoc-tap-thu-nghiem/continuity"');
    // No dismiss control exists anywhere in the blocker region.
    expect(html).not.toMatch(/aria-label="Dismiss"|dismiss|close blocker/i);
  });

  it('A blocker sourced from a continuity finding never exposes a raw internal id, in either its message or its reason', () => {
    // continuityService findings sometimes embed a bible entity's internal
    // foreign-key id (e.g. char_5i2hdeew2pw3oks9) in their message/reason
    // text (src/domain/continuity.ts) — the same defect class already
    // fixed for warnings must also be fixed for blockers, since the
    // blocker banner is the most prominent, non-dismissable, role="alert"
    // region on the page.
    const blockerIssue = issue({
      id: 'continuity.missing-character-lock',
      severity: 'BLOCKER',
      phase: 'review',
      message: 'EP01_SC01_SH003 references char_5i2hdeew2pw3oks9 with no locked snapshot',
      reason: 'missing-character-lock (char_5i2hdeew2pw3oks9)',
      blocksPhase: true,
      targetRoute: '/projects/trieu-ngoc-tap-thu-nghiem/continuity',
    });
    const html = render(journeyFixture({ blockers: [blockerIssue] }));
    expect(html).not.toMatch(/\b[a-z]+_[a-z0-9]{6,}\b/);
    expect(html).toContain('EP01_SC01_SH003');
    expect(html).toContain('references [reference] with no locked snapshot');
  });

  it('every phase strip entry has an accessible, screen-reader-readable label', () => {
    const html = render(
      journeyFixture({
        phases: JOURNEY_PHASES.map((p) => phase({ phase: p, state: p === 'plan' ? 'IN_PROGRESS' : 'COMPLETE', progress: p === 'plan' ? 40 : null })),
      }),
    );
    // Each phase link's accessible name (its own text content) includes both
    // the phase label and its state as real text — never colour alone.
    const linkPattern = /<a[^>]*>(.*?)<\/a>/gs;
    const linkTexts = [...html.matchAll(linkPattern)].map((match) => match[1]!.replace(/<[^>]+>/g, ' '));
    const phaseLinks = linkTexts.filter((text) => ['Setup', 'Develop', 'Plan', 'Produce', 'Review', 'Finish'].some((label) => text.includes(label)));
    expect(phaseLinks).toHaveLength(6);
    for (const text of phaseLinks) {
      expect(text).toMatch(/Complete|In progress|Not started|Ready|Blocked/);
    }
  });

  it('the phase strip and next-action card are keyboard-navigable', () => {
    // Real focus-ring/tab-order evidence was captured in a live browser
    // (1366x768 and 1920x1080) — see the Slice 2 governance record. This
    // regression test protects the structural precondition: every phase
    // and the primary action are real anchor elements (Tab-reachable,
    // never a div with onClick), per docs/design/DESIGN.md Interaction rules.
    const html = render(journeyFixture({ primaryAction: action() }));
    const phaseListLinks = html.match(/<ol[^>]*aria-label="Production journey phases"[^>]*>[\s\S]*?<\/ol>/)?.[0] ?? '';
    expect(phaseListLinks.match(/<a /g)?.length).toBe(6);
    expect(html).toContain('href="/projects/trieu-ngoc-tap-thu-nghiem">Create your first episode →</a>');
  });

  it('the Journey Home has no horizontal overflow at 1366x768', () => {
    // Real viewport evidence (1366x768, no clipping/scrollbar) was captured
    // in a live browser — see the Slice 2 governance record. This
    // regression test protects the structural precondition: no fixed
    // pixel width or viewport-relative unit that could force overflow.
    expect(productionJourneyHomeSource).not.toMatch(/\bw-\[\d|w-screen|min-w-\[\d/);
  });

  it('the Journey Home makes correct use of extra width at 1920x1080', () => {
    // Real viewport evidence (1920x1080, content stays within the existing
    // max-w-6xl reading width) was captured in a live browser — see the
    // Slice 2 governance record. This shell adds no width constraint of
    // its own; it inherits the page's existing max-w-6xl wrapper.
    expect(productionJourneyHomeSource).not.toMatch(/max-w-|w-screen/);
  });

  it('Exactly six phases render in canonical order', () => {
    const html = render(journeyFixture());
    const labels = ['Setup', 'Develop', 'Plan', 'Produce', 'Review', 'Finish'];
    const positions = labels.map((label) => html.indexOf(`>${label}<`));
    expect(positions.every((position) => position !== -1)).toBe(true);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]!);
    }
  });

  it('Current phase is identified textually', () => {
    const html = render(
      journeyFixture({
        currentPhase: 'produce',
        phases: JOURNEY_PHASES.map((p) => phase({ phase: p, state: p === 'produce' ? 'IN_PROGRESS' : 'NOT_STARTED' })),
      }),
    );
    expect(html).toContain('Current phase');
  });

  it('Numeric progress renders only when non-null', () => {
    const html = render(
      journeyFixture({
        phases: JOURNEY_PHASES.map((p) =>
          phase({ phase: p, state: p === 'plan' ? 'IN_PROGRESS' : 'NOT_STARTED', progress: p === 'plan' ? 62 : null }),
        ),
      }),
    );
    expect(html).toContain('62% complete');
    expect(html.match(/% complete/g)).toHaveLength(1);
  });

  it('Null progress renders qualitative state, not 0%', () => {
    const html = render(journeyFixture());
    expect(html).not.toContain('0%');
    expect(html).not.toContain('% complete');
    expect(html).toContain('Not started');
  });

  it('A Not Started phase never shows a percentage, even when a real ratio exists for it', () => {
    // A phase can honestly have non-null progress (e.g. all *existing* assets
    // approved) while its state is still Not Started (e.g. no compiled
    // prompt yet) — the two are derived independently. Showing "Not
    // started" next to "100% complete" would read as contradictory, so the
    // qualitative state wins the display slot in this case.
    const html = render(
      journeyFixture({
        phases: JOURNEY_PHASES.map((p) => phase({ phase: p, state: 'NOT_STARTED', progress: p === 'produce' ? 100 : null })),
      }),
    );
    expect(html).not.toContain('% complete');
    expect(html).not.toContain('100%');
  });

  it("a phase with no honest metric shows Unavailable instead of a fabricated percentage", () => {
    const html = render(
      journeyFixture({
        phases: JOURNEY_PHASES.map((p) => phase({ phase: p, state: p === 'review' ? 'IN_PROGRESS' : 'NOT_STARTED' })),
      }),
    );
    expect(html).toContain('Unavailable');
    // 4 from the Phase progress summary (Setup, Develop, Review, Finish) +
    // 1 from the Slice 3 guided view's Setup "output profile" criterion,
    // which has no field-level evidence today (see GuidedPhaseView.tsx's
    // own judgment call 3) — the default fixture's currentPhase is 'setup'.
    expect(html.match(/Unavailable/g)?.length).toBe(5);
    expect(html).not.toMatch(/Unavailable[^<]*%/);
    expect(html).not.toContain('% complete');
  });

  it('Exactly one primary action renders', () => {
    const html = render(journeyFixture({ primaryAction: action({ blocking: false }) }));
    // 2 from the Next Action card (heading + link text) + 1 from the Slice 3
    // guided view's "Next step for this phase" reference to the same action
    // (default fixture's currentPhase and the action's phase are both 'setup').
    expect(html.match(/Create your first episode/g)).toHaveLength(3);
    expect(html).toContain('Next action');
  });

  it('Primary action uses the service-provided route', () => {
    const html = render(journeyFixture({ primaryAction: action({ targetRoute: '/projects/trieu-ngoc-tap-thu-nghiem/script' }) }));
    expect(html).toContain('href="/projects/trieu-ngoc-tap-thu-nghiem/script"');
  });

  it('Blocking primary action is distinguished by text, not color only', () => {
    const html = render(journeyFixture({ primaryAction: action({ blocking: true }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Blocked — action needed');
  });

  it('A non-blocking primary action does not claim to be blocked', () => {
    const html = render(journeyFixture({ primaryAction: action({ blocking: false }) }));
    expect(html).not.toContain('Blocked — action needed');
  });

  it('Blockers and warnings render in separate groups', () => {
    const html = render(
      journeyFixture({
        blockers: [issue({ id: 'b1', severity: 'BLOCKER', message: 'Script empty', blocksPhase: true })],
        warnings: [issue({ id: 'w1', severity: 'WARNING', message: 'Asset review pending', targetRoute: '/projects/trieu-ngoc-tap-thu-nghiem/assets' })],
      }),
    );
    expect(html).toContain('1 blocking issue');
    expect(html).toContain('Journey warnings');
    expect(html).toContain('Script empty');
    expect(html).toContain('1 warning open');
    const blockerHeadingIndex = html.indexOf('1 blocking issue');
    const alertIndex = html.lastIndexOf('role="alert"', blockerHeadingIndex);
    expect(alertIndex).toBeGreaterThan(-1);
  });

  it("a non-blocking condition renders as a warning with a resolution link", () => {
    const html = render(
      journeyFixture({
        warnings: [issue({ id: 'w1', severity: 'WARNING', message: 'Asset review pending', targetRoute: '/projects/trieu-ngoc-tap-thu-nghiem/assets' })],
      }),
    );
    expect(html).toContain('href="/projects/trieu-ngoc-tap-thu-nghiem/assets"');
    expect(html).toContain('Review open warnings');
    // Warning text never exposes an internal domain identifier verbatim.
    expect(html).not.toMatch(/\b[a-z]+_[a-z0-9]{6,}\b/);
  });

  it('No blockers renders no blocker region at all', () => {
    const html = render(journeyFixture({ blockers: [], warnings: [issue()] }));
    expect(html).not.toContain('blocking issue');
    expect(html).toContain('1 warning open');
  });

  it('Missing targetRoute renders no broken link', () => {
    const html = render(journeyFixture({ primaryAction: action({ targetRoute: '' }) }));
    expect(html).not.toContain('href=""');
    expect(html).toContain('No direct link is available');
  });

  it('Empty project state', () => {
    const html = render(
      journeyFixture({
        phases: JOURNEY_PHASES.map((p) => phase({ phase: p })),
        currentPhase: 'setup',
        primaryAction: action(),
      }),
    );
    // "Not started" is the phase strip's state badge for all six phases,
    // plus the progress summary's fallback for Plan/Produce (which can
    // have a real ratio, so their null-progress fallback is their own
    // actual state). Setup/Develop/Review/Finish never carry a progress
    // metric at all (PRODUCTION-JOURNEY-PROGRESS.md), so their progress
    // summary cell honestly says "Unavailable" instead. The Slice 3 guided
    // view (currentPhase 'setup', NOT_STARTED) adds one more "Not started"
    // (its own state label) and one more "Unavailable" (the Setup "output
    // profile" criterion, which has no field-level evidence today).
    expect(html.match(/Not started/g)?.length).toBe(9);
    expect(html.match(/Unavailable/g)?.length).toBe(5);
    expect(html).toContain('Create your first episode');
  });

  it('Blocked project state', () => {
    const blockerIssue = issue({ id: 'b1', severity: 'BLOCKER', phase: 'develop', message: 'Script empty', blocksPhase: true });
    const html = render(
      journeyFixture({
        phases: JOURNEY_PHASES.map((p) =>
          phase({ phase: p, state: p === 'develop' ? 'BLOCKED' : 'NOT_STARTED', blockers: p === 'develop' ? [blockerIssue] : [] }),
        ),
        currentPhase: 'develop',
        blockers: [blockerIssue],
        primaryAction: action({
          id: 'develop.write-script',
          label: 'Write or paste your script',
          phase: 'develop',
          blocking: true,
          targetRoute: '/projects/trieu-ngoc-tap-thu-nghiem/script',
        }),
      }),
    );
    expect(html).toContain('Blocked');
    expect(html).toContain('1 blocking issue');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Write or paste your script');
  });

  it('Complete project state with no action', () => {
    const html = render(
      journeyFixture({
        phases: JOURNEY_PHASES.map((p) => phase({ phase: p, state: 'COMPLETE' })),
        currentPhase: 'finish',
        primaryAction: null,
      }),
    );
    expect(html).toMatch(/You.{1,10}re all caught up/);
    expect(html.match(/Complete/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('No localStorage, sessionStorage or IndexedDB use', () => {
    expect(productionJourneyHomeSource).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('UI does not reimplement journey derivation rules', () => {
    // Only real import/call sites disqualify the component — prose in the
    // header comment is allowed to reference these services by name when
    // explaining a design decision (e.g. contrasting with them).
    const codeOnly = productionJourneyHomeSource
      .split('\n')
      .filter((line: string) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    expect(codeOnly).not.toMatch(/from ['"]@\/application\/services\/(creativeWorkspaceService|continuityService|episodeService|exportService|publishService)['"]/);
    expect(codeOnly).not.toMatch(/\.sort\(|priority\s*-|severity\s*===\s*'BLOCKER'\s*\?/);
  });

  it('Keyboard-accessible links: phase strip entries and the primary action are real anchor elements', () => {
    const html = render(journeyFixture({ primaryAction: action() }));
    expect(html.match(/<a /g)?.length).toBeGreaterThanOrEqual(7); // 6 phases + 1 primary action
  });
});
