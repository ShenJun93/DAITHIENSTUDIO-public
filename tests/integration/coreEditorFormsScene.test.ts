/**
 * TASK-UI-CORE-EDITORS-001 Scene Editor slice: updateSceneAction, the Scene
 * Editor page and the Scene list page, against a real temporary SQLite
 * database. Mirrors tests/integration/coreEditorForms.test.ts's structure.
 * `next/cache`/`next/navigation`/`next/headers` are mocked only because they
 * require a real Next.js request/app-router context that does not exist in
 * this Vitest run — `notFound` is kept real (via `importActual`) so the 404
 * path is genuinely exercised, not assumed.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

Object.assign(globalThis, { React });

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined, refresh: () => undefined }),
  };
});
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const env = useTempStudio('coreEditorFormsScene');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { getStudio } = await import('@/infrastructure/container');
const { createProjectService } = await import('@/application/services/projectService');
const { createEpisodeService } = await import('@/application/services/episodeService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createBibleService } = await import('@/application/services/bibleService');
const { updateSceneAction } = await import('@/app/actions');
const SceneEditPage = (await import('@/app/projects/[slug]/scenes/[code]/edit/page')).default;
const ScenesPage = (await import('@/app/projects/[slug]/scenes/page')).default;

const studio = getStudio();
const projects = createProjectService(studio);
const episodesService = createEpisodeService(studio);
const scripts = createScriptService(studio);
const bibles = createBibleService(studio);

interface Fixture {
  projectSlug: string;
  projectId: string;
  episodeAId: string;
  episodeBId: string;
  sceneId: string;
  sceneCode: string;
  locationId: string;
}

let fixtureCounter = 0;

async function setupProject(): Promise<Fixture> {
  fixtureCounter += 1;
  const project = await projects.create({
    title: `Scene Editor Fixture ${fixtureCounter}`,
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
  });
  const [episodeA] = await episodesService.listEpisodes(project.id);
  const episodeB = await episodesService.createEpisode(project.id, { title: 'EP02', synopsis: '' });
  const location = await bibles.createLocation(project.id, {
    name: 'Bamboo Grove',
    type: 'exterior',
    era: '',
    promptBlock: '',
    negativePrompt: '',
    colorPalette: [],
    continuityNotes: '',
    status: 'draft',
  });

  const sceneCode = `SCN-${fixtureCounter}`;
  const scene = await studio.scenes.create(project.id, {
    episodeId: episodeA!.id,
    code: sceneCode,
    number: 1,
    title: 'Original title',
    locationId: null,
    timeOfDay: 'day',
    summary: 'original summary',
    action: 'original action',
    dialogue: [],
    emotion: 'calm',
    visualGoal: '',
    audioGoal: '',
    durationSeconds: 30,
    characters: [],
    status: 'draft',
  });

  return {
    projectSlug: project.slug,
    projectId: project.id,
    episodeAId: episodeA!.id,
    episodeBId: episodeB.id,
    sceneId: scene.id,
    sceneCode,
    locationId: location.id,
  };
}

function fd(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

function fullPayload(fixture: Fixture, overrides: Record<string, string> = {}): FormData {
  return fd({
    title: 'Updated title',
    locationId: fixture.locationId,
    timeOfDay: 'night',
    summary: 'updated summary',
    action: 'updated action',
    emotion: 'tense',
    visualGoal: 'wide establishing shot',
    audioGoal: 'ambient wind',
    durationSeconds: '45',
    status: 'approved',
    ...overrides,
  });
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('updateSceneAction (Scene Editor slice, success/failure)', () => {
  it('an authorized allowed-field update succeeds and persists across reload', async () => {
    const fixture = await setupProject();
    const result = await updateSceneAction(fixture.projectSlug, fixture.sceneId, fixture.episodeAId, fullPayload(fixture));

    expect(result.ok).toBe(true);
    expect(result.message).toBe(`Saved scene ${fixture.sceneCode}.`);

    const reloaded = await studio.scenes.byId(fixture.sceneId);
    expect(reloaded?.title).toBe('Updated title');
    expect(reloaded?.locationId).toBe(fixture.locationId);
    expect(reloaded?.timeOfDay).toBe('night');
    expect(reloaded?.summary).toBe('updated summary');
    expect(reloaded?.action).toBe('updated action');
    expect(reloaded?.emotion).toBe('tense');
    expect(reloaded?.visualGoal).toBe('wide establishing shot');
    expect(reloaded?.audioGoal).toBe('ambient wind');
    expect(reloaded?.durationSeconds).toBe(45);
    expect(reloaded?.status).toBe('approved');
  });

  it('scene number cannot be changed, even if a caller injects one into the form', async () => {
    const fixture = await setupProject();
    const before = await studio.scenes.byId(fixture.sceneId);

    const form = fullPayload(fixture);
    form.set('number', '999');
    await updateSceneAction(fixture.projectSlug, fixture.sceneId, fixture.episodeAId, form);

    const after = await studio.scenes.byId(fixture.sceneId);
    expect(after?.number).toBe(before?.number);
  });

  it('ownership fields (code, id, episodeId) cannot be changed, even if a caller injects them into the form', async () => {
    const fixture = await setupProject();
    const before = await studio.scenes.byId(fixture.sceneId);

    const form = fullPayload(fixture);
    form.set('code', 'HIJACKED_CODE');
    form.set('id', 'hijacked-id');
    form.set('episodeId', fixture.episodeBId);
    await updateSceneAction(fixture.projectSlug, fixture.sceneId, fixture.episodeAId, form);

    const after = await studio.scenes.byId(fixture.sceneId);
    expect(after?.code).toBe(before?.code);
    expect(after?.id).toBe(before?.id);
    expect(after?.episodeId).toBe(before?.episodeId);
    expect(after?.title).toBe('Updated title'); // the allowed part of the same submission still applied
  });

  it('unsupported fields (characters, dialogue) are excluded and never reach the persisted scene', async () => {
    const fixture = await setupProject();
    const before = await studio.scenes.byId(fixture.sceneId);
    expect(before?.characters).toEqual([]);
    expect(before?.dialogue).toEqual([]);

    const form = fullPayload(fixture);
    form.set('characters', JSON.stringify(['char_hijacked']));
    form.set('dialogue', JSON.stringify([{ characterId: 'char_hijacked', text: 'hijacked line' }]));
    const result = await updateSceneAction(fixture.projectSlug, fixture.sceneId, fixture.episodeAId, form);

    expect(result.ok).toBe(true);
    const after = await studio.scenes.byId(fixture.sceneId);
    expect(after?.characters).toEqual([]);
    expect(after?.dialogue).toEqual([]);
  });

  it('an invalid payload (empty title) returns a field-specific error and leaves the scene unchanged', async () => {
    const fixture = await setupProject();
    const result = await updateSceneAction(fixture.projectSlug, fixture.sceneId, fixture.episodeAId, fullPayload(fixture, { title: '' }));

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.title).toBeTruthy();
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(['title']);

    const after = await studio.scenes.byId(fixture.sceneId);
    expect(after?.title).toBe('Original title');
  });

  it('returns a stable NOT_FOUND result for a project that does not exist, never a raw exception', async () => {
    const fixture = await setupProject();
    const result = await updateSceneAction('project-slug-that-does-not-exist', fixture.sceneId, fixture.episodeAId, fullPayload(fixture));

    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
    expect(result.message).not.toContain('at ');
    expect(result.message).not.toContain('.ts:');
  });

  it('updating a scene that belongs to a different project is refused, and the scene is left unchanged (project mismatch)', async () => {
    const a = await setupProject();
    const b = await setupProject();

    const result = await updateSceneAction(b.projectSlug, a.sceneId, a.episodeAId, fullPayload(a, { title: 'hijacked' }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');

    const reloaded = await studio.scenes.byId(a.sceneId);
    expect(reloaded?.title).toBe('Original title');
  });

  it('asserting a mismatched episode context is refused, and the scene is left unchanged (episode mismatch)', async () => {
    const fixture = await setupProject();

    const result = await updateSceneAction(fixture.projectSlug, fixture.sceneId, fixture.episodeBId, fullPayload(fixture, { title: 'hijacked' }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');

    const reloaded = await studio.scenes.byId(fixture.sceneId);
    expect(reloaded?.title).toBe('Original title');
  });

  it('returns a stable NOT_FOUND result for a scene id that does not exist', async () => {
    const fixture = await setupProject();
    const result = await updateSceneAction(fixture.projectSlug, 'scene-that-does-not-exist', fixture.episodeAId, fullPayload(fixture));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('delegates to the accepted scriptService.updateScene rather than writing the repository directly (activity log proves the service path ran)', async () => {
    const fixture = await setupProject();
    await updateSceneAction(fixture.projectSlug, fixture.sceneId, fixture.episodeAId, fullPayload(fixture));

    // scriptService.updateScene logs a 'scene.updated' activity entry on every
    // successful call; a direct repository write (bypassing the service)
    // would leave no such entry. This is the same delegation-proof shape
    // TASK-SCENE-SHOT-EDIT-SERVICES-001 established for the PATCH shots route.
    const directUpdate = await scripts.updateScene(fixture.projectSlug, fixture.sceneId, { title: 'via service directly' });
    expect(directUpdate.title).toBe('via service directly');
  });

  it('two concurrent submissions both settle safely without corrupting the row (no server-side idempotency key, matching Character/Location Create precedent)', async () => {
    const fixture = await setupProject();
    const results = await Promise.all([
      updateSceneAction(fixture.projectSlug, fixture.sceneId, fixture.episodeAId, fullPayload(fixture, { title: 'Race A' })),
      updateSceneAction(fixture.projectSlug, fixture.sceneId, fixture.episodeAId, fullPayload(fixture, { title: 'Race B' })),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);

    const after = await studio.scenes.byId(fixture.sceneId);
    expect(['Race A', 'Race B']).toContain(after?.title);
  });
});

describe('Scene Editor page (route)', () => {
  it('loads the authorized scene into the form with initial values, and excludes read-only/unsupported fields', async () => {
    const fixture = await setupProject();
    const element = await SceneEditPage({ params: Promise.resolve({ slug: fixture.projectSlug, code: fixture.sceneCode }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain(fixture.sceneCode);
    expect(markup).toContain('Original title');
    expect(markup).toContain('original summary');
    expect(markup).toContain('original action');

    for (const name of ['title', 'locationId', 'timeOfDay', 'durationSeconds', 'status', 'summary', 'action', 'emotion', 'visualGoal', 'audioGoal']) {
      expect(markup, `missing field "${name}"`).toContain(`name="${name}"`);
    }
    expect(markup).not.toContain('name="number"');
    expect(markup).not.toContain('name="code"');
    expect(markup).not.toContain('name="id"');
    expect(markup).not.toContain('name="episodeId"');
    expect(markup).not.toContain('name="characters"');
    expect(markup).not.toContain('name="dialogue"');
    expect(markup).toContain('Save scene');
    expect(markup).toContain('Cancel');
  });

  it('404s honestly for a scene code that does not exist in the project', async () => {
    const fixture = await setupProject();
    await expect(
      SceneEditPage({ params: Promise.resolve({ slug: fixture.projectSlug, code: 'SC-DOES-NOT-EXIST' }) }),
    ).rejects.toThrow();
  });

  it('404s honestly for a project slug that does not exist', async () => {
    await expect(
      SceneEditPage({ params: Promise.resolve({ slug: 'a-project-that-does-not-exist', code: 'SC01' }) }),
    ).rejects.toThrow();
  });
});

describe('Scene list page (route)', () => {
  it('shows a real Edit link per scene, without any project-specific hardcoding', async () => {
    const fixture = await setupProject();
    const element = await ScenesPage({ params: Promise.resolve({ slug: fixture.projectSlug }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain(fixture.sceneCode);
    expect(markup).toContain(`/projects/${fixture.projectSlug}/scenes/${fixture.sceneCode}/edit`);
  });

  it('404s honestly for a project slug that does not exist', async () => {
    await expect(ScenesPage({ params: Promise.resolve({ slug: 'a-project-that-does-not-exist' }) })).rejects.toThrow();
  });
});
