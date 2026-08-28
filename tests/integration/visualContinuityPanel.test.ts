import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

Object.assign(globalThis, { React });

const env = useTempStudio('visual-continuity-panel');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createVisualControlService } = await import('@/application/services/visualControlService');
const { visualControlStateSchema } = await import('@/domain/visualControl/types');
const { VisualContinuityPanel } = await import('@/components/visual-control/VisualContinuityPanel');
const { VisualControlSection } = await import('@/components/visual-control/VisualControlSection');

const studio = getStudio();
const projects = createProjectService(studio);
const visualControl = createVisualControlService(studio);

beforeAll(() => runMigrations());
afterAll(() => env.cleanup());

async function createContinuityFixture(title: string) {
  const project = await projects.create({
    title,
    aspectRatio: '16:9',
    durationTargetSeconds: 30,
    stylePresetKey: 'no-such-preset',
  });
  const [episode] = await studio.episodes.listByProject(project.id);
  const scene = await studio.scenes.create(project.id, {
    code: 'SC01',
    number: 1,
    title: 'Scene One',
    episodeId: episode!.id,
    locationId: null,
    timeOfDay: 'day',
    summary: '',
    action: 'Test action',
    emotion: '',
    visualGoal: '',
    audioGoal: '',
    status: 'draft',
    characters: [],
    dialogue: [],
    durationSeconds: 10,
  });
  const character = await studio.bibles.createCharacter(project.id, {
    code: 'CHAR001',
    name: 'Triệu Ngốc',
    role: 'lead',
    identity: {},
    variable: {},
    promptToken: 'triệu ngốc',
    negativePrompt: '',
    forbiddenChanges: [],
    colorPalette: [],
    voiceProfileId: null,
    lockEnabled: true,
    status: 'draft',
  });
  await studio.bibles.saveVersion({
    kind: 'character',
    refId: character.id,
    version: 1,
    payload: { name: 'Triệu Ngốc', role: 'lead', promptToken: 'triệu ngốc' },
    note: 'Initial look',
  });

  type CreateShotInput = Parameters<typeof studio.shots.create>[1];
  const baseShot: Omit<CreateShotInput, 'code' | 'shotNumber' | 'continuity'> = {
    sceneId: scene.id,
    episodeId: episode!.id,
    title: 'Shot',
    description: '',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'medium' },
    lens: '50mm',
    durationSeconds: 5,
    characters: [
      { characterId: character.id, versionId: 'CHAR001_V1', screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' },
    ],
    location: null,
    props: [],
    dialogue: '',
    emotion: 'neutral',
    lighting: 'day',
    visualEffects: [],
    soundEffects: [],
    aspectRatio: '16:9',
    importance: 'normal',
  };

  const shot1 = await studio.shots.create(project.id, {
    ...baseShot,
    code: 'EP01_SC01_SH001',
    shotNumber: 1,
    continuity: {
      incoming: { note: '', characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] } },
      outgoing: {
        note: '',
        characters: {
          [character.id]: { costume: 'pale grey robe', hair: 'as designed', injuries: [], heldProps: [], position: 'center', facing: 'to-camera' },
        },
        environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] },
      },
      intentionalChanges: [],
    },
  });

  const shot2 = await studio.shots.create(project.id, {
    ...baseShot,
    code: 'EP01_SC01_SH002',
    shotNumber: 2,
    continuity: {
      incoming: {
        note: '',
        characters: {
          [character.id]: { costume: 'dark blue robe', hair: 'as designed', injuries: [], heldProps: [], position: 'center', facing: 'to-camera' },
        },
        environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] },
      },
      outgoing: { note: '', characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] } },
      intentionalChanges: [],
    },
  });

  return { project, episode: episode!, scene, character, shot1, shot2 };
}

describe('VisualContinuityPanel — real persisted continuity, read-only (VC4)', () => {
  it('operator can see continuity info (state vs finding) from real persisted boundary data', async () => {
    const { project, character, shot1, shot2 } = await createContinuityFixture('Visual Continuity Panel Real');

    const state = await visualControl.overview(project.slug, shot2.id);
    expect(visualControlStateSchema.safeParse(state).success).toBe(true);

    // The accepted read model supplies the neighbours, boundary state and findings.
    expect(state.continuity.previousShotCode).toBe(shot1.code);
    expect(state.continuity.nextShotCode).toBeNull();
    expect(state.visualSpec.continuityIn.characters[character.id]!.costume).toBe('dark blue robe');
    // The costume drift across the cut is a real finding produced by the domain checker.
    const finding = state.continuity.findings.find((item) => item.rule === 'character-costume-change');
    expect(finding).toBeDefined();
    expect(finding!.field).toBe(`${character.id}.costume`);

    const html = renderToStaticMarkup(
      React.createElement(VisualContinuityPanel, { state }),
    );

    // Previous/current/next context: prev shot code, current shot code, explicit missing next marker.
    expect(html).toContain(shot1.code);
    expect(html).toContain(shot2.code);
    expect(html).toContain('no next shot');
    // Character boundary state from the persisted continuity fields.
    expect(html).toContain('dark blue robe');
    expect(html).toContain('CHAR001');
    // The finding is presented as a finding, with expected → actual and shot codes.
    expect(html).toContain('Continuity findings');
    expect(html).not.toContain('character-costume-change'); // rule id moved to Technical
    expect(html).toContain('pale grey robe → dark blue robe');
    expect(html).toContain(shot1.code);
    // The accepted VC1 continuity fingerprint is moved to Technical tab.
    expect(html).not.toContain(state.continuity.fingerprint);

    // Read-only: no mutation surface in the React tree.
    expect(html).not.toMatch(/<button/);
    expect(html).not.toMatch(/<form/);
    expect(html).not.toMatch(/<select/);
    expect(html).not.toMatch(/<input/);
  });

  it('reads through the section without touching any persisted row (activity and data snapshot equal)', async () => {
    const { project, shot2 } = await createContinuityFixture('Visual Continuity Panel Read-Only Proof');
    const state = await visualControl.overview(project.slug, shot2.id);

    const beforeActivity = await studio.activity.recent(project.id, 100);
    const beforeProject = await projects.get(project.slug);
    const beforeEpisodes = await studio.episodes.listByProject(project.id);
    const beforeScenes = await studio.scenes.listByProject(project.id);
    const beforeShots = await studio.shots.listByProject(project.id);
    const beforeAssets = await studio.assets.list(project.id);
    const beforeBindings = await studio.productionAssetBindings.listByProject(project.id);

    const html = renderToStaticMarkup(
      React.createElement(VisualControlSection, { shotCode: state.shotCode, state }),
    );
    expect(html).toContain('Visual continuity');

    expect(await studio.activity.recent(project.id, 100)).toEqual(beforeActivity);
    expect(await projects.get(project.slug)).toEqual(beforeProject);
    expect(await studio.episodes.listByProject(project.id)).toEqual(beforeEpisodes);
    expect(await studio.scenes.listByProject(project.id)).toEqual(beforeScenes);
    expect(await studio.shots.listByProject(project.id)).toEqual(beforeShots);
    expect(await studio.assets.list(project.id)).toEqual(beforeAssets);
    expect(await studio.productionAssetBindings.listByProject(project.id)).toEqual(beforeBindings);
  });
});
