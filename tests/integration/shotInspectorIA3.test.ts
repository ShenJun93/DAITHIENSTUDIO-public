/**
 * IA3 (TASK-SHOT-INSPECTOR-IA3) — integration tests for the canonical
 * References tab: reference-health summary, VC3 component reuse (pinned
 * references + repin control + project style), mutation safety and the
 * zero-credit boundary. Real temporary SQLite; the page server component is
 * rendered exactly as Next.js renders it.
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

const env = useTempStudio('shotInspectorIA3');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createEpisodeService } = await import('@/application/services/episodeService');
const { createScriptService } = await import('@/application/services/scriptService');
const { repinReferenceAction } = await import('@/app/actions');

const studio = getStudio();
const projects = createProjectService(studio);
const episodesService = createEpisodeService(studio);
const scripts = createScriptService(studio);

const CONTINUITY_STATE: ContinuityState = {
  note: '',
  characters: {},
  environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] },
};

let projectSlug = '';
let projectId = '';
let sceneId = '';
let episodeId = '';

let firstBuiltShotCode = '';

let charId = '';
let charCode = '';
let locId = '';
let locCode = '';
let propId = '';
let propCode = '';
let foreignCharId = '';
let foreignCharCode = '';

let completeShotCode = '';
let completeShotId = '';
let blockedShotCode = '';
let blockedShotId = '';
let needsAttentionShotCode = '';
let needsAttentionShotId = '';
let emptyShotCode = '';
let emptyShotId = '';

type ShotCreateInput = ShotInput & { code: string; shotNumber: number; episodeId: string | null };

function shotInput(
  code: string,
  overrides: Partial<Pick<ShotCreateInput, 'shotNumber' | 'characters' | 'location' | 'props'>> = {},
): ShotCreateInput {
  return {
    sceneId,
    code,
    shotNumber: 1,
    episodeId,
    title: `IA3 ${code}`,
    description: 'ia3 fixture shot',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'static' },
    lens: '50mm',
    durationSeconds: 5,
    characters: [],
    location: null,
    props: [],
    dialogue: '',
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
    title: 'IA3 Test Project',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
  });
  projectSlug = project.slug;
  projectId = project.id;

  await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(projectSlug);
  await scripts.buildShots(projectSlug);

  const builtShots = await studio.shots.listByProject(projectId);
  expect(builtShots.length).toBeGreaterThan(0);
  firstBuiltShotCode = builtShots[0]!.code;

  const scenes = await studio.scenes.listByProject(projectId);
  sceneId = scenes[0]!.id;
  const [episode] = await episodesService.listEpisodes(projectId);
  episodeId = episode!.id;

  const character = await studio.bibles.createCharacter(projectId, {
    code: 'CHAR901',
    name: 'Người tham chiếu IA3',
    role: 'lead',
    identity: {},
    variable: {},
    promptToken: 'nguoi tham chieu ia3',
    negativePrompt: '',
    forbiddenChanges: [],
    colorPalette: [],
    voiceProfileId: null,
    lockEnabled: true,
    status: 'draft',
  });
  await studio.bibles.updateCharacter(character.id, { name: 'Người tham chiếu IA3 (v2)' });
  charId = character.id;
  charCode = character.code;

  const location = await studio.bibles.createLocation(projectId, {
    code: 'LOC901',
    name: 'Nơi tham chiếu IA3',
    type: 'interior',
    era: '',
    details: {},
    promptBlock: '',
    negativePrompt: '',
    colorPalette: [],
    continuityNotes: '',
    status: 'draft',
  });
  await studio.bibles.updateLocation(location.id, { name: 'Nơi tham chiếu IA3 (v2)' });
  locId = location.id;
  locCode = location.code;

  const prop = await studio.bibles.createProp(projectId, {
    code: 'PROP901',
    name: 'Vật tham chiếu IA3',
    description: '',
    ownerCharacterId: null,
    details: {},
    promptToken: '',
    continuityConstraints: [],
    status: 'draft',
  });
  await studio.bibles.updateProp(prop.id, { name: 'Vật tham chiếu IA3 (v2)' });
  propId = prop.id;
  propCode = prop.code;

  const completeShot = await studio.shots.create(
    projectId,
    shotInput('IA3_SH_COMPLETE', {
      shotNumber: 90,
      characters: [
        { characterId: charId, versionId: `${charCode}_V1`, screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' },
      ],
      location: { locationId: locId, versionId: `${locCode}_V1` },
      props: [{ propId, versionId: `${propCode}_V1`, heldBy: charId, state: 'intact' }],
    }),
  );
  completeShotCode = completeShot.code;
  completeShotId = completeShot.id;

  const blockedShot = await studio.shots.create(
    projectId,
    shotInput('IA3_SH_BLOCKED', {
      shotNumber: 91,
      characters: [
        { characterId: charId, versionId: `${charCode}_V9`, screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' },
      ],
    }),
  );
  blockedShotCode = blockedShot.code;
  blockedShotId = blockedShot.id;

  const needsAttentionShot = await studio.shots.create(
    projectId,
    shotInput('IA3_SH_ATTENTION', {
      shotNumber: 92,
      characters: [
        { characterId: charId, versionId: '', screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' },
      ],
    }),
  );
  needsAttentionShotCode = needsAttentionShot.code;
  needsAttentionShotId = needsAttentionShot.id;

  const emptyShot = await studio.shots.create(projectId, shotInput('IA3_SH_EMPTY', { shotNumber: 93 }));
  emptyShotCode = emptyShot.code;
  emptyShotId = emptyShot.id;

  const foreignProject = await projects.create({
    title: 'IA3 Foreign Project',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: 'no-such-preset',
  });
  const foreignCharacter = await studio.bibles.createCharacter(foreignProject.id, {
    code: 'CHAR902',
    name: 'Người dự án khác',
    role: 'supporting',
    identity: {},
    variable: {},
    promptToken: 'nguoi du an khac',
    negativePrompt: '',
    forbiddenChanges: [],
    colorPalette: [],
    voiceProfileId: null,
    lockEnabled: false,
    status: 'draft',
  });
  foreignCharId = foreignCharacter.id;
  foreignCharCode = foreignCharacter.code;
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

function fd(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

describe('ShotInspectorIA3 — References content renders only when selected', () => {
  it('renders the canonical References surface when ?tab=references', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain('shot-tabpanel-references');
    expect(html).toContain('Pinned references');
    expect(html).toContain('Reference health');
  });

  it('does NOT render References content on other tabs', async () => {
    for (const tab of ['overview', 'prompts', 'visual-control', 'generations', 'technical']) {
      const html = await renderShotPage(completeShotCode, tab);
      expect(html).not.toContain('Reference health');
    }
  });

  it('removed the temporary Cast-list duplication and deflection notice', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).not.toContain('Cast, pinned to bible snapshots');
    expect(html).not.toContain('Full reference management');
  });
});

describe('ShotInspectorIA3 — IA1 shell regression', () => {
  it('all six IA1 tabs remain present', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
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
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain('<h1');
    expect(html).toContain(completeShotCode);
    expect(html).toContain('Edit shot');
    expect(html).toContain('Shot list');
  });
});

describe('ShotInspectorIA3 — IA2 Overview regression', () => {
  it('Overview remains unchanged (next action + shot brief)', async () => {
    const html = await renderShotPage(completeShotCode, 'overview');
    expect(html).toContain('Next action');
    expect(html).toContain('Shot brief');
  });
});

describe('ShotInspectorIA3 — reference health summary', () => {
  it('renders COMPLETE health for a fully pinned and resolved shot', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain('Complete');
    expect(html).toContain('All references pinned and resolved');
  });

  it('renders BLOCKED health with a creator-facing category for a missing snapshot', async () => {
    const html = await renderShotPage(blockedShotCode, 'references');
    expect(html).toContain('Blocked');
    expect(html).toContain('A pinned reference cannot be resolved — the snapshot is missing (character)');
    expect(html).toContain('Review unresolved reference');
  });

  it('renders NEEDS_ATTENTION health with a creator-facing category for an unpinned reference', async () => {
    const html = await renderShotPage(needsAttentionShotCode, 'references');
    expect(html).toContain('Needs attention');
    expect(html).toContain('A reference has no pinned version (character)');
    expect(html).toContain('Pin a version');
  });

  it('renders EMPTY health with an actionable Edit shot link for a shot with no references', async () => {
    const html = await renderShotPage(emptyShotCode, 'references');
    expect(html).toContain('No references');
    expect(html).toContain('No references pinned to this shot');
    expect(html).toContain('Edit shot');
    expect(html).toContain(`/projects/${projectSlug}/shots/${emptyShotCode}/edit`);
  });

  it('COMPLETE renders no primary action link', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).not.toContain('Review unresolved reference');
    expect(html).not.toContain('Pin a version');
  });

  it('health status is not conveyed by color alone (glyph + text)', async () => {
    const html = await renderShotPage(blockedShotCode, 'references');
    expect(html).toContain('✕');
    expect(html).toContain('Blocked');
  });
});

describe('ShotInspectorIA3 — pinned references content', () => {
  it('creator-facing names render for pins', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain('Người tham chiếu IA3');
    expect(html).toContain('Nơi tham chiếu IA3');
    expect(html).toContain('Vật tham chiếu IA3');
  });

  it('character pinned version renders', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain(`${charCode}_V1`);
    expect(html).toContain('character');
  });

  it('location and pinned version render', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain(`${locCode}_V1`);
    expect(html).toContain('location');
  });

  it('props render with their pinned version', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain(`${propCode}_V1`);
    expect(html).toContain('prop');
  });

  it('a shot without optional props renders truthfully (no prop pin row, no error)', async () => {
    const html = await renderShotPage(needsAttentionShotCode, 'references');
    expect(html).toContain(`${charCode}`);
    expect(html).not.toContain(`${propCode}`);
    expect(html).not.toContain('PROP901');
  });

  it('a shot with no references renders the pinned-references empty state', async () => {
    const html = await renderShotPage(emptyShotCode, 'references');
    expect(html).toContain('No pinned references');
  });

  it('an unresolved pin is marked unresolved in the list', async () => {
    const html = await renderShotPage(blockedShotCode, 'references');
    expect(html).toContain('unresolved');
  });

  it('a valid pinned version that differs from the latest still renders as resolved', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain('snapshot exists');
    expect(html).toContain('Complete');
  });
});

describe('ShotInspectorIA3 — project style read-only', () => {
  it('project style renders with its resolved version and project-level indicator', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain('Project style');
    expect(html).toContain('project-level');
    expect(html).toContain('this is not a shot-level pin');
  });

  it('project style offers no mutation control', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    const styleCard = html.slice(html.indexOf('Project style'));
    expect(styleCard).not.toMatch(/<select/);
  });
});

describe('ShotInspectorIA3 — repin control presence and explicit submit', () => {
  it('repin controls render for shot-field character/location/prop pins', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain(`Version for ${charCode}`);
    expect(html).toContain(`Version for ${locCode}`);
    expect(html).toContain(`Version for ${propCode}`);
    expect(html).toMatch(/<select/);
  });

  it('repin requires explicit submit — the button is disabled until a change is selected', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain('Repinned');
    const disabledButtons = [...html.matchAll(/<button[^>]*disabled=""/g)];
    expect(disabledButtons.length).toBeGreaterThan(0);
  });

  it('no form auto-submits — no <form> element is rendered in the References tab', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).not.toMatch(/<form/);
  });
});

describe('ShotInspectorIA3 — no technical metadata leaks', () => {
  it('does not expose IA3 rule metadata in the creator surface', async () => {
    const html = await renderShotPage(blockedShotCode, 'references');
    expect(html).not.toContain('IA3 rule');
    expect(html).not.toContain('deriveReferenceHealth');
    expect(html).not.toContain('precedence');
    for (let i = 1; i <= 4; i += 1) {
      expect(html).not.toContain(`Rule ${i}`);
    }
  });

  it('health reasons are creator-facing sentences', async () => {
    const html = await renderShotPage(blockedShotCode, 'references');
    expect(html).toContain('the snapshot is missing');
    expect(html).not.toContain('Reference data unavailable');
  });
});

describe('ShotInspectorIA3 — mutation safety on render and tab switch', () => {
  it('leaves shot, asset, activity and generation rows byte-identical after References render', async () => {
    const shotBefore = await studio.shots.byId(completeShotId);
    const assetsBefore = await studio.assets.list(projectId, { shotId: completeShotId, limit: 50 });
    const activityBefore = await studio.activity.recent(projectId, 100);
    const generationsBefore = await studio.generations.listByProject(projectId);

    await renderShotPage(completeShotCode, 'references');

    const shotAfter = await studio.shots.byId(completeShotId);
    const assetsAfter = await studio.assets.list(projectId, { shotId: completeShotId, limit: 50 });
    const activityAfter = await studio.activity.recent(projectId, 100);
    const generationsAfter = await studio.generations.listByProject(projectId);

    expect(JSON.stringify(shotAfter)).toBe(JSON.stringify(shotBefore));
    expect(JSON.stringify(assetsAfter)).toBe(JSON.stringify(assetsBefore));
    expect(JSON.stringify(activityAfter)).toBe(JSON.stringify(activityBefore));
    expect(JSON.stringify(generationsAfter)).toBe(JSON.stringify(generationsBefore));
  });

  it('leaves the shot byte-identical after switching across all six tabs', async () => {
    const shotBefore = await studio.shots.byId(completeShotId);
    const activityBefore = await studio.activity.recent(projectId, 100);

    for (const tab of ['overview', 'references', 'prompts', 'visual-control', 'generations', 'technical']) {
      await renderShotPage(completeShotCode, tab);
    }

    const shotAfter = await studio.shots.byId(completeShotId);
    const activityAfter = await studio.activity.recent(projectId, 100);
    expect(JSON.stringify(shotAfter)).toBe(JSON.stringify(shotBefore));
    expect(JSON.stringify(activityAfter)).toBe(JSON.stringify(activityBefore));
  });

  it('does not enqueue generations or call providers during References render', async () => {
    const generationsBefore = await studio.generations.listByProject(projectId);
    await renderShotPage(completeShotCode, 'references');
    const generationsAfter = await studio.generations.listByProject(projectId);
    expect(generationsAfter.length).toBe(generationsBefore.length);
  });

  it('does not change approval or workflow state during References render', async () => {
    const assetsBefore = await studio.assets.list(projectId);
    await renderShotPage(completeShotCode, 'references');
    const assetsAfter = await studio.assets.list(projectId);
    expect(assetsAfter.map((a) => `${a.id}:${a.approvalState}`).sort()).toEqual(
      assetsBefore.map((a) => `${a.id}:${a.approvalState}`).sort(),
    );
  });
});

describe('ShotInspectorIA3 — project ownership behavior preserved', () => {
  it('rejects an unknown project slug', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    await expect(
      ShotPage({
        params: Promise.resolve({ slug: 'no-such-project', code: completeShotCode }),
        searchParams: Promise.resolve({ tab: 'references' }),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ShotInspectorIA3 — repin regression through the existing boundary', () => {
  it('invalid payload does not mutate', async () => {
    const before = await studio.shots.byId(completeShotId);
    const result = await repinReferenceAction(
      projectSlug,
      completeShotId,
      fd({ kind: 'character', versionId: `${charCode}_V2` }),
    );
    expect(result.ok).toBe(false);
    expect(await studio.shots.byId(completeShotId)).toEqual(before);
  });

  it('unsupported kind (style) does not mutate', async () => {
    const before = await studio.shots.byId(completeShotId);
    const result = await repinReferenceAction(
      projectSlug,
      completeShotId,
      fd({ kind: 'style', versionId: 'STY001_V1' }),
    );
    expect(result.ok).toBe(false);
    expect(await studio.shots.byId(completeShotId)).toEqual(before);
  });

  it('ownership failure (foreign entity) does not mutate', async () => {
    const before = await studio.shots.byId(completeShotId);
    const result = await repinReferenceAction(
      projectSlug,
      completeShotId,
      fd({ kind: 'character', characterId: foreignCharId, versionId: `${foreignCharCode}_V1` }),
    );
    expect(result.ok).toBe(false);
    expect(await studio.shots.byId(completeShotId)).toEqual(before);
  });

  it('invalid entity (not in the shot) does not mutate', async () => {
    const before = await studio.shots.byId(completeShotId);
    const result = await repinReferenceAction(
      projectSlug,
      completeShotId,
      fd({ kind: 'prop', propId: 'prop_nonexistent', versionId: 'PROP999_V1' }),
    );
    expect(result.ok).toBe(false);
    expect(await studio.shots.byId(completeShotId)).toEqual(before);
  });

  it('invalid version (no saved snapshot) does not mutate', async () => {
    const before = await studio.shots.byId(completeShotId);
    const result = await repinReferenceAction(
      projectSlug,
      completeShotId,
      fd({ kind: 'character', characterId: charId, versionId: `${charCode}_V99` }),
    );
    expect(result.ok).toBe(false);
    expect(await studio.shots.byId(completeShotId)).toEqual(before);
  });

  it('wrong project slug does not mutate', async () => {
    const before = await studio.shots.byId(completeShotId);
    const result = await repinReferenceAction(
      'no-such-project',
      completeShotId,
      fd({ kind: 'character', characterId: charId, versionId: `${charCode}_V2` }),
    );
    expect(result.ok).toBe(false);
    expect(await studio.shots.byId(completeShotId)).toEqual(before);
  });

  it('successful repin uses the existing boundary, changes only the pinned version and logs activity', async () => {
    const before = await studio.shots.byId(completeShotId);
    const activityBefore = await studio.activity.recent(projectId, 100);

    const result = await repinReferenceAction(
      projectSlug,
      completeShotId,
      fd({ kind: 'character', characterId: charId, versionId: `${charCode}_V2` }),
    );
    expect(result.ok).toBe(true);

    const after = await studio.shots.byId(completeShotId);
    expect(after!.characters[0]!.versionId).toBe(`${charCode}_V2`);
    expect(after!.title).toBe(before!.title);
    expect(after!.description).toBe(before!.description);
    expect(after!.locationId).toBe(before!.locationId);
    expect(after!.locationVersionId).toBe(before!.locationVersionId);
    expect(after!.props).toEqual(before!.props);
    expect(after!.dialogue).toBe(before!.dialogue);
    expect(after!.status).toBe(before!.status);

    const activityAfter = await studio.activity.recent(projectId, 100);
    const repinEvents = activityAfter.filter((entry) => entry.action === 'shot.repinned');
    expect(repinEvents.length).toBe(activityBefore.filter((entry) => entry.action === 'shot.repinned').length + 1);
  });

  it('repin has no provider, approval or generation side effects', async () => {
    const assetsBefore = await studio.assets.list(projectId);
    const generationsBefore = await studio.generations.listByProject(projectId);

    const result = await repinReferenceAction(
      projectSlug,
      completeShotId,
      fd({ kind: 'location', locationId: locId, versionId: `${locCode}_V2` }),
    );
    expect(result.ok).toBe(true);

    const assetsAfter = await studio.assets.list(projectId);
    const generationsAfter = await studio.generations.listByProject(projectId);
    expect(assetsAfter.map((a) => `${a.id}:${a.approvalState}`).sort()).toEqual(
      assetsBefore.map((a) => `${a.id}:${a.approvalState}`).sort(),
    );
    expect(generationsAfter.length).toBe(generationsBefore.length);
  });

  it('the References tab reflects the repinned version after a successful repin', async () => {
    const html = await renderShotPage(completeShotCode, 'references');
    expect(html).toContain(`${charCode}_V2`);
    expect(html).toContain('All references pinned and resolved');
  });
});

describe('ShotInspectorIA3 — Visual Control tab unchanged (VC1–VC4 regression)', () => {
  it('Visual Control tab still renders its own section boundary', async () => {
    const html = await renderShotPage(completeShotCode, 'visual-control');
    expect(html).toContain('shot-tabpanel-visual-control');
    expect(html.length).toBeGreaterThan(0);
  });
});
