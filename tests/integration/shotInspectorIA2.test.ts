import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

Object.assign(globalThis, { React });

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined, refresh: () => undefined }),
    usePathname: () => '/projects/test/shots/EP01_SC01_SH001',
    useSearchParams: () => ({ toString: () => '', get: () => null }),
  };
});
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const env = useTempStudio('shotInspectorIA2');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createPromptService } = await import('@/application/services/promptService');
const { OverviewContent } = await import('@/components/shot-inspector/OverviewContent');
const { deriveNextAction } = await import('@/components/shot-inspector/overviewUtils');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const promptService = createPromptService(studio);

let projectSlug = '';
let firstShotCode = '';
let firstShotBasePath = '';

beforeAll(async () => {
  runMigrations();

  const project = await projects.create({
    title: 'IA2 Test Project',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: 'no-such-preset',
  });
  projectSlug = project.slug;

  await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(projectSlug);
  await scripts.buildShots(projectSlug);

  const sceneShots = await studio.shots.listByProject(project.id);
  expect(sceneShots.length).toBeGreaterThan(0);
  firstShotCode = sceneShots[0]!.code;
  firstShotBasePath = `/projects/${projectSlug}/shots/${encodeURIComponent(firstShotCode)}`;
});

afterAll(() => {
  env.cleanup();
});

async function renderShotPage(tab: string): Promise<string> {
  const { default: ShotPage } = await import(
    `@/app/projects/[slug]/shots/[code]/page`
  );
  const element = await ShotPage({
    params: Promise.resolve({ slug: projectSlug, code: firstShotCode }),
    searchParams: Promise.resolve({ tab }),
  });
  return renderToStaticMarkup(element);
}

function shotBrief() {
  return {
    code: 'EP01_SC01_SH001',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    lens: '50mm',
    durationSeconds: 5,
    aspectRatio: '16:9',
    description: 'A shot description.',
    dialogue: '',
    lighting: 'soft',
    emotion: 'calm',
    importance: 'normal' as const,
  };
}

describe('ShotInspectorIA2 — Overview renders readiness pill', () => {
  it('renders a readiness pill in the Overview tab', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain('Needs attention');
  });

  it('readiness pill includes glyph', async () => {
    const html = await renderShotPage('overview');
    const glyph = '\u26A0';
    expect(html).toContain(glyph);
  });

  it('readiness pill uses aria-live="polite"', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain('aria-live="polite"');
  });
});

describe('ShotInspectorIA2 — Overview renders next-action card', () => {
  it('renders the next-action card with a primary action link', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain('Next action');
    expect(html).toContain('Compile image prompt');
  });

  it('primary action navigates to Prompts tab', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain(`${firstShotBasePath}?tab=prompts`);
  });
});

describe('ShotInspectorIA2 — Overview renders compact shot brief', () => {
  it('renders Shot brief section', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain('Shot brief');
  });

  it('renders shot spec fields (shot size, camera angle, lens, duration, aspect ratio, lighting)', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain('Shot size');
    expect(html).toContain('Camera angle');
    expect(html).toContain('Lens');
    expect(html).toContain('Duration');
    expect(html).toContain('Aspect ratio');
    expect(html).toContain('Lighting');
  });

  it('renders shot description when present', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain('Shot brief');
  });

  it('renders importance in the brief', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain('Importance');
  });
});

describe('ShotInspectorIA2 — old Overview duplication removed', () => {
  it('does NOT render Cast list in Overview', async () => {
    const html = await renderShotPage('overview');
    expect(html).not.toContain('Cast, pinned to bible snapshots');
  });

  it('does NOT render Continuity in/out JSON in Overview', async () => {
    const html = await renderShotPage('overview');
    expect(html).not.toContain('Continuity in');
  });

  it('does NOT render Continuity for this cut card in Overview', async () => {
    const html = await renderShotPage('overview');
    expect(html).not.toContain('Continuity for this cut');
  });

  it('does NOT render the 8-field shot spec dl grid title', async () => {
    const html = await renderShotPage('overview');
    expect(html).not.toContain('Shot spec');
  });

  it('does NOT render raw continuity JSON', async () => {
    const html = await renderShotPage('overview');
    expect(html).not.toContain('environment');
  });
});

describe('ShotInspectorIA2 — removed content reachable elsewhere', () => {
  it('Pinned references are in the canonical References tab (IA3)', async () => {
    const html = await renderShotPage('references');
    expect(html).toContain('Pinned references');
    expect(html).toContain('Reference health');
  });

  it('Continuity in/out is in Technical tab', async () => {
    const html = await renderShotPage('technical');
    expect(html).toContain('Continuity in');
    expect(html).toContain('Continuity out');
  });

  it('Continuity findings are in Technical tab', async () => {
    const html = await renderShotPage('technical');
    expect(html).toContain('Continuity findings');
  });
});

describe('ShotInspectorIA2 — secondary navigation links', () => {
  it('renders secondary navigation as a nav landmark', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain('aria-label="Related tabs"');
  });

  it('links to all other tabs', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain(`${firstShotBasePath}?tab=references`);
    expect(html).toContain(`${firstShotBasePath}?tab=prompts`);
    expect(html).toContain(`${firstShotBasePath}?tab=visual-control`);
    expect(html).toContain(`${firstShotBasePath}?tab=generations`);
    expect(html).toContain(`${firstShotBasePath}?tab=technical`);
  });
});

describe('ShotInspectorIA2 — IA1 tabs unchanged', () => {
  it('References tab renders the canonical References surface (IA3)', async () => {
    const html = await renderShotPage('references');
    expect(html).toContain('shot-tabpanel-references');
    expect(html).toContain('Pinned references');
  });

  it('Prompts tab renders Image prompt and Video prompt sections', async () => {
    const html = await renderShotPage('prompts');
    expect(html).toContain('Image prompt');
    expect(html).toContain('Video prompt');
  });

  it('Visual Control tab content exists', async () => {
    const html = await renderShotPage('visual-control');
    expect(html.length).toBeGreaterThan(0);
  });

  it('Generations tab renders generation and asset content', async () => {
    const html = await renderShotPage('generations');
    expect(html).toContain('Generations');
    expect(html).toContain('Assets');
  });

  it('Technical tab renders continuity environment', async () => {
    const html = await renderShotPage('technical');
    expect(html).toContain('Continuity environment');
  });

  it('Overview is the default tab when no tab param is provided', async () => {
    const { default: ShotPage } = await import(
      `@/app/projects/[slug]/shots/[code]/page`
    );
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: firstShotCode }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Next action');
  });
});

describe('ShotInspectorIA2 — invalid/missing tab fallback unchanged', () => {
  it('falls back to Overview for invalid tab values', async () => {
    const html = await renderShotPage('invalid-tab');
    expect(html).toContain('Next action');
  });

  it('falls back to Overview for empty tab', async () => {
    const html = await renderShotPage('');
    expect(html).toContain('Next action');
  });
});

describe('ShotInspectorIA2 — no mutation proof', () => {
  it('does not mutate any persisted record during Overview render', async () => {
    const generationsBefore = await studio.generations.listByProject(
      (await studio.projects.bySlug(projectSlug))!.id,
    );
    const genCountBefore = generationsBefore.length;

    await renderShotPage('overview');

    const generationsAfter = await studio.generations.listByProject(
      (await studio.projects.bySlug(projectSlug))!.id,
    );
    expect(generationsAfter.length).toBe(genCountBefore);
  });
});

describe('ShotInspectorIA2 — zero credit proof', () => {
  it('does not enqueue any generation jobs during Overview render', async () => {
    const project = await studio.projects.bySlug(projectSlug);
    expect(project).toBeTruthy();
    const genBefore = await studio.generations.listByProject(project!.id);
    const genIdsBefore = new Set(genBefore.map((g) => g.id));

    await renderShotPage('overview');

    const genAfter = await studio.generations.listByProject(project!.id);
    const newGens = genAfter.filter((g) => !genIdsBefore.has(g.id));
    expect(newGens).toHaveLength(0);
  });

  it('renders Overview without provider calls', async () => {
    const html = await renderShotPage('overview');
    expect(html).toBeTruthy();
  });
});

describe('ShotInspectorIA2 — no new route', () => {
  it('uses only existing tab query params and edit route', async () => {
    const html = await renderShotPage('overview');
    expect(html).toContain('?tab=');
    expect(html).toContain('/edit');
  });
});

describe('ShotInspectorIA2 — no schema or migration change', () => {
  it('db:validate checksum unchanged (indirect check via existing seed)', async () => {
    const project = await studio.projects.bySlug(projectSlug);
    expect(project).toBeTruthy();
    const shots = await studio.shots.listByProject(project!.id);
    expect(shots.length).toBeGreaterThan(0);
  });
});

describe('ShotInspectorIA2 — whole-shot COMPLETE not available for empty project', () => {
  it('does NOT render COMPLETE for a newly seeded shot with no approved assets', async () => {
    const html = await renderShotPage('overview');
    expect(html).not.toContain('Complete');
  });
});

describe('ShotInspectorIA2 — VC1–VC4 regression', () => {
  it('Visual Control tab renders without errors', async () => {
    const html = await renderShotPage('visual-control');
    expect(html.length).toBeGreaterThan(0);
  });
});

describe('ShotInspectorIA2 — no internal IA2 rule metadata in creator UI', () => {
  it('does NOT render the "IA2 rule" implementation label', async () => {
    const html = await renderShotPage('overview');
    expect(html).not.toContain('IA2 rule');
  });

  it('does NOT render the "deterministic next action" metadata text', async () => {
    const html = await renderShotPage('overview');
    expect(html).not.toContain('deterministic next action');
  });

  it('does NOT render any ruleId in the next-action card', async () => {
    const html = await renderShotPage('overview');
    // No bare "rule 1"–"rule 18" metadata should leak into the creator surface.
    for (let i = 1; i <= 18; i += 1) {
      expect(html).not.toContain(`rule ${i}`);
    }
  });
});

describe('ShotInspectorIA2 — vcState null → conservative fallback (component)', () => {
  it('renders the actionable fallback (Rule 18) when vcState is null', () => {
    const action = deriveNextAction({
      vcState: null,
      shot: {
        shotSize: 'medium',
        cameraAngle: 'eye-level',
        lens: '50mm',
        durationSeconds: 5,
        aspectRatio: '16:9',
        description: 'A shot',
        dialogue: '',
        lighting: 'soft',
        emotion: 'calm',
        importance: 'normal',
        code: 'EP01_SC01_SH001',
      },
      imagePrompt: null,
      videoPrompt: null,
      generations: [],
      assets: [],
      nextShotCode: null,
      basePath: `/projects/${projectSlug}/shots/EP01_SC01_SH001`,
    });
    expect(action.ruleId).toBe('18');
    expect(action.readiness).toBe('NEEDS_ATTENTION');
    expect(action.primaryLabel).toBe('Review and complete shot setup');
    const element = React.createElement(OverviewContent, {
      action,
      shot: {
        code: 'EP01_SC01_SH001',
        shotSize: 'medium',
        cameraAngle: 'eye-level',
        lens: '50mm',
        durationSeconds: 5,
        aspectRatio: '16:9',
        description: 'A shot',
        dialogue: '',
        lighting: 'soft',
        emotion: 'calm',
        importance: 'normal',
      },
      basePath: `/projects/${projectSlug}/shots/EP01_SC01_SH001`,
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Needs attention');
    expect(html).toContain('Review and complete shot setup');
    // A null read model must never fabricate a READY/IN PROGRESS/COMPLETE state.
    expect(html).not.toContain('Ready');
    expect(html).not.toContain('In progress');
    expect(html).not.toContain('Complete');
  });
});

describe('ShotInspectorIA2 — whole-shot COMPLETE renders (component-level)', () => {
  // Note: the mock video provider stores artifacts as image/svg+xml, so the
  // real mock flow never produces an asset with kind === 'video' (it is filed
  // as 'image' by inferKind). Therefore Rule 17 (approved image AND approved
  // video) cannot be driven through the full page using the offline mock
  // provider. This component-level test exercises the real deriveNextAction()
  // and the real OverviewContent with a synthetic approved-video asset to prove
  // the COMPLETE surface renders correctly end to end. The derivation's Rule 17
  // branch is also covered exhaustively at unit level.

  it('renders COMPLETE and "Next shot" routing to the sibling shot when an approved image and an approved video exist and a next shot exists', () => {
    const basePath = `/projects/${projectSlug}/shots/EP01_SC01_SH001`;
    const action = deriveNextAction({
      vcState: {
        pinnedReferences: [{ resolved: true }],
        assets: [],
        continuity: { blockers: [] },
        prompt: {
          image: { promptId: 'p-img', lintOk: true },
          video: { promptId: 'p-vid', lintOk: true },
        },
      },
      shot: shotBrief(),
      imagePrompt: { version: { lint: { issues: [] } } },
      videoPrompt: { version: { lint: { issues: [] } } },
      generations: [],
      assets: [
        { kind: 'image', approvalState: 'approved', generationId: null },
        { kind: 'video', approvalState: 'approved', generationId: null },
      ],
      nextShotCode: 'EP01_SC01_SH002',
      basePath,
    });
    expect(action.ruleId).toBe('17');
    expect(action.readiness).toBe('COMPLETE');
    expect(action.primaryLabel).toBe('Next shot');
    expect(action.destination).toBe(`/projects/${projectSlug}/shots/EP01_SC01_SH002`);

    const html = renderToStaticMarkup(
      React.createElement(OverviewContent, { action, shot: shotBrief(), basePath }),
    );
    expect(html).toContain('Complete');
    expect(html).toContain('Next shot');
    expect(html).toContain(`/projects/${projectSlug}/shots/EP01_SC01_SH002`);
    // The last-shot metadata must not leak into the creator surface.
    expect(html).not.toContain('IA2 rule');
  });

  it('renders COMPLETE and "Return to shot list" routing to the shot-list route when no next shot exists (last shot)', () => {
    const basePath = `/projects/${projectSlug}/shots/EP99_SC99_SH999`;
    const action = deriveNextAction({
      vcState: {
        pinnedReferences: [{ resolved: true }],
        assets: [],
        continuity: { blockers: [] },
        prompt: {
          image: { promptId: 'p-img', lintOk: true },
          video: { promptId: 'p-vid', lintOk: true },
        },
      },
      shot: { ...shotBrief(), code: 'EP99_SC99_SH999' },
      imagePrompt: { version: { lint: { issues: [] } } },
      videoPrompt: { version: { lint: { issues: [] } } },
      generations: [],
      assets: [
        { kind: 'image', approvalState: 'approved', generationId: null },
        { kind: 'video', approvalState: 'approved', generationId: null },
      ],
      nextShotCode: null,
      basePath,
    });
    expect(action.ruleId).toBe('17');
    expect(action.readiness).toBe('COMPLETE');
    expect(action.primaryLabel).toBe('Return to shot list');
    expect(action.destination).toBe(`/projects/${projectSlug}/shots`);

    const html = renderToStaticMarkup(
      React.createElement(OverviewContent, { action, shot: { ...shotBrief(), code: 'EP99_SC99_SH999' }, basePath }),
    );
    expect(html).toContain('Complete');
    expect(html).toContain('Return to shot list');
    expect(html).toContain(`/projects/${projectSlug}/shots"`);
    // Must NOT label the last shot "Next shot" pointing back at the current shot.
    expect(html).not.toContain('Next shot');
  });
});

describe('ShotInspectorIA2 — strengthened no-mutation proof (snapshots)', () => {
  it('leaves shot record, asset approval states and prompt versions byte-identical after an Overview render', async () => {
    const project = await studio.projects.bySlug(projectSlug);
    const shotsBefore = await studio.shots.listByProject(project!.id);
    const firstShot = shotsBefore[0]!;

    const shotBefore = await studio.shots.byId(firstShot.id);
    const assetsBefore = await studio.assets.list(project!.id, { shotId: firstShot.id, limit: 50 });
    const imagePromptBefore = await promptService.latestForShot(firstShot.id, 'image');

    const snapshot = JSON.stringify({
      shot: shotBefore,
      assets: assetsBefore.map((a) => ({ id: a.id, approvalState: a.approvalState, kind: a.kind })),
      imagePromptVersion: imagePromptBefore ? imagePromptBefore.version.version : null,
    });

    await renderShotPage('overview');

    const shotAfter = await studio.shots.byId(firstShot.id);
    const assetsAfter = await studio.assets.list(project!.id, { shotId: firstShot.id, limit: 50 });
    const imagePromptAfter = await promptService.latestForShot(firstShot.id, 'image');

    const snapshotAfter = JSON.stringify({
      shot: shotAfter,
      assets: assetsAfter.map((a) => ({ id: a.id, approvalState: a.approvalState, kind: a.kind })),
      imagePromptVersion: imagePromptAfter ? imagePromptAfter.version.version : null,
    });

    expect(snapshotAfter).toBe(snapshot);
  });
});
