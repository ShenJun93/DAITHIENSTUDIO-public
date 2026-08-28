/**
 * Shot deletion (TASK-REFINE-004), against a real SQLite file and the real
 * mock provider: a deleted shot is soft-deleted (never a hard DELETE), its
 * unapproved assets go with it, its approved assets are detached and kept in
 * the project library, and every downstream reader (export) stops showing it
 * without corrupting anything else.
 *
 * Each scenario builds its own project fixture so the tests stay
 * order-independent (rule 08-testing.md #7) instead of sharing mutable state.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('shotDelete');

// Imported after the environment is pointed at the temp database.
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createAssetService } = await import('@/application/services/assetService');
const { createQualityService } = await import('@/application/services/qualityService');
const { createPromptService } = await import('@/application/services/promptService');
const { createGenerationService } = await import('@/application/services/generationService');
const { createExportService } = await import('@/application/services/exportService');
const { createWorker } = await import('@/infrastructure/queue/worker');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const assets = createAssetService(studio);
const quality = createQualityService(studio);
const promptService = createPromptService(studio);
const generations = createGenerationService(studio);
const exportService = createExportService(studio);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngFixture = (payload: string): Buffer => Buffer.concat([PNG_SIGNATURE, Buffer.from(payload)]);

let fixtureCounter = 0;

/** A fresh project with the demo script parsed and full shot coverage built. */
async function setupProject() {
  fixtureCounter += 1;
  const project = await projects.create({
    title: `Shot Delete Fixture ${fixtureCounter}`,
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: STYLE_PRESETS[0]?.key,
    productionType: 'motion-comic',
  });
  await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(project.slug);
  await scripts.buildShots(project.slug);

  const sceneList = await studio.scenes.listByProject(project.id);
  const scenesWithShots = await Promise.all(
    sceneList.map(async (scene) => ({ scene, shots: await studio.shots.listByScene(scene.id) })),
  );
  scenesWithShots.sort((a, b) => b.shots.length - a.shots.length);

  return { project, scenesWithShots };
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('shot deletion', () => {
  it('Deleting a shot removes it from the scene and the project shot list, and it stays gone after a reload', async () => {
    const { project, scenesWithShots } = await setupProject();
    const { scene, shots: before } = scenesWithShots[0]!;
    const target = before[0]!;

    const result = await scripts.deleteShot(project.slug, scene.id, target.id);
    expect(result.deletedShotCode).toBe(target.code);

    const afterScene = await studio.shots.listByScene(scene.id);
    expect(afterScene.find((shot) => shot.id === target.id)).toBeUndefined();
    expect(afterScene).toHaveLength(before.length - 1);

    // "Reload" = a fresh read straight from the database.
    const afterProject = await studio.shots.listByProject(project.id);
    expect(afterProject.find((shot) => shot.id === target.id)).toBeUndefined();
    expect(await studio.shots.byId(target.id)).toBeNull();
  });

  it('Deleting a shot that belongs to a different project is refused', async () => {
    const a = await setupProject();
    const b = await setupProject();
    const shotA = a.scenesWithShots[0]!.shots[0]!;
    const sceneB = b.scenesWithShots[0]!.scene;

    await expect(scripts.deleteShot(b.project.slug, sceneB.id, shotA.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await studio.shots.byId(shotA.id)).not.toBeNull();
  });

  it('Deleting a shot with a scene id it does not belong to is refused', async () => {
    const { project, scenesWithShots } = await setupProject();
    const shotInSceneA = scenesWithShots[0]!.shots[0]!;
    const sceneB = scenesWithShots[1]!.scene;

    await expect(scripts.deleteShot(project.slug, sceneB.id, shotInSceneA.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await studio.shots.byId(shotInSceneA.id)).not.toBeNull();
  });

  it('Deleting the same shot twice fails the second time instead of double-deleting', async () => {
    const { project, scenesWithShots } = await setupProject();
    const { scene, shots } = scenesWithShots[0]!;
    const shot = shots[0]!;

    const first = await scripts.deleteShot(project.slug, scene.id, shot.id);
    expect(first.deletedShotCode).toBe(shot.code);

    await expect(scripts.deleteShot(project.slug, scene.id, shot.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('Submitting a duplicate delete request while one is already in flight never leaves the shot half-deleted', async () => {
    const { project, scenesWithShots } = await setupProject();
    const { scene, shots } = scenesWithShots[0]!;
    const shot = shots[0]!;

    const outcomes = await Promise.allSettled([
      scripts.deleteShot(project.slug, scene.id, shot.id),
      scripts.deleteShot(project.slug, scene.id, shot.id),
    ]);

    expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);

    // Whichever interleaving happened, the shot converges to soft-deleted
    // exactly once and every sibling shot in the scene survives untouched.
    expect(await studio.shots.byId(shot.id)).toBeNull();
    const remaining = await studio.shots.listByScene(scene.id);
    expect(remaining.find((candidate) => candidate.id === shot.id)).toBeUndefined();
    expect(remaining).toHaveLength(shots.length - 1);
  });

  it('An approved asset is detached, not deleted, when its shot is removed', async () => {
    const { project, scenesWithShots } = await setupProject();
    const { scene, shots } = scenesWithShots[0]!;
    const shot = shots[0]!;

    const uploaded = await assets.upload(
      project.slug,
      { kind: 'image', name: 'approved-plate.png', shotId: shot.id },
      { fileName: 'approved-plate.png', mimeType: 'image/png', data: pngFixture('approved-bytes') },
    );
    await quality.checkAsset(uploaded.id);
    const approved = await assets.decide(uploaded.id, 'approved', 'looks right', null);
    expect(approved.approvalState).toBe('approved');

    await scripts.deleteShot(project.slug, scene.id, shot.id);

    const afterDelete = await studio.assets.byId(uploaded.id);
    expect(afterDelete).not.toBeNull();
    expect(afterDelete!.approvalState).toBe('approved');
    expect(afterDelete!.shotId).toBeNull();
  });

  it('An unapproved asset is soft-deleted along with its shot', async () => {
    const { project, scenesWithShots } = await setupProject();
    const { scene, shots } = scenesWithShots[0]!;
    const shot = shots[0]!;

    const uploaded = await assets.upload(
      project.slug,
      { kind: 'image', name: 'draft-plate.png', shotId: shot.id },
      { fileName: 'draft-plate.png', mimeType: 'image/png', data: pngFixture('draft-bytes') },
    );
    expect(uploaded.approvalState).toBe('pending');

    await scripts.deleteShot(project.slug, scene.id, shot.id);

    expect(await studio.assets.byId(uploaded.id)).toBeNull();
  });

  it('Deleting a shot in one project leaves every shot in an unrelated project untouched', async () => {
    const subject = await setupProject();
    const control = await setupProject();
    const controlBefore = await studio.shots.listByProject(control.project.id);

    const { scene, shots } = subject.scenesWithShots[0]!;
    await scripts.deleteShot(subject.project.slug, scene.id, shots[0]!.id);

    const controlAfter = await studio.shots.listByProject(control.project.id);
    expect(controlAfter).toHaveLength(controlBefore.length);
    expect(controlAfter.map((shot) => shot.id).sort()).toEqual(controlBefore.map((shot) => shot.id).sort());
  });

  it('Deleting the first, middle and last shot of a scene each work and preserve the order of the rest', async () => {
    const { project, scenesWithShots } = await setupProject();
    const { scene, shots } = scenesWithShots[0]!;
    expect(shots.length).toBeGreaterThanOrEqual(3);

    let current = shots;

    const first = current[0]!;
    await scripts.deleteShot(project.slug, scene.id, first.id);
    current = await studio.shots.listByScene(scene.id);
    expect(current.map((shot) => shot.id)).toEqual(shots.slice(1).map((shot) => shot.id));

    const middleIndex = Math.floor(current.length / 2);
    const middle = current[middleIndex]!;
    const expectedAfterMiddle = current.filter((shot) => shot.id !== middle.id).map((shot) => shot.id);
    await scripts.deleteShot(project.slug, scene.id, middle.id);
    current = await studio.shots.listByScene(scene.id);
    expect(current.map((shot) => shot.id)).toEqual(expectedAfterMiddle);

    const last = current[current.length - 1]!;
    const expectedAfterLast = current.filter((shot) => shot.id !== last.id).map((shot) => shot.id);
    await scripts.deleteShot(project.slug, scene.id, last.id);
    current = await studio.shots.listByScene(scene.id);
    expect(current.map((shot) => shot.id)).toEqual(expectedAfterLast);
  });

  it('A deleted shot and its prompt/generation are excluded from a fresh export, but its cost is not', async () => {
    const { project, scenesWithShots } = await setupProject();
    const { scene, shots } = scenesWithShots[0]!;
    const shot = shots[0]!;

    await promptService.buildForShot(shot.id, 'image');
    const prompt = await studio.prompts.findForShot(shot.id, 'image');
    expect(prompt).not.toBeNull();

    const request = {
      projectId: project.id,
      shotId: shot.id,
      promptId: prompt!.id,
      kind: 'image' as const,
      provider: 'mock',
      params: { count: 1 },
      referenceAssetIds: [],
      priority: 10,
    };
    const prepared = await generations.prepareImage(request);
    const enqueued = await generations.confirmImage({
      request,
      confirmationToken: prepared.confirmationToken,
    });
    await createWorker(studio, { workerId: 'shot-delete-export-test' }).drain();
    const generationBefore = await studio.generations.byId(enqueued.generation.id);
    expect(generationBefore?.status).toBe('completed');
    const spentBefore = generationBefore!.actualCostUsd;

    await scripts.deleteShot(project.slug, scene.id, shot.id);

    const result = await exportService.run({ projectId: project.id, kind: 'project-package' });
    const { body } = await exportService.read(result.export.id);
    const pack = JSON.parse(body) as {
      shots: { id: string }[];
      prompts: { id: string }[];
      generations: { id: string }[];
      costs: { actualUsd: number };
    };

    expect(pack.shots.find((s) => s.id === shot.id)).toBeUndefined();
    expect(pack.generations.find((g) => g.id === enqueued.generation.id)).toBeUndefined();
    expect(pack.prompts.find((p) => p.id === prompt!.id)).toBeUndefined();
    // Cost already spent on the now-deleted shot must still count toward the
    // project total — a deletion can never make real spend disappear.
    expect(pack.costs.actualUsd).toBeGreaterThanOrEqual(spentBefore);
  });
});
