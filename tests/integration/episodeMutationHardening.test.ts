import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const env = useTempStudio('episodeMutationHardening');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { getStudio } = await import('@/infrastructure/container');
const { createProjectService } = await import('@/application/services/projectService');
const { createEpisodeService } = await import('@/application/services/episodeService');
const { createEpisodeAction, updateEpisodeAction, deleteEpisodeAction } = await import('@/app/actions');

const studio = getStudio();
const projects = createProjectService(studio);
const episodes = createEpisodeService(studio);
let counter = 0;

async function makeProject(label: string) {
  counter += 1;
  const project = await projects.create({
    title: `${label} ${counter}`,
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 60,
  });
  const [episode] = await episodes.listEpisodes(project.id);
  return { project, episode: episode! };
}

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  await env.cleanup();
});

describe('Episode Server Action mutation hardening', () => {
  it('rejects invalid create input with fieldErrors and does not create an episode', async () => {
    const { project } = await makeProject('Create validation');
    const before = await episodes.listEpisodes(project.id);
    const form = new FormData();
    form.set('title', '');

    const result = await createEpisodeAction(project.slug, form);

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.fieldErrors?.title).toBeTruthy();
    expect(await episodes.listEpisodes(project.id)).toHaveLength(before.length);
  });

  it('rejects invalid update status with fieldErrors and leaves the episode unchanged', async () => {
    const { project, episode } = await makeProject('Update validation');
    const form = new FormData();
    form.set('title', 'Changed title');
    form.set('synopsis', 'Changed synopsis');
    form.set('status', 'not-a-real-status');

    const result = await updateEpisodeAction(project.slug, episode.id, form);
    const reloaded = await studio.episodes.findById(episode.id);

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.fieldErrors?.status).toBeTruthy();
    expect(reloaded?.title).toBe(episode.title);
    expect(reloaded?.synopsis).toBe(episode.synopsis);
    expect(reloaded?.status).toBe(episode.status);
  });

  it('rejects cross-project update with stable NOT_FOUND and leaves the target unchanged', async () => {
    const source = await makeProject('Source project');
    const target = await makeProject('Target project');
    const form = new FormData();
    form.set('title', 'Cross-project overwrite');
    form.set('synopsis', 'must not persist');
    form.set('status', 'completed');

    const result = await updateEpisodeAction(source.project.slug, target.episode.id, form);
    const reloaded = await studio.episodes.findById(target.episode.id);

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(reloaded?.title).toBe(target.episode.title);
    expect(reloaded?.synopsis).toBe(target.episode.synopsis);
    expect(reloaded?.status).toBe(target.episode.status);
  });

  it('rejects cross-project delete with stable NOT_FOUND and leaves the target present', async () => {
    const source = await makeProject('Delete source');
    const target = await makeProject('Delete target');
    const extra = await episodes.createEpisode(target.project.id, { title: 'Target EP02', synopsis: '' });

    const result = await deleteEpisodeAction(source.project.slug, extra.id);

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await studio.episodes.findById(extra.id)).not.toBeNull();
  });

  it('preserves valid same-project create, update and delete behavior', async () => {
    const { project } = await makeProject('Valid behavior');
    const createForm = new FormData();
    createForm.set('title', 'Second episode');
    createForm.set('synopsis', 'valid');

    const created = await createEpisodeAction(project.slug, createForm);
    expect(created.ok).toBe(true);

    const second = (await episodes.listEpisodes(project.id)).find((episode) => episode.code === 'EP02')!;
    const updateForm = new FormData();
    updateForm.set('title', 'Second episode revised');
    updateForm.set('synopsis', 'still valid');
    updateForm.set('status', 'in-production');

    const updated = await updateEpisodeAction(project.slug, second.id, updateForm);
    expect(updated.ok).toBe(true);
    expect((await studio.episodes.findById(second.id))?.title).toBe('Second episode revised');

    const deleted = await deleteEpisodeAction(project.slug, second.id);
    expect(deleted.ok).toBe(true);
    expect(await studio.episodes.findById(second.id)).toBeNull();
  });
});
