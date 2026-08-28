/**
 * TASK-UI-CORE-EDITORS-001 Episode UI migration regression coverage plus
 * TASK-EPISODE-MUTATION-HARDENING-001's server-side validation contract.
 * The accepted Episode UI remains unchanged; only the Server Action boundary
 * is hardened.
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

const env = useTempStudio('coreEditorFormsEpisode');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { getStudio } = await import('@/infrastructure/container');
const { createProjectService } = await import('@/application/services/projectService');
const { createEpisodeService } = await import('@/application/services/episodeService');
const { createEpisodeAction, updateEpisodeAction, deleteEpisodeAction } = await import('@/app/actions');
const { CreateEpisodeForm } = await import('@/components/CreateEpisodeForm');
const { EpisodeList } = await import('@/components/EpisodeList');

const studio = getStudio();
const projects = createProjectService(studio);
const episodesService = createEpisodeService(studio);

let fixtureCounter = 0;

async function setupProject() {
  fixtureCounter += 1;
  const project = await projects.create({
    title: `Episode Migration Fixture ${fixtureCounter}`,
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 60,
  });
  const [ep1] = await episodesService.listEpisodes(project.id);
  return { projectSlug: project.slug, projectId: project.id, episodeId: ep1!.id, episodeCode: ep1!.code };
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('createEpisodeAction (Episode UI migration)', () => {
  it('creates an episode and persists it', async () => {
    const fixture = await setupProject();
    const fd = new FormData();
    fd.set('title', 'A brand new episode');
    const result = await createEpisodeAction(fixture.projectSlug, fd);

    expect(result.ok).toBe(true);
    expect(result.message).toBe('Created episode EP02');

    const list = await episodesService.listEpisodes(fixture.projectId);
    expect(list.map((e) => e.title)).toContain('A brand new episode');
  });

  it('returns a stable NOT_FOUND result for a project slug that does not exist, never a raw exception', async () => {
    const fd = new FormData();
    fd.set('title', 'Orphan episode');
    const result = await createEpisodeAction('project-slug-that-does-not-exist', fd);

    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
    expect(result.message).not.toContain('at ');
    expect(result.message).not.toContain('.ts:');
  });

  it('rejects an empty title through the server-side episode schema and does not persist another episode', async () => {
    const fixture = await setupProject();
    const before = await episodesService.listEpisodes(fixture.projectId);
    const fd = new FormData();
    fd.set('title', '');
    const result = await createEpisodeAction(fixture.projectSlug, fd);

    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_FAILED');
    expect(result.fieldErrors?.title).toBeTruthy();
    expect(await episodesService.listEpisodes(fixture.projectId)).toHaveLength(before.length);
  });
});

describe('updateEpisodeAction (Episode UI migration)', () => {
  it('updates title, synopsis and status, and persists them', async () => {
    const fixture = await setupProject();
    const fd = new FormData();
    fd.set('title', 'Updated title');
    fd.set('synopsis', 'Updated synopsis');
    fd.set('status', 'in-production');
    const result = await updateEpisodeAction(fixture.projectSlug, fixture.episodeId, fd);

    expect(result.ok).toBe(true);
    expect(result.message).toBe(`Updated episode ${fixture.episodeCode}`);

    const [reloaded] = await episodesService.listEpisodes(fixture.projectId);
    expect(reloaded?.title).toBe('Updated title');
    expect(reloaded?.synopsis).toBe('Updated synopsis');
    expect(reloaded?.status).toBe('in-production');
  });

  it('returns a stable NOT_FOUND result for an episode id that does not exist, never a raw exception', async () => {
    const fixture = await setupProject();
    const fd = new FormData();
    fd.set('title', 'Does not matter');
    const result = await updateEpisodeAction(fixture.projectSlug, 'episode-that-does-not-exist', fd);

    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
    expect(result.message).not.toContain('at ');
  });
});

describe('deleteEpisodeAction (Episode UI migration)', () => {
  it('refuses to delete the last remaining episode in a project (CONFLICT)', async () => {
    const fixture = await setupProject();
    const result = await deleteEpisodeAction(fixture.projectSlug, fixture.episodeId);

    expect(result.ok).toBe(false);
    expect(result.code).toBe('CONFLICT');

    const list = await episodesService.listEpisodes(fixture.projectId);
    expect(list).toHaveLength(1);
  });

  it('deletes an episode when more than one exists', async () => {
    const fixture = await setupProject();
    const ep2 = await episodesService.createEpisode(fixture.projectId, { title: 'EP02', synopsis: '' });

    const result = await deleteEpisodeAction(fixture.projectSlug, ep2.id);
    expect(result.ok).toBe(true);

    const list = await episodesService.listEpisodes(fixture.projectId);
    expect(list.map((e) => e.id)).not.toContain(ep2.id);
  });
});

describe('CreateEpisodeForm (component, shared primitives)', () => {
  it('renders the title field via the shared Field/FieldError primitives and a SaveBar labelled "Create episode", with no synopsis field (unchanged field scope)', () => {
    const markup = renderToStaticMarkup(React.createElement(CreateEpisodeForm, { slug: 'demo-project' }));

    expect(markup).toContain('New episode title');
    expect(markup).toContain('name="title"');
    expect(markup).not.toContain('name="synopsis"');
    expect(markup).toContain('Create episode');
    expect(markup).toContain('aria-label="Create episode"');
  });
});

describe('EpisodeList (component, shared primitives)', () => {
  const episodes = [
    { id: 'ep-a', code: 'EP01', title: 'Pilot', synopsis: 'The beginning', status: 'draft' },
    { id: 'ep-b', code: 'EP02', title: 'Episode two', synopsis: '', status: 'in-production' },
  ];

  it('renders every episode with its code/title, marks the active one, and exposes title/synopsis/status fields via the shared primitives', () => {
    const markup = renderToStaticMarkup(
      React.createElement(EpisodeList, { slug: 'demo-project', episodes, activeEpisodeId: 'ep-b' }),
    );

    expect(markup).toContain('EP01');
    expect(markup).toContain('Pilot');
    expect(markup).toContain('EP02');
    expect(markup).toContain('Episode two');
    expect(markup).toContain('Active');
    expect(markup).toContain('<fieldset');
    expect(markup).toContain('<legend');
    expect(markup).toContain('Details');
    expect(markup.match(/name="title"/g)?.length).toBe(2);
    expect(markup.match(/name="synopsis"/g)?.length).toBe(2);
    expect(markup.match(/name="status"/g)?.length).toBe(2);
    expect(markup).toContain('>In production<');
    expect(markup).toContain('Save episode');
  });

  it('shows a Delete episode control per row when more than one episode exists', () => {
    const markup = renderToStaticMarkup(
      React.createElement(EpisodeList, { slug: 'demo-project', episodes, activeEpisodeId: null }),
    );
    expect(markup.match(/Delete episode/g)?.length).toBe(2);
  });

  it('hides the Delete episode control when only one episode exists (guards the "keep at least one episode" rule)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(EpisodeList, { slug: 'demo-project', episodes: [episodes[0]!], activeEpisodeId: null }),
    );
    expect(markup).not.toContain('Delete episode');
  });
});
