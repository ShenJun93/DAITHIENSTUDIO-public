/**
 * Storyboard drag-and-drop reordering (TASK-005), against a real SQLite file
 * and the real mock provider: a reorder persists, never renames a shot's
 * code/shotNumber, and actually drives the timeline and the exports — not
 * just the Shots screen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('shotOrder');

// Imported after the environment is pointed at the temp database.
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createTimelineService } = await import('@/application/services/timelineService');
const { createExportService } = await import('@/application/services/exportService');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const timelineService = createTimelineService(studio);
const exportService = createExportService(studio);

let projectSlug = '';
let sceneId = '';
let otherSceneShotId = '';

beforeAll(async () => {
  runMigrations();

  const project = await projects.create({
    title: 'Shot Order Test',
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: STYLE_PRESETS[0]?.key,
  });
  projectSlug = project.slug;

  await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(projectSlug);
  await scripts.buildShots(projectSlug);

  const sceneList = await studio.scenes.listByProject(project.id);
  for (const scene of sceneList) {
    const shotsInScene = await studio.shots.listByScene(scene.id);
    if (shotsInScene.length > 1 && !sceneId) {
      sceneId = scene.id;
    } else if (shotsInScene.length > 0 && scene.id !== sceneId && !otherSceneShotId) {
      otherSceneShotId = shotsInScene[0]!.id;
    }
  }
});

afterAll(() => {
  env.cleanup();
});

describe('storyboard reorder', () => {
  it('Reordering shots within a scene persists and survives a reload', async () => {
    const before = await studio.shots.listByScene(sceneId);
    expect(before.length).toBeGreaterThan(1);
    const reversedIds = [...before].reverse().map((shot) => shot.id);

    await studio.shots.reorder(sceneId, reversedIds);

    // "Reload" = a fresh read straight from the database.
    const after = await studio.shots.listByScene(sceneId);
    expect(after.map((shot) => shot.id)).toEqual(reversedIds);
  });

  it("A reorder never changes a shot's code or shot number", async () => {
    const before = await studio.shots.listByScene(sceneId);
    const originalById = new Map(before.map((shot) => [shot.id, { code: shot.code, shotNumber: shot.shotNumber }]));
    const shuffled = [...before].reverse().map((shot) => shot.id);

    await studio.shots.reorder(sceneId, shuffled);
    const after = await studio.shots.listByScene(sceneId);

    for (const shot of after) {
      const original = originalById.get(shot.id);
      expect(shot.code).toBe(original?.code);
      expect(shot.shotNumber).toBe(original?.shotNumber);
    }
  });

  it('The timeline reflects the reordered shot sequence', async () => {
    const shotsInScene = await studio.shots.listByScene(sceneId);
    const targetOrder = [...shotsInScene].reverse().map((shot) => shot.id);
    await studio.shots.reorder(sceneId, targetOrder);

    const built = await timelineService.build(projectSlug);
    const observedOrder = built.items.map((item) => item.shotId).filter((id) => targetOrder.includes(id));

    expect(observedOrder).toEqual(targetOrder);
  });

  it('Shot-list and voice-script exports reflect the reordered sequence', async () => {
    const shotsInScene = await studio.shots.listByScene(sceneId);
    const targetOrder = [...shotsInScene].reverse().map((shot) => shot.id);
    await studio.shots.reorder(sceneId, targetOrder);

    const pack = await exportService.buildPackage(projectSlug);
    const packShots = pack.shots as { id: string }[];
    const observedOrder = packShots.map((shot) => shot.id).filter((id) => targetOrder.includes(id));

    expect(observedOrder).toEqual(targetOrder);
  });

  it('Reordering refuses a shot id that does not belong to the scene', async () => {
    const shotsInScene = await studio.shots.listByScene(sceneId);
    const tampered = [otherSceneShotId, ...shotsInScene.slice(1).map((shot) => shot.id)];

    await expect(studio.shots.reorder(sceneId, tampered)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
