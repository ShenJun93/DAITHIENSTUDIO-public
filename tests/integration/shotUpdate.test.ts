/**
 * TASK-SCENE-SHOT-EDIT-SERVICES-001: scriptService.updateShot and the
 * refactored PATCH /api/shots/[id] route, against a real temporary SQLite
 * database. Scenes/shots are created directly through the repository ports
 * (the same fixture pattern used by tests/integration/shotDelete.test.ts and
 * tests/integration/crossEpisodeIsolation.test.ts) so each scenario controls
 * its own project/scene ownership shape without depending on the script
 * parser.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContinuityState } from '@/domain/schemas';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('shotUpdate');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createEpisodeService } = await import('@/application/services/episodeService');
const { createScriptService } = await import('@/application/services/scriptService');
const { PATCH: patchShotRoute } = await import('@/app/api/shots/[id]/route');

const studio = getStudio();
const projects = createProjectService(studio);
const episodesService = createEpisodeService(studio);
const scripts = createScriptService(studio);

interface ShotFixture {
  projectSlug: string;
  projectId: string;
  sceneAId: string;
  sceneBId: string;
  shotInSceneAId: string;
  shotInSceneBId: string;
}

let fixtureCounter = 0;

const CONTINUITY_STATE: ContinuityState = {
  note: '',
  characters: {},
  environment: { time: 'unspecified', weather: 'unspecified', lightDirection: 'unspecified', damagedObjects: [] },
};

/** A fresh project with two scenes, each with one shot. */
async function setupProject(): Promise<ShotFixture> {
  fixtureCounter += 1;
  const project = await projects.create({
    title: `Shot Update Fixture ${fixtureCounter}`,
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
  });
  const [episode] = await episodesService.listEpisodes(project.id);

  const sceneA = await studio.scenes.create(project.id, {
    episodeId: episode!.id,
    code: `SU-SC-A-${fixtureCounter}`,
    number: 1,
    title: 'Scene A',
    timeOfDay: 'day',
    summary: '',
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
    episodeId: episode!.id,
    code: `SU-SC-B-${fixtureCounter}`,
    number: 2,
    title: 'Scene B',
    timeOfDay: 'day',
    summary: '',
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

  const shotA = await studio.shots.create(project.id, {
    episodeId: episode!.id,
    sceneId: sceneA.id,
    code: `SU-SH-A-${fixtureCounter}`,
    shotNumber: 1,
    title: 'Shot A',
    description: 'original description',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'static' },
    lens: '50mm',
    durationSeconds: 5,
    characters: [],
    location: null,
    props: [],
    dialogue: '',
    emotion: '',
    lighting: '',
    visualEffects: [],
    soundEffects: [],
    continuity: { incoming: CONTINUITY_STATE, outgoing: CONTINUITY_STATE, intentionalChanges: [] },
    aspectRatio: '16:9',
    importance: 'normal',
  });
  const shotB = await studio.shots.create(project.id, {
    episodeId: episode!.id,
    sceneId: sceneB.id,
    code: `SU-SH-B-${fixtureCounter}`,
    shotNumber: 1,
    title: 'Shot B',
    description: '',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'static' },
    lens: '50mm',
    durationSeconds: 5,
    characters: [],
    location: null,
    props: [],
    dialogue: '',
    emotion: '',
    lighting: '',
    visualEffects: [],
    soundEffects: [],
    continuity: { incoming: CONTINUITY_STATE, outgoing: CONTINUITY_STATE, intentionalChanges: [] },
    aspectRatio: '16:9',
    importance: 'normal',
  });

  return {
    projectSlug: project.slug,
    projectId: project.id,
    sceneAId: sceneA.id,
    sceneBId: sceneB.id,
    shotInSceneAId: shotA.id,
    shotInSceneBId: shotB.id,
  };
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('scriptService.updateShot (TASK-SCENE-SHOT-EDIT-SERVICES-001)', () => {
  it('A valid same-project/same-scene update persists and survives a reload', async () => {
    const fixture = await setupProject();

    const updated = await scripts.updateShot(fixture.projectSlug, fixture.sceneAId, fixture.shotInSceneAId, {
      title: 'Updated shot title',
      description: 'updated description',
      lens: '85mm',
    });
    expect(updated.title).toBe('Updated shot title');
    expect(updated.lens).toBe('85mm');

    const reloaded = await studio.shots.byId(fixture.shotInSceneAId);
    expect(reloaded?.title).toBe('Updated shot title');
    expect(reloaded?.description).toBe('updated description');
  });

  it('Updating a shot in a project that does not exist is refused', async () => {
    const fixture = await setupProject();

    await expect(
      scripts.updateShot('project-that-does-not-exist', fixture.sceneAId, fixture.shotInSceneAId, { title: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('Updating a shot with a scene id that does not exist is refused', async () => {
    const fixture = await setupProject();

    await expect(
      scripts.updateShot(fixture.projectSlug, 'scene-that-does-not-exist', fixture.shotInSceneAId, { title: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('Updating a shot id that does not exist is refused', async () => {
    const fixture = await setupProject();

    await expect(
      scripts.updateShot(fixture.projectSlug, fixture.sceneAId, 'shot-that-does-not-exist', { title: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('Updating a shot that belongs to a different project is refused', async () => {
    const a = await setupProject();
    const b = await setupProject();

    await expect(
      scripts.updateShot(b.projectSlug, b.sceneAId, a.shotInSceneAId, { title: 'hijacked' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const reloaded = await studio.shots.byId(a.shotInSceneAId);
    expect(reloaded?.title).toBe('Shot A');
  });

  it('Updating a shot with a scene id it does not belong to is refused', async () => {
    const fixture = await setupProject();

    await expect(
      scripts.updateShot(fixture.projectSlug, fixture.sceneBId, fixture.shotInSceneAId, { title: 'hijacked' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const reloaded = await studio.shots.byId(fixture.shotInSceneAId);
    expect(reloaded?.title).toBe('Shot A');
  });

  it('An invalid payload (unknown shot size) is rejected and the shot is left unchanged', async () => {
    const fixture = await setupProject();

    await expect(
      scripts.updateShot(fixture.projectSlug, fixture.sceneAId, fixture.shotInSceneAId, {
        shotSize: 'not-a-real-size',
      }),
    ).rejects.toThrow();

    const reloaded = await studio.shots.byId(fixture.shotInSceneAId);
    expect(reloaded?.title).toBe('Shot A');
  });

  it('The pipeline-managed `status` field never changes through updateShot, even if supplied', async () => {
    const fixture = await setupProject();
    const before = await studio.shots.byId(fixture.shotInSceneAId);
    expect(before?.status).toBe('planned');

    const updated = await scripts.updateShot(fixture.projectSlug, fixture.sceneAId, fixture.shotInSceneAId, {
      title: 'status attempt',
      status: 'approved',
    } as unknown as Record<string, unknown>);

    expect(updated.status).toBe('planned');
    const reloaded = await studio.shots.byId(fixture.shotInSceneAId);
    expect(reloaded?.status).toBe('planned');
  });

  it('Pinned character/location/prop references never change through updateShot, even if supplied', async () => {
    const fixture = await setupProject();

    const updated = await scripts.updateShot(fixture.projectSlug, fixture.sceneAId, fixture.shotInSceneAId, {
      title: 'reference attempt',
      characters: [
        { characterId: 'char_hijack', versionId: 'CHAR999_V1', screenPosition: 'center', facing: 'to-camera', action: '', emotion: '' },
      ],
      location: { locationId: 'loc_hijack', versionId: 'LOC999_V1' },
      props: [{ propId: 'prop_hijack', versionId: 'PROP999_V1', heldBy: null, state: 'intact' }],
    } as unknown as Record<string, unknown>);

    expect(updated.characters).toEqual([]);
    expect(updated.locationId).toBeNull();
    expect(updated.locationVersionId).toBeNull();
    expect(updated.props).toEqual([]);
  });

  it('Shot order (`shotNumber`) never changes through updateShot, even if the caller attempts it', async () => {
    const fixture = await setupProject();
    const before = await studio.shots.byId(fixture.shotInSceneAId);

    const updated = await scripts.updateShot(fixture.projectSlug, fixture.sceneAId, fixture.shotInSceneAId, {
      title: 'order attempt',
      shotNumber: 999,
    } as unknown as Record<string, unknown>);

    expect(updated.shotNumber).toBe(before?.shotNumber);
    expect(updated.sortIndex).toBe(before?.sortIndex);
  });
});

describe('PATCH /api/shots/[id] (TASK-SCENE-SHOT-EDIT-SERVICES-001 route hardening)', () => {
  function patchRequest(body: unknown, query = ''): Request {
    return new Request(`http://localhost/api/shots/fixture${query}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('delegates to scriptService.updateShot for a valid same-project/same-scene request', async () => {
    const fixture = await setupProject();

    const res = await patchShotRoute(patchRequest({ title: 'Route-updated title' }), {
      params: Promise.resolve({ id: fixture.shotInSceneAId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { shot: { title: string } } };
    expect(body.data.shot.title).toBe('Route-updated title');

    const reloaded = await studio.shots.byId(fixture.shotInSceneAId);
    expect(reloaded?.title).toBe('Route-updated title');
  });

  it('returns a stable 404 envelope for an unknown shot id, with no stack trace', async () => {
    const res = await patchShotRoute(patchRequest({ title: 'x' }), {
      params: Promise.resolve({ id: 'shot-that-does-not-exist' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(body)).not.toMatch(/at Object|node_modules|\.ts:\d+/);
  });

  it('returns a stable 400 envelope for an invalid payload', async () => {
    const fixture = await setupProject();

    const res = await patchShotRoute(patchRequest({ shotSize: 'not-a-real-size' }), {
      params: Promise.resolve({ id: fixture.shotInSceneAId }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('never leaks another project into a 404 response for a mismatched ownership assertion', async () => {
    const a = await setupProject();
    const b = await setupProject();

    const res = await patchShotRoute(patchRequest({ title: 'hijacked' }, `?project=${b.projectSlug}&scene=${b.sceneAId}`), {
      params: Promise.resolve({ id: a.shotInSceneAId }),
    });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain(a.projectId);

    const reloaded = await studio.shots.byId(a.shotInSceneAId);
    expect(reloaded?.title).toBe('Shot A');
  });

  it('a request-supplied `status` never survives to the persisted row', async () => {
    const fixture = await setupProject();

    const res = await patchShotRoute(patchRequest({ title: 'still safe', status: 'approved' }), {
      params: Promise.resolve({ id: fixture.shotInSceneAId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { shot: { status: string } } };
    expect(body.data.shot.status).toBe('planned');

    const reloaded = await studio.shots.byId(fixture.shotInSceneAId);
    expect(reloaded?.status).toBe('planned');
  });
});
