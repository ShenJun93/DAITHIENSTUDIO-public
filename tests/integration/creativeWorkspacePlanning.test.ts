import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('creative-workspace-planning');
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createPromptService } = await import('@/application/services/promptService');
const { createGenerationService } = await import('@/application/services/generationService');
const { createCreativeWorkspaceService } = await import('@/application/services/creativeWorkspaceService');
const { createWorker } = await import('@/infrastructure/queue/worker');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const prompts = createPromptService(studio);
const generations = createGenerationService(studio);
const workspace = createCreativeWorkspaceService(studio);

beforeAll(() => runMigrations());
afterAll(() => env.cleanup());

describe('Script/Scene Overview and Scene Board persisted projection', () => {
  it('Script / Scene Overview empty state: a project with an unparsed (unsaved) script yields zero scenes without writing data', async () => {
    // Every project starts with an empty "Main script" draft row created at
    // project creation (projectService.create) — an honest, real, persisted
    // record, so board.scriptStatus is 'draft', not null. The empty state
    // signal is genuinely zero scenes, not the absence of a script row.
    const project = await projects.create({ title: 'Empty Script Project', format: 'motion-comic', platform: 'youtube', aspectRatio: '16:9', durationTargetSeconds: 60 });
    const before = await projects.get(project.slug);
    const board = await workspace.sceneBoard(project.slug);
    const after = await projects.get(project.slug);

    expect(board.scenes).toEqual([]);
    expect(board.scriptStatus).toBe('draft');
    expect(after).toEqual(before);
  });

  it('Script / Scene Overview populated state: scenes carry real script status/version and preserve their sequence, without hardcoding a project name', async () => {
    const project = await projects.create({ title: 'Scene Board Project', aspectRatio: '16:9', durationTargetSeconds: 120 });
    await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(project.slug);
    await scripts.buildShots(project.slug);

    const board = await workspace.sceneBoard(project.slug);
    expect(board.scenes.length).toBeGreaterThan(0);
    expect(board.scriptStatus).not.toBeNull();
    // version 2: version 1 is the empty draft auto-created at project
    // creation; saving real content bumps it once.
    expect(board.scriptVersion).toBe(2);

    // scene order preservation: ascending by scene number, matching persisted sequence
    const numbers = board.scenes.map((scene) => scene.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

    for (const scene of board.scenes) {
      expect(scene.shotCount).toBeGreaterThanOrEqual(0);
      expect(scene.characterCount).toBeGreaterThanOrEqual(0);
    }
    expect(board.scenes.some((scene) => scene.shotCount > 0)).toBe(true);
  });
});

describe('Shot Storyboard persisted projection', () => {
  it('Shot Storyboard empty state: a project with no shots yields zero entries', async () => {
    const project = await projects.create({ title: 'Empty Shots Project', format: 'motion-comic', platform: 'youtube', aspectRatio: '16:9', durationTargetSeconds: 60 });
    const storyboard = await workspace.shotStoryboard(project.slug);
    expect(storyboard.shots).toEqual([]);
    expect(storyboard.sceneFilter).toBeNull();
  });

  it('Shot Storyboard populated state: shot order preservation, and prompt/asset/render coverage derived from real records after a completed generation', async () => {
    const project = await projects.create({
      title: 'Shot Storyboard Project',
      aspectRatio: '16:9',
      durationTargetSeconds: 120,
      productionType: 'motion-comic',
    });
    await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(project.slug);
    await scripts.buildShots(project.slug);

    const projectRecord = await projects.get(project.slug);
    const allShots = await studio.shots.listByProject(projectRecord.id);
    const targetShot = allShots.find((shot) => shot.characters.length > 0)!;

    // shot order preservation: unfiltered storyboard matches persisted sortIndex order
    const before = await workspace.shotStoryboard(project.slug);
    const bySortIndex = [...allShots].sort((a, b) => a.sortIndex - b.sortIndex).map((shot) => shot.id);
    expect(before.shots.map((shot) => shot.id)).toEqual(bySortIndex);

    // Before any prompt/generation: honest zero coverage, not fabricated.
    const beforeEntry = before.shots.find((shot) => shot.id === targetShot.id)!;
    expect(beforeEntry.promptCount).toBe(0);
    expect(beforeEntry.generationStatus).toBeNull();
    expect(beforeEntry.assetCoverage).toEqual({ total: 0, approved: 0 });
    expect(beforeEntry.warnings).toContain('No prompt compiled yet.');

    const built = await prompts.buildForShot(targetShot.id, 'image');
    const request = {
      projectId: projectRecord.id,
      shotId: targetShot.id,
      promptId: built.prompt.id,
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
    await createWorker(studio, { workerId: 'test' }).drain();

    const after = await workspace.shotStoryboard(project.slug);
    const afterEntry = after.shots.find((shot) => shot.id === targetShot.id)!;
    expect(afterEntry.promptCount).toBe(1);
    expect(afterEntry.generationStatus).toBe('completed');
    expect(afterEntry.assetCoverage.total).toBeGreaterThan(0);
    expect(afterEntry.warnings).not.toContain('No prompt compiled yet.');
    expect(enqueued.generation.status).toBe('pending'); // sanity: enqueue itself does not synchronously complete
  });

  it('Shot Storyboard scene filter: narrows to one real scene by code without hardcoding it', async () => {
    const project = await projects.create({ title: 'Scene Filter Project', aspectRatio: '16:9', durationTargetSeconds: 120 });
    await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(project.slug);
    await scripts.buildShots(project.slug);

    const board = await workspace.sceneBoard(project.slug);
    const targetScene = board.scenes.find((scene) => scene.shotCount > 0)!;

    const filtered = await workspace.shotStoryboard(project.slug, undefined, targetScene.code);
    expect(filtered.sceneFilter).toBe(targetScene.code);
    expect(filtered.sceneFilterValid).toBe(true);
    expect(filtered.shots.length).toBe(targetScene.shotCount);
    expect(filtered.shots.every((shot) => shot.sceneCode === targetScene.code)).toBe(true);
  });

  it('Shot Storyboard scene filter with an unknown scene code: an honest empty result, never every shot, and the filter is reported as invalid rather than silently ignored', async () => {
    const project = await projects.create({ title: 'Unknown Scene Filter Project', aspectRatio: '16:9', durationTargetSeconds: 120 });
    await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(project.slug);
    await scripts.buildShots(project.slug);

    const unfiltered = await workspace.shotStoryboard(project.slug);
    const filtered = await workspace.shotStoryboard(project.slug, undefined, 'SC99');
    expect(filtered.shots).toEqual([]);
    expect(filtered.sceneFilter).toBe('SC99');
    expect(filtered.sceneFilterValid).toBe(false);
    expect(unfiltered.shots.length).toBeGreaterThan(0);
    expect(unfiltered.sceneFilterValid).toBe(true);
  });
});
