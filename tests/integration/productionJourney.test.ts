import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('production-journey');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createPromptService } = await import('@/application/services/promptService');
const { createExportService } = await import('@/application/services/exportService');
const { createProductionJourneyService, isKnownJourneyRoute } = await import(
  '@/application/services/productionJourneyService'
);

const studio = getStudio();
const projects = createProjectService(studio);
const prompts = createPromptService(studio);
const exportsService = createExportService(studio);
const journey = createProductionJourneyService(studio);

beforeAll(() => runMigrations());
afterAll(() => env.cleanup());

/**
 * A non-legacy Motion Comic project with no style preset, so the tests exercise
 * Journey progression rather than the separate Part-2 legacy-null identity gate
 * or bible-anchor requirements.
 */
async function createMinimalProject(title: string) {
  return projects.create({
    title,
    aspectRatio: '16:9',
    durationTargetSeconds: 30,
    stylePresetKey: 'no-such-preset',
    productionType: 'motion-comic',
  });
}

/**
 * Saves and marks a script parsed directly through the repository, bypassing
 * scriptService's parser (which would create characters/locations from raw
 * text and reintroduce bible-anchor requirements the "minimal project"
 * fixtures above are deliberately built to avoid). Clears the script-empty /
 * script-unparsed Develop blocker so later-phase fixtures are reachable.
 */
async function markScriptReady(projectId: string) {
  const script = await studio.scripts.save(projectId, {
    title: 'Main script',
    scriptType: 'motion-comic',
    raw: 'INT. TEST LOCATION - DAY\n\nSomething happens.',
  });
  await studio.scripts.markParsed(script.id);
}

async function addMinimalSceneAndShot(projectId: string, episodeId: string) {
  const scene = await studio.scenes.create(projectId, {
    code: 'SC01',
    number: 1,
    title: 'Scene One',
    episodeId,
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
  const shot = await studio.shots.create(projectId, {
    sceneId: scene.id,
    code: 'EP01_SC01_SH001',
    shotNumber: 1,
    episodeId,
    title: 'Shot One',
    description: 'Test shot',
    shotSize: 'wide',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'medium' },
    lens: '50mm',
    durationSeconds: 5,
    dialogue: '',
    characters: [],
    location: null,
    props: [],
    emotion: 'neutral',
    lighting: 'day',
    visualEffects: [],
    soundEffects: [],
    continuity: {
      incoming: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] }, note: '' },
      outgoing: { characters: {}, environment: { time: 'day', weather: 'clear', lightDirection: 'ambient', damagedObjects: [] }, note: '' },
      intentionalChanges: [],
    },
    aspectRatio: '16:9',
    importance: 'normal',
  });
  return { scene, shot };
}

async function approveImageAssetFor(projectId: string, shotId: string) {
  const asset = await studio.assets.register({
    projectId,
    shotId,
    generationId: null,
    kind: 'image',
    name: 'required.png',
    durationSeconds: null,
    storageKey: `required-${shotId}.png`,
    mimeType: 'image/png',
    sizeBytes: 1024,
    checksum: `image-checksum-${shotId}`,
    width: 1280,
    height: 720,
    tags: [],
    metadata: {},
  });
  return studio.assets.setApproval(asset.id, 'approved');
}

async function approveVideoAssetFor(projectId: string, shotId: string) {
  const asset = await studio.assets.register({
    projectId,
    shotId,
    generationId: null,
    kind: 'video',
    name: 'ready.mp4',
    durationSeconds: 5,
    storageKey: `ready-${shotId}.mp4`,
    mimeType: 'video/mp4',
    sizeBytes: 2048,
    checksum: `checksum-${shotId}`,
    width: null,
    height: null,
    tags: [],
    metadata: {},
  });
  return studio.assets.setApproval(asset.id, 'approved');
}

describe('production journey read model — real persisted evidence', () => {
  it('Always returns exactly six phases in canonical order for a freshly created project', async () => {
    const project = await createMinimalProject('Journey Canonical Order');
    const state = await journey.overview(project.slug);
    expect(state.phases.map((phase) => phase.phase)).toEqual(['setup', 'develop', 'plan', 'produce', 'review', 'finish']);
  });

  it('a newly created project with zero episodes shows Setup as the only actionable phase', async () => {
    const project = await projects.create({
      title: 'Zero Episode Journey',
      stylePresetKey: 'no-such-preset',
      productionType: 'motion-comic',
    });
    const [onlyEpisode] = await studio.episodes.listByProject(project.id);
    // Direct repository access to force a state the normal write path refuses
    // (episodeService.deleteEpisode keeps at least one) — this is exactly the
    // fixture PRODUCTION-JOURNEY-ACCEPTANCE-PLAN.md's Slice 1 scenario needs.
    await studio.episodes.delete(onlyEpisode!.id);

    const state = await journey.overview(project.slug);

    expect(state.phases.every((phase) => phase.state === 'NOT_STARTED')).toBe(true);
    expect(state.primaryAction?.id).toBe('setup.create-first-episode');
  });

  it('Episode with no Scene leaves Setup Complete and later phases Not Started', async () => {
    const project = await createMinimalProject('Journey No Scene');
    const state = await journey.overview(project.slug);

    const setup = state.phases.find((phase) => phase.phase === 'setup')!;
    expect(setup.state).toBe('COMPLETE');
    for (const phase of ['plan', 'produce', 'review', 'finish'] as const) {
      expect(state.phases.find((p) => p.phase === phase)!.state).toBe('NOT_STARTED');
    }
  });

  it('Scene with no Shot recommends building shots', async () => {
    const project = await createMinimalProject('Journey No Shot');
    await markScriptReady(project.id);
    const [episode] = await studio.episodes.listByProject(project.id);
    await studio.scenes.create(project.id, {
      code: 'SC01',
      number: 1,
      title: 'Scene One',
      episodeId: episode!.id,
      locationId: null,
      timeOfDay: 'day',
      summary: '',
      action: 'Test',
      emotion: '',
      visualGoal: '',
      audioGoal: '',
      status: 'draft',
      characters: [],
      dialogue: [],
      durationSeconds: 10,
    });

    const state = await journey.overview(project.slug);
    const plan = state.phases.find((phase) => phase.phase === 'plan')!;
    expect(plan.warnings.map((issue) => issue.id)).toEqual(['warning.shots']);
    expect(state.primaryAction?.id).toBe('plan.build-shots');
  });

  it('the current phase is derived from real project data, not a stored flag', async () => {
    const project = await createMinimalProject('Journey Fresh Recompute');
    await markScriptReady(project.id);
    const [episode] = await studio.episodes.listByProject(project.id);
    const { shot } = await addMinimalSceneAndShot(project.id, episode!.id);

    const before = await journey.overview(project.slug);
    expect(before.primaryAction?.id).toBe('produce.compile-prompts');
    expect(before.primaryAction?.phase).toBe('produce');

    await prompts.buildForShot(shot.id, 'image');

    const after = await journey.overview(project.slug);
    expect(after.primaryAction?.id).not.toBe('produce.compile-prompts');
    expect(after).not.toEqual(before);
  });

  it('Pending asset review recommends reviewing assets', async () => {
    const project = await createMinimalProject('Journey Pending Review');
    await markScriptReady(project.id);
    const [episode] = await studio.episodes.listByProject(project.id);
    const { shot } = await addMinimalSceneAndShot(project.id, episode!.id);
    await prompts.buildForShot(shot.id, 'image');
    await studio.assets.register({
      projectId: project.id,
      shotId: shot.id,
      generationId: null,
      kind: 'image',
      name: 'pending.png',
      durationSeconds: null,
      storageKey: 'pending.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      checksum: 'pending-checksum',
      width: null,
      height: null,
      tags: [],
      metadata: {},
    });

    const state = await journey.overview(project.slug);
    expect(state.primaryAction?.id).toBe('review.pending-assets');
    const review = state.phases.find((phase) => phase.phase === 'review')!;
    expect(review.warnings.map((issue) => issue.id)).toEqual(['warning.asset-review']);
  });

  it('a fully complete project shows all six phases as Complete with no primary action', async () => {
    const project = await createMinimalProject('Journey Complete');
    await markScriptReady(project.id);
    const [episode] = await studio.episodes.listByProject(project.id);
    const { shot } = await addMinimalSceneAndShot(project.id, episode!.id);
    await prompts.buildForShot(shot.id, 'image');
    await approveImageAssetFor(project.id, shot.id);
    // Hybrid production readiness still needs a production-ready shot source.
    await approveVideoAssetFor(project.id, shot.id);
    // Motion Comic requires compose before export, so persist that evidence too.
    await studio.timelines.save(project.id, [], 'Journey Complete Timeline', episode!.id);

    const ready = await journey.overview(project.slug);
    expect(ready.phases.every((phase) => phase.phase === 'finish' || phase.state === 'COMPLETE')).toBe(true);
    const finish = ready.phases.find((phase) => phase.phase === 'finish')!;
    expect(finish.state).toBe('READY');
    expect(ready.primaryAction?.id).toBe('finish.run-export');

    await exportsService.run({ projectId: project.id, kind: 'project-package' });

    const complete = await journey.overview(project.slug);
    expect(complete.phases.every((phase) => phase.state === 'COMPLETE')).toBe(true);
    expect(complete.primaryAction).toBeNull();
    expect(complete.currentPhase).toBe('finish');
  });

  it('Every emitted route resolves against the approved route inventory for a real, evidence-rich project', async () => {
    const project = await createMinimalProject('Journey Route Safety');
    await markScriptReady(project.id);
    const [episode] = await studio.episodes.listByProject(project.id);
    const { shot } = await addMinimalSceneAndShot(project.id, episode!.id);
    await prompts.buildForShot(shot.id, 'image');

    const state = await journey.overview(project.slug);
    const routes = [
      ...state.blockers.map((issue) => issue.targetRoute),
      ...state.warnings.map((issue) => issue.targetRoute),
      ...(state.primaryAction ? [state.primaryAction.targetRoute] : []),
      ...state.secondaryActions.map((action) => action.targetRoute),
    ];
    for (const route of routes) {
      expect(isKnownJourneyRoute(route, project.slug)).toBe(true);
    }
  });

  it('Cross-project data is never included in another project\'s journey state', async () => {
    const projectA = await createMinimalProject('Journey Project A');
    const projectB = await createMinimalProject('Journey Project B');
    const [episodeB] = await studio.episodes.listByProject(projectB.id);
    await addMinimalSceneAndShot(projectB.id, episodeB!.id);

    const stateA = await journey.overview(projectA.slug);
    expect(stateA.projectId).toBe(projectA.id);
    expect(stateA.projectSlug).toBe(projectA.slug);
    for (const phase of stateA.phases) {
      for (const action of phase.nextActions) expect(action.targetRoute.startsWith(`/projects/${projectA.slug}`) || action.targetRoute === '/providers').toBe(true);
    }
    // Project A has no scenes/shots — it must not see Project B's Plan warning.
    const planA = stateA.phases.find((phase) => phase.phase === 'plan')!;
    expect(planA.state).toBe('NOT_STARTED');
  });

  it('The read model performs no writes and leaves activity history unchanged', async () => {
    const project = await createMinimalProject('Journey Read Only Proof');
    const [episode] = await studio.episodes.listByProject(project.id);
    await addMinimalSceneAndShot(project.id, episode!.id);

    const beforeActivity = await studio.activity.recent(project.id, 100);
    const beforeProject = await projects.get(project.slug);
    const beforeEpisodes = await studio.episodes.listByProject(project.id);
    const beforeScenes = await studio.scenes.listByProject(project.id);
    const beforeShots = await studio.shots.listByProject(project.id);

    await journey.overview(project.slug);
    await journey.overview(project.slug);

    const afterActivity = await studio.activity.recent(project.id, 100);
    const afterProject = await projects.get(project.slug);
    const afterEpisodes = await studio.episodes.listByProject(project.id);
    const afterScenes = await studio.scenes.listByProject(project.id);
    const afterShots = await studio.shots.listByProject(project.id);

    expect(afterActivity).toEqual(beforeActivity);
    expect(afterProject).toEqual(beforeProject);
    expect(afterEpisodes).toEqual(beforeEpisodes);
    expect(afterScenes).toEqual(beforeScenes);
    expect(afterShots).toEqual(beforeShots);
  });
});
