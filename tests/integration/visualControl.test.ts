import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('visual-control');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createPromptService } = await import('@/application/services/promptService');
const { createProductionStrategyService } = await import('@/application/services/productionStrategyService');
const { createVisualControlService } = await import('@/application/services/visualControlService');

const studio = getStudio();
const projects = createProjectService(studio);
const prompts = createPromptService(studio);
const production = createProductionStrategyService(studio);
const visualControl = createVisualControlService(studio);

beforeAll(() => runMigrations());
afterAll(() => env.cleanup());

/** A project with no style preset, so readiness has zero bible-anchor requirements. */
async function createMinimalProject(title: string) {
  return projects.create({ title, aspectRatio: '16:9', durationTargetSeconds: 30, stylePresetKey: 'no-such-preset' });
}
async function createPinnedShotFixture(title: string) {
  const project = await createMinimalProject(title);
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
    characters: [{ characterId: character.id, versionId: 'CHAR001_V1', screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' }],
    location: null,
    props: [],
    dialogue: '',
    emotion: 'neutral',
    lighting: 'day',
    visualEffects: [],
    soundEffects: [],
    continuity: {
      incoming: { note: '', characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] } },
      outgoing: { note: '', characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] } },
      intentionalChanges: [],
    },
    aspectRatio: '16:9',
    importance: 'normal',
  });
  return { project, episode: episode!, scene, character, shot };
}

async function registerApprovedImage(projectId: string, shotId: string, name: string, checksum: string) {
  const asset = await studio.assets.register({
    projectId,
    shotId,
    generationId: null,
    kind: 'image',
    name,
    storageKey: `${checksum}.png`,
    mimeType: 'image/png',
    sizeBytes: 100,
    checksum,
    width: null,
    height: null,
    durationSeconds: null,
    tags: [],
    metadata: {},
  });
  return studio.assets.setApproval(asset.id, 'approved');
}

describe('visual control read model — real persisted evidence', () => {
  it('gathers a project-scoped evidence snapshot for a pinned shot', async () => {
    const { project, character, shot } = await createPinnedShotFixture('Visual Control Evidence');

    const evidence = await visualControl.evidence(project.slug, shot.id);

    expect(evidence.projectId).toBe(project.id);
    expect(evidence.shotCode).toBe(shot.code);
    expect(evidence.pinnedReferences).toEqual([
      {
        kind: 'character',
        refId: character.id,
        code: 'CHAR001',
        versionId: 'CHAR001_V1',
        source: 'shot-field',
        resolved: true,
        resolvableReason: null,
      },
    ]);
    expect(evidence.outputProfile).toEqual({
      aspectRatio: project.aspectRatio,
      resolution: project.resolution,
      frameRate: project.frameRate,
    });
    expect(evidence.prompts.image).toBeNull();
  });

  it('rejects evidence for a shot that belongs to another project', async () => {
    const projectA = await createPinnedShotFixture('Visual Control Project A');
    const projectB = await createMinimalProject('Visual Control Project B');

    await expect(visualControl.evidence(projectB.slug, projectA.shot.id)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('throws a not-found error for a missing shot id', async () => {
    const { project } = await createPinnedShotFixture('Visual Control Missing Shot');
    await expect(visualControl.evidence(project.slug, 'shot_does_not_exist')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('is read-only: repeated reads leave all persisted rows untouched', async () => {
    const { project, shot } = await createPinnedShotFixture('Visual Control Read Only');
    await prompts.buildForShot(shot.id, 'image');

    const beforeActivity = await studio.activity.recent(project.id, 100);
    const beforeProject = await projects.get(project.slug);
    const beforeEpisodes = await studio.episodes.listByProject(project.id);
    const beforeScenes = await studio.scenes.listByProject(project.id);
    const beforeShots = await studio.shots.listByProject(project.id);
    const beforeAssets = await studio.assets.list(project.id);
    const beforeBindings = await studio.productionAssetBindings.listByProject(project.id);

    await visualControl.evidence(project.slug, shot.id);
    await visualControl.overview(project.slug, shot.id);

    expect(await studio.activity.recent(project.id, 100)).toEqual(beforeActivity);
    expect(await projects.get(project.slug)).toEqual(beforeProject);
    expect(await studio.episodes.listByProject(project.id)).toEqual(beforeEpisodes);
    expect(await studio.scenes.listByProject(project.id)).toEqual(beforeScenes);
    expect(await studio.shots.listByProject(project.id)).toEqual(beforeShots);
    expect(await studio.assets.list(project.id)).toEqual(beforeAssets);
    expect(await studio.productionAssetBindings.listByProject(project.id)).toEqual(beforeBindings);
  });

  it('each authored change to the shot or its references alters the package fingerprint', async () => {
    const { project, character, shot } = await createPinnedShotFixture('Visual Control Fingerprint');
    await prompts.buildForShot(shot.id, 'image');
    const anchorAsset = await registerApprovedImage(project.id, shot.id, 'anchor.png', 'anchor-checksum');
    await production.bind(project.slug, {
      assetId: anchorAsset.id,
      targetType: 'character',
      targetId: character.id,
      targetVersionId: 'CHAR001_V1',
      role: 'identity-anchor',
    });
    const pendingAsset = await studio.assets.register({
      projectId: project.id,
      shotId: shot.id,
      generationId: null,
      kind: 'image',
      name: 'pending.png',
      storageKey: 'pending.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      checksum: 'pending-checksum',
      width: null,
      height: null,
      durationSeconds: null,
      tags: [],
      metadata: {},
    });
    await production.bind(project.slug, {
      assetId: pendingAsset.id,
      targetType: 'character',
      targetId: character.id,
      targetVersionId: 'CHAR001_V1',
      role: 'identity-anchor',
    });

    const baseline = await visualControl.overview(project.slug, shot.id);
    expect(baseline.approvedReferences).toHaveLength(1);
    expect(baseline.assets.find((asset) => asset.assetId === anchorAsset.id)).toMatchObject({
      isRequiredReference: true,
      contributesToReadiness: true,
    });
    expect(baseline.assets.find((asset) => asset.assetId === pendingAsset.id)).toMatchObject({
      isRequiredReference: true,
      contributesToReadiness: false,
    });
    expect(baseline.packageFingerprint).toMatch(/^[0-9a-f]{64}$/);

    await studio.shots.update(shot.id, { lighting: 'night' });
    const afterLighting = await visualControl.overview(project.slug, shot.id);
    expect(afterLighting.packageFingerprint).not.toBe(baseline.packageFingerprint);

    await studio.shots.update(shot.id, { lighting: 'day' });
    const afterRevert = await visualControl.overview(project.slug, shot.id);
    expect(afterRevert.packageFingerprint).toBe(baseline.packageFingerprint);

    await studio.assets.setApproval(pendingAsset.id, 'approved');
    const afterApprovalChange = await visualControl.overview(project.slug, shot.id);
    expect(afterApprovalChange.packageFingerprint).not.toBe(baseline.packageFingerprint);
    expect(afterApprovalChange.assets.find((asset) => asset.assetId === pendingAsset.id)).toMatchObject({
      contributesToReadiness: true,
    });
  });

  it('reports an unresolved pin when the pinned snapshot version is missing', async () => {
    const { project, shot } = await createPinnedShotFixture('Visual Control Missing Pin');
    await studio.bibles.createCharacter(project.id, {
      code: 'CHAR002',
      name: 'Chưa có bản vẽ',
      role: 'supporting',
      identity: {},
      variable: {},
      promptToken: '',
      negativePrompt: '',
      forbiddenChanges: [],
      colorPalette: [],
      voiceProfileId: null,
      lockEnabled: true,
      status: 'draft',
    });
    const shotWithMissingPin = await studio.shots.update(shot.id, {
      characters: [
        { characterId: 'char_with_no_version', versionId: 'CHAR999_V1', screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' },
      ],
    });

    const evidence = await visualControl.evidence(project.slug, shotWithMissingPin.id);
    expect(evidence.pinnedReferences).toContainEqual({
      kind: 'character',
      refId: 'char_with_no_version',
      code: '',
      versionId: 'CHAR999_V1',
      source: 'shot-field',
      resolved: false,
      resolvableReason: 'MISSING_REFERENCE',
    });
  });

  it('a compiled prompt contributes its version and lint to the read model', async () => {
    const { project, shot } = await createPinnedShotFixture('Visual Control Prompt Evidence');
    await prompts.buildForShot(shot.id, 'image');

    const state = await visualControl.overview(project.slug, shot.id);
    expect(state.prompt.image.promptId).not.toBeNull();
    expect(state.prompt.image.version).toBeGreaterThanOrEqual(1);
    expect(typeof state.prompt.image.compiled).toBe('string');
    expect(typeof state.prompt.image.lintOk).toBe('boolean');
  });
});
