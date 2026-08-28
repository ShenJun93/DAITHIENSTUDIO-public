import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

Object.assign(globalThis, { React });

const env = useTempStudio('visual-control-section');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createPromptService } = await import('@/application/services/promptService');
const { createProductionStrategyService } = await import('@/application/services/productionStrategyService');
const { createVisualControlService } = await import('@/application/services/visualControlService');
const { visualControlStateSchema } = await import('@/domain/visualControl/types');
const { VisualControlSection } = await import('@/components/visual-control/VisualControlSection');

const studio = getStudio();
const projects = createProjectService(studio);
const prompts = createPromptService(studio);
const production = createProductionStrategyService(studio);
const visualControl = createVisualControlService(studio);

beforeAll(() => runMigrations());
afterAll(() => env.cleanup());

async function createPinnedShotFixture(title: string) {
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
  const shot = await studio.shots.create(project.id, {
    sceneId: scene.id,
    code: 'EP01_SC01_SH001',
    shotNumber: 1,
    episodeId: episode!.id,
    title: 'Shot One',
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
    continuity: {
      incoming: {
        note: '',
        characters: {},
        environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] },
      },
      outgoing: {
        note: '',
        characters: {},
        environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] },
      },
      intentionalChanges: [],
    },
    aspectRatio: '16:9',
    importance: 'normal',
  });
  return { project, episode: episode!, scene, character, shot };
}

describe('VisualControlSection — real persisted evidence with bounded VC8 approval controls', () => {
  it('renders the accepted read model and exact approval target without mutating persisted rows during render', async () => {
    const { project, character, shot } = await createPinnedShotFixture('Visual Control Section Evidence');
    await prompts.buildForShot(shot.id, 'image');
    const asset = await studio.assets.register({
      projectId: project.id,
      shotId: shot.id,
      generationId: null,
      kind: 'image',
      name: 'anchor.png',
      storageKey: 'anchor.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      checksum: 'anchor-checksum',
      width: null,
      height: null,
      durationSeconds: null,
      tags: [],
      metadata: {},
    });
    await studio.assets.setApproval(asset.id, 'approved');
    await production.bind(project.slug, {
      assetId: asset.id,
      targetType: 'character',
      targetId: character.id,
      targetVersionId: 'CHAR001_V1',
      role: 'identity-anchor',
    });

    const state = await visualControl.overview(project.slug, shot.id);
    expect(visualControlStateSchema.safeParse(state).success).toBe(true);

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

    expect(html).toContain('Visual Control');
    expect(html).toContain('Evidence complete');
    expect(html).toContain('All pinned');
    expect(html).toContain('References approved');
    expect(html).toContain('Execution pending');
    expect(html).toContain('anchor.png');
    expect(html).toContain('CHAR001_V1');
    expect(html).toContain('Visual package approval');
    expect(html).toContain('Approve visual package');
    expect(html).toContain(state.packageFingerprint);
    expect(html).not.toMatch(/<form/);

    expect(await studio.activity.recent(project.id, 100)).toEqual(beforeActivity);
    expect(await projects.get(project.slug)).toEqual(beforeProject);
    expect(await studio.episodes.listByProject(project.id)).toEqual(beforeEpisodes);
    expect(await studio.scenes.listByProject(project.id)).toEqual(beforeScenes);
    expect(await studio.shots.listByProject(project.id)).toEqual(beforeShots);
    expect(await studio.assets.list(project.id)).toEqual(beforeAssets);
    expect(await studio.productionAssetBindings.listByProject(project.id)).toEqual(beforeBindings);
  });

  it('renders the exact compiled prompt version for the shot', async () => {
    const { project, shot } = await createPinnedShotFixture('Visual Control Section Prompt');
    await prompts.buildForShot(shot.id, 'image');

    const state = await visualControl.overview(project.slug, shot.id);
    const html = renderToStaticMarkup(
      React.createElement(VisualControlSection, { shotCode: state.shotCode, state }),
    );

    expect(state.prompt.image.promptId).not.toBeNull();
    expect(state.prompt.image.version).toBeGreaterThanOrEqual(1);
    expect(html).toContain(`v${state.prompt.image.version}`);
    expect(html).toContain(state.prompt.image.promptId!);
    // The lint state is shown honestly as ok or issues — never fabricated.
    expect(html).toMatch(/lint (ok|issues)/);
  });
});
