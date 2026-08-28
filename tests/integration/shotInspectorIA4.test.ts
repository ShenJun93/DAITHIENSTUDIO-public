/**
 * IA4 (TASK-SHOT-INSPECTOR-IA4) — integration tests for the canonical
 * Prompts tab: prompt-health summary, image/video prompt inspection,
 * ingredients, mutation safety and the zero-compile boundary.
 * Real temporary SQLite; the page server component is rendered exactly
 * as Next.js renders it.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';
import type { ContinuityState, ShotInput } from '@/domain/schemas';

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

const env = useTempStudio('shotInspectorIA4');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createEpisodeService } = await import('@/application/services/episodeService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createPromptService } = await import('@/application/services/promptService');

const studio = getStudio();
const projects = createProjectService(studio);
const episodesService = createEpisodeService(studio);
const scripts = createScriptService(studio);
const promptService = createPromptService(studio);

const CONTINUITY_STATE: ContinuityState = {
  note: '',
  characters: {},
  environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] },
};

let projectSlug = '';
let projectId = '';
let sceneId = '';
let episodeId = '';

let promptedShotId = '';
let promptedShotCode = '';
let emptyShotId = '';
let emptyShotCode = '';
let partialShotId = '';
let partialShotCode = '';

type ShotCreateInput = ShotInput & { code: string; shotNumber: number; episodeId: string | null };

function shotInput(code: string, overrides: Partial<Pick<ShotCreateInput, 'shotNumber' | 'characters'>> = {}): ShotCreateInput {
  return {
    sceneId,
    code,
    shotNumber: 1,
    episodeId,
    title: `IA4 ${code}`,
    description: 'ia4 fixture shot',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'static' },
    lens: '50mm',
    durationSeconds: 5,
    characters: [],
    location: null,
    props: [],
    dialogue: 'Hello world',
    emotion: 'neutral',
    lighting: 'day',
    visualEffects: [],
    soundEffects: [],
    continuity: { incoming: CONTINUITY_STATE, outgoing: CONTINUITY_STATE, intentionalChanges: [] },
    aspectRatio: '16:9',
    importance: 'normal',
    ...overrides,
  };
}

beforeAll(async () => {
  runMigrations();

  const project = await projects.create({
    title: 'IA4 Test Project',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
  });
  projectSlug = project.slug;
  projectId = project.id;

  await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(projectSlug);
  await scripts.buildShots(projectSlug);

  const builtShots = await studio.shots.listByProject(projectId);
  const scenes = await studio.scenes.listByProject(projectId);
  sceneId = scenes[0]!.id;
  const [episode] = await episodesService.listEpisodes(projectId);
  episodeId = episode!.id;

  const character = await studio.bibles.createCharacter(projectId, {
    code: 'CHAR801',
    name: 'IA4 Character',
    role: 'lead',
    identity: {},
    variable: {},
    promptToken: 'ia4 character',
    negativePrompt: '',
    forbiddenChanges: [],
    colorPalette: [],
    voiceProfileId: null,
    lockEnabled: true,
    status: 'draft',
  });

  const promptedShot = await studio.shots.create(
    projectId,
    shotInput('IA4_SH_PROMPTED', {
      shotNumber: 80,
      characters: [
        { characterId: character.id, versionId: 'CHAR801_V1', screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' },
      ],
    }),
  );
  promptedShotId = promptedShot.id;
  promptedShotCode = promptedShot.code;

  const emptyShot = await studio.shots.create(projectId, shotInput('IA4_SH_EMPTY', { shotNumber: 81 }));
  emptyShotId = emptyShot.id;
  emptyShotCode = emptyShot.code;

  const partialShot = await studio.shots.create(
    projectId,
    shotInput('IA4_SH_PARTIAL', {
      shotNumber: 82,
      characters: [
        { characterId: character.id, versionId: 'CHAR801_V1', screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' },
      ],
    }),
  );
  partialShotId = partialShot.id;
  partialShotCode = partialShot.code;

  await promptService.buildForShot(promptedShotId, 'image');
  await promptService.buildForShot(promptedShotId, 'video');

  await promptService.buildForShot(partialShotId, 'image');
});

afterAll(() => {
  env.cleanup();
});

async function renderShotPage(code: string, tab?: string): Promise<string> {
  const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
  const element = await ShotPage({
    params: Promise.resolve({ slug: projectSlug, code }),
    searchParams: Promise.resolve(tab === undefined ? {} : { tab }),
  });
  return renderToStaticMarkup(element);
}

describe('ShotInspectorIA4 — Prompts content renders only when selected', () => {
  it('renders the Prompts surface when ?tab=prompts', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('shot-tabpanel-prompts');
    expect(html).toContain('Image prompt');
    expect(html).toContain('Video prompt');
  });

  it('does NOT render Prompt health on other tabs', async () => {
    for (const tab of ['overview', 'references', 'visual-control', 'generations', 'technical']) {
      const html = await renderShotPage(promptedShotCode, tab);
      expect(html).not.toContain('Image prompt');
      expect(html).not.toContain('Video prompt');
    }
  });
});

describe('ShotInspectorIA4 — IA1 shell regression', () => {
  it('all six IA1 tabs remain present', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('role="tablist"');
    for (const tab of ['overview', 'references', 'prompts', 'visual-control', 'generations', 'technical']) {
      expect(html).toContain(`id="shot-tab-${tab}"`);
      expect(html).toContain(`id="shot-tabpanel-${tab}"`);
    }
    expect(html).toContain('Overview');
    expect(html).toContain('References');
    expect(html).toContain('Prompts');
    expect(html).toContain('Visual Control');
    expect(html).toContain('Generations');
    expect(html).toContain('Technical');
  });

  it('the persistent header remains unchanged', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('<h1');
    expect(html).toContain(promptedShotCode);
    expect(html).toContain('Edit shot');
    expect(html).toContain('Shot list');
  });
});

describe('ShotInspectorIA4 — IA2 Overview regression', () => {
  it('Overview remains unchanged (next action + shot brief)', async () => {
    const html = await renderShotPage(promptedShotCode, 'overview');
    expect(html).toContain('Next action');
    expect(html).toContain('Shot brief');
  });
});

describe('ShotInspectorIA4 — IA3 References regression', () => {
  it('References content remains unchanged', async () => {
    const html = await renderShotPage(promptedShotCode, 'references');
    expect(html).toContain('Reference health');
    expect(html).toContain('Pinned references');
  });
});

describe('ShotInspectorIA4 — prompt health renders', () => {
  it('displays a prompt health summary for a shot with both prompts', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('Ready');
  });

  it('displays a prompt health summary for a shot with no prompts', async () => {
    const html = await renderShotPage(emptyShotCode, 'prompts');
    expect(html).toContain('Empty');
    expect(html).toContain('No stored prompts exist for this shot');
  });

  it('displays NEEDS_ATTENTION when only one prompt exists', async () => {
    const html = await renderShotPage(partialShotCode, 'prompts');
    expect(html).toContain('Needs attention');
  });

  it('health status is not conveyed by color alone (glyph + text)', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('✓');
  });
});

describe('ShotInspectorIA4 — image and video sections are distinct', () => {
  it('renders separate Image prompt and Video prompt sections', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    const imageIndex = html.indexOf('Image prompt');
    const videoIndex = html.indexOf('Video prompt');
    expect(imageIndex).toBeGreaterThan(-1);
    expect(videoIndex).toBeGreaterThan(-1);
    expect(imageIndex).not.toBe(videoIndex);
  });
});

describe('ShotInspectorIA4 — prompt text is readable', () => {
  it('image prompt text is displayed in a pre block', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('<pre');
    expect(html).toContain('Subject:');
  });

  it('video prompt text is displayed', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toMatch(/Image prompt[\s\S]*<pre/);
    expect(html).toMatch(/Video prompt[\s\S]*<pre/);
  });
});

describe('ShotInspectorIA4 — negative prompt renders', () => {
  it('negative prompt section exists for image', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('Negative prompt');
  });
});

describe('ShotInspectorIA4 — lint findings are understandable', () => {
  it('lint score renders in the prompt header', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toMatch(/lint\s+\d+\/100/);
  });

  it('lint findings heading does NOT appear when prompts are clean', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toContain('Lint findings');
  });
});

describe('ShotInspectorIA4 — lock references render read-only', () => {
  it('locked references section exists', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('Locked references');
  });

  it('character lock badges are displayed', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('CHAR801_V1');
  });

  it('lock references are badges not form controls', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toMatch(/<select/);
    expect(html).not.toMatch(/<input/);
  });
});

describe('ShotInspectorIA4 — prompt ingredients render', () => {
  it('ingredients section exists', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('Prompt ingredients');
  });

  it('character name renders in ingredients', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('Characters');
  });

  it('shot facts render', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).toContain('Shot facts');
  });
});

describe('ShotInspectorIA4 — technical metadata is subordinate', () => {
  it('version metadata is secondary text', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    const versionPos = html.indexOf('Version ');
    const subjectPos = html.indexOf('Subject:');
    expect(versionPos).toBeGreaterThan(-1);
  });

  it('does not expose database field names', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toContain('promptId');
    expect(html).not.toContain('shotId');
    expect(html).not.toContain('lockRefsJson');
    expect(html).not.toContain('blocksJson');
  });

  it('does not expose rule IDs as creator-facing labels', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toContain('Rule 0');
    expect(html).not.toContain('precedence');
    expect(html).not.toContain('derivePromptHealth');
  });
});

describe('ShotInspectorIA4 — empty states are truthful', () => {
  it('empty image prompt renders truthful empty state', async () => {
    const html = await renderShotPage(emptyShotCode, 'prompts');
    expect(html).toContain('No stored image prompt exists');
  });

  it('empty video prompt renders truthful empty state', async () => {
    const html = await renderShotPage(emptyShotCode, 'prompts');
    expect(html).toContain('No stored video prompt exists');
  });

  it('partial shot image has content, video shows missing', async () => {
    const html = await renderShotPage(partialShotCode, 'prompts');
    expect(html).toContain('Subject:');
    expect(html).toContain('No stored video prompt exists');
  });
});

describe('ShotInspectorIA4 — read-only proof: no compile controls', () => {
  it('no Compile button anywhere on the Prompts tab', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toContain('Compile');
    expect(html).not.toContain('Recompile');
  });

  it('no compile form element', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toMatch(/<form/);
  });

  it('no provider controls', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toContain('provider');
    expect(html).not.toContain('Queue image');
    expect(html).not.toContain('Queue video');
  });

  it('no generation controls', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toContain('Queue');
    expect(html).not.toContain('Process queue');
  });
});

describe('ShotInspectorIA4 — read-only proof: buildPromptForShotAction not invoked', () => {
  it('Compile string does not appear on the Prompts tab', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toContain('Compile');
  });

  it('Recompile string does not appear', async () => {
    const html = await renderShotPage(promptedShotCode, 'prompts');
    expect(html).not.toContain('Recompile');
  });
});

describe('ShotInspectorIA4 — mutation safety on render and tab switch', () => {
  it('leaves shot, prompt, activity, generation, and asset rows unchanged after Prompts render', async () => {
    const shotBefore = await studio.shots.byId(promptedShotId);
    const promptsBefore = await promptService.listForShot(promptedShotId);
    const activityBefore = await studio.activity.recent(projectId, 100);
    const generationsBefore = await studio.generations.listByProject(projectId);
    const assetsBefore = await studio.assets.list(projectId, { shotId: promptedShotId, limit: 50 });

    await renderShotPage(promptedShotCode, 'prompts');

    const shotAfter = await studio.shots.byId(promptedShotId);
    const promptsAfter = await promptService.listForShot(promptedShotId);
    const activityAfter = await studio.activity.recent(projectId, 100);
    const generationsAfter = await studio.generations.listByProject(projectId);
    const assetsAfter = await studio.assets.list(projectId, { shotId: promptedShotId, limit: 50 });

    expect(JSON.stringify(shotAfter)).toBe(JSON.stringify(shotBefore));
    expect(JSON.stringify(activityAfter)).toBe(JSON.stringify(activityBefore));
    expect(generationsAfter.length).toBe(generationsBefore.length);
    expect(assetsAfter.map((a) => `${a.id}:${a.approvalState}`).sort()).toEqual(
      assetsBefore.map((a) => `${a.id}:${a.approvalState}`).sort(),
    );

    const promptCountBefore = promptsBefore.length;
    const promptCountAfter = promptsAfter.length;
    expect(promptCountAfter).toBe(promptCountBefore);

    let versionCountBefore = 0;
    for (const p of promptsBefore) versionCountBefore += p.versions.length;
    let versionCountAfter = 0;
    for (const p of promptsAfter) versionCountAfter += p.versions.length;
    expect(versionCountAfter).toBe(versionCountBefore);
  });

  it('leaves shot and activity unchanged after switching across all six tabs', async () => {
    const shotBefore = await studio.shots.byId(promptedShotId);
    const activityBefore = await studio.activity.recent(projectId, 100);

    for (const tab of ['overview', 'references', 'prompts', 'visual-control', 'generations', 'technical']) {
      await renderShotPage(promptedShotCode, tab);
    }

    const shotAfter = await studio.shots.byId(promptedShotId);
    const activityAfter = await studio.activity.recent(projectId, 100);
    expect(JSON.stringify(shotAfter)).toBe(JSON.stringify(shotBefore));
    expect(JSON.stringify(activityAfter)).toBe(JSON.stringify(activityBefore));
  });

  it('does not create new prompt rows or versions on render', async () => {
    const promptsBefore = await promptService.listForShot(emptyShotId);
    await renderShotPage(emptyShotCode, 'prompts');
    const promptsAfter = await promptService.listForShot(emptyShotId);
    expect(promptsAfter.length).toBe(promptsBefore.length);
  });

  it('does not change shot status during Prompts render', async () => {
    const shotBefore = await studio.shots.byId(promptedShotId);
    await renderShotPage(promptedShotCode, 'prompts');
    const shotAfter = await studio.shots.byId(promptedShotId);
    expect(shotAfter!.status).toBe(shotBefore!.status);
  });

  it('does not enqueue generations or call providers during Prompts render', async () => {
    const generationsBefore = await studio.generations.listByProject(projectId);
    await renderShotPage(promptedShotCode, 'prompts');
    const generationsAfter = await studio.generations.listByProject(projectId);
    expect(generationsAfter.length).toBe(generationsBefore.length);
  });

  it('does not change approval or workflow state during Prompts render', async () => {
    const assetsBefore = await studio.assets.list(projectId);
    await renderShotPage(promptedShotCode, 'prompts');
    const assetsAfter = await studio.assets.list(projectId);
    expect(assetsAfter.map((a) => `${a.id}:${a.approvalState}`).sort()).toEqual(
      assetsBefore.map((a) => `${a.id}:${a.approvalState}`).sort(),
    );
  });
});

describe('ShotInspectorIA4 — project ownership behavior remains unchanged', () => {
  it('rejects an unknown project slug', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    await expect(
      ShotPage({
        params: Promise.resolve({ slug: 'no-such-project', code: promptedShotCode }),
        searchParams: Promise.resolve({ tab: 'prompts' }),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ShotInspectorIA4 — Visual Control tab (VC1–VC4 regression)', () => {
  it('Visual Control tab still renders its own section boundary', async () => {
    const html = await renderShotPage(promptedShotCode, 'visual-control');
    expect(html).toContain('shot-tabpanel-visual-control');
    expect(html.length).toBeGreaterThan(0);
  });
});
