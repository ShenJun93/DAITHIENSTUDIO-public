/**
 * TASK-SCENE-SHOT-EDIT-SERVICES-001: scriptService.updateScene, against a real
 * temporary SQLite database. Scenes are created directly through the
 * `scenes` repository port (the same fixture pattern used by
 * tests/integration/crossEpisodeIsolation.test.ts) so each scenario controls
 * its own project/episode ownership shape without depending on the script
 * parser.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('sceneUpdate');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createEpisodeService } = await import('@/application/services/episodeService');
const { createScriptService } = await import('@/application/services/scriptService');

const studio = getStudio();
const projects = createProjectService(studio);
const episodesService = createEpisodeService(studio);
const scripts = createScriptService(studio);

interface SceneFixture {
  projectSlug: string;
  projectId: string;
  episodeAId: string;
  episodeBId: string;
  sceneInEpisodeAId: string;
  sceneInEpisodeBId: string;
}

let fixtureCounter = 0;

/** A fresh project with two episodes, each with one scene. */
async function setupProject(): Promise<SceneFixture> {
  fixtureCounter += 1;
  const project = await projects.create({
    title: `Scene Update Fixture ${fixtureCounter}`,
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
  });

  const [episodeA] = await episodesService.listEpisodes(project.id);
  const episodeB = await episodesService.createEpisode(project.id, { title: 'EP02', synopsis: '' });

  const sceneA = await studio.scenes.create(project.id, {
    episodeId: episodeA!.id,
    code: `SCN-A-${fixtureCounter}`,
    number: 1,
    title: 'Scene in Episode A',
    timeOfDay: 'day',
    summary: 'original summary',
    action: '',
    dialogue: [],
    emotion: '',
    visualGoal: '',
    audioGoal: '',
    durationSeconds: 10,
    locationId: null,
    characters: [],
    status: 'draft',
  });
  const sceneB = await studio.scenes.create(project.id, {
    episodeId: episodeB.id,
    code: `SCN-B-${fixtureCounter}`,
    number: 1,
    title: 'Scene in Episode B',
    timeOfDay: 'day',
    summary: 'original summary',
    action: '',
    dialogue: [],
    emotion: '',
    visualGoal: '',
    audioGoal: '',
    durationSeconds: 10,
    locationId: null,
    characters: [],
    status: 'draft',
  });

  return {
    projectSlug: project.slug,
    projectId: project.id,
    episodeAId: episodeA!.id,
    episodeBId: episodeB.id,
    sceneInEpisodeAId: sceneA.id,
    sceneInEpisodeBId: sceneB.id,
  };
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('scriptService.updateScene (TASK-SCENE-SHOT-EDIT-SERVICES-001)', () => {
  it('A valid same-project update persists and survives a reload', async () => {
    const fixture = await setupProject();

    const updated = await scripts.updateScene(fixture.projectSlug, fixture.sceneInEpisodeAId, {
      title: 'Updated title',
      summary: 'updated summary',
      durationSeconds: 42,
    });
    expect(updated.title).toBe('Updated title');
    expect(updated.summary).toBe('updated summary');
    expect(updated.durationSeconds).toBe(42);

    const reloaded = await studio.scenes.byId(fixture.sceneInEpisodeAId);
    expect(reloaded?.title).toBe('Updated title');
    expect(reloaded?.summary).toBe('updated summary');
  });

  it('A scene in a different episode updates successfully when no episode is asserted', async () => {
    const fixture = await setupProject();

    const updated = await scripts.updateScene(fixture.projectSlug, fixture.sceneInEpisodeBId, {
      title: 'Cross-episode-safe update',
    });
    expect(updated.title).toBe('Cross-episode-safe update');
  });

  it('Updating a scene in a project that does not exist is refused', async () => {
    const fixture = await setupProject();

    await expect(
      scripts.updateScene('project-that-does-not-exist', fixture.sceneInEpisodeAId, { title: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('Updating a scene id that does not exist is refused', async () => {
    const fixture = await setupProject();

    await expect(
      scripts.updateScene(fixture.projectSlug, 'scene-that-does-not-exist', { title: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('Updating a scene that belongs to a different project is refused', async () => {
    const a = await setupProject();
    const b = await setupProject();

    await expect(
      scripts.updateScene(b.projectSlug, a.sceneInEpisodeAId, { title: 'hijacked' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const reloaded = await studio.scenes.byId(a.sceneInEpisodeAId);
    expect(reloaded?.title).toBe('Scene in Episode A');
  });

  it('Updating a scene in a different episode is refused when that episode is explicitly asserted', async () => {
    const fixture = await setupProject();

    await expect(
      scripts.updateScene(
        fixture.projectSlug,
        fixture.sceneInEpisodeBId,
        { title: 'hijacked' },
        { episodeId: fixture.episodeAId },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const reloaded = await studio.scenes.byId(fixture.sceneInEpisodeBId);
    expect(reloaded?.title).toBe('Scene in Episode B');
  });

  it('Asserting an episode that does not belong to the project is refused', async () => {
    const a = await setupProject();
    const b = await setupProject();

    await expect(
      scripts.updateScene(a.projectSlug, a.sceneInEpisodeAId, { title: 'x' }, { episodeId: b.episodeAId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('An invalid payload (empty title) is rejected and the scene is left unchanged', async () => {
    const fixture = await setupProject();

    await expect(scripts.updateScene(fixture.projectSlug, fixture.sceneInEpisodeAId, { title: '' })).rejects.toThrow();

    const reloaded = await studio.scenes.byId(fixture.sceneInEpisodeAId);
    expect(reloaded?.title).toBe('Scene in Episode A');
  });

  it('Scene ordering (`number`) never changes through updateScene, even if the caller attempts it', async () => {
    const fixture = await setupProject();
    const before = await studio.scenes.byId(fixture.sceneInEpisodeAId);

    await scripts.updateScene(fixture.projectSlug, fixture.sceneInEpisodeAId, {
      title: 'still safe',
      number: 999,
    } as unknown as Record<string, unknown>);

    const after = await studio.scenes.byId(fixture.sceneInEpisodeAId);
    expect(after?.number).toBe(before?.number);
    expect(after?.title).toBe('still safe');
  });

  it('System-managed fields (code, id, episodeId) supplied in the patch are ignored, not applied', async () => {
    const fixture = await setupProject();
    const before = await studio.scenes.byId(fixture.sceneInEpisodeAId);

    await scripts.updateScene(fixture.projectSlug, fixture.sceneInEpisodeAId, {
      title: 'still safe again',
      code: 'HIJACKED_CODE',
      id: 'hijacked-id',
      episodeId: fixture.episodeBId,
    } as unknown as Record<string, unknown>);

    const after = await studio.scenes.byId(fixture.sceneInEpisodeAId);
    expect(after?.code).toBe(before?.code);
    expect(after?.id).toBe(before?.id);
    expect(after?.episodeId).toBe(before?.episodeId);
    expect(after?.title).toBe('still safe again');
  });
});
