/**
 * Multi-episode domain and persistence (TASK-015A), against a real SQLite file.
 * Verifies episode lifecycle, code allocation (EP01, EP02), and cross-episode isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('episodes');

// Imported after the environment is pointed at the temp database.
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createEpisodeService } = await import('@/application/services/episodeService');

const studio = getStudio();
const projects = createProjectService(studio);
const episodesService = createEpisodeService(studio);

let projectSlug = '';
let projectId = '';

beforeAll(async () => {
  await runMigrations();

  const project = await projects.create({
    title: 'Series Pilot',
    description: 'Testing multi-episode',
    genre: 'Drama',
    format: 'short-film',
    platform: 'youtube',
    language: 'vi-VN',
    durationTargetSeconds: 300,
    aspectRatio: '16:9',
    secondaryAspectRatios: [],
    frameRate: 24,
    resolution: '1920x1080',
    costLimitUsd: 10,
    creativeBrief: {},
  });
  projectSlug = project.slug;
  projectId = project.id;
});

afterAll(async () => {
  await env.cleanup();
});

describe('Episode Lifecycle', () => {
  it('creates the first episode via project creation', async () => {
    const list = await episodesService.listEpisodes(projectId);
    expect(list).toHaveLength(1);
    expect(list[0]?.code).toBe('EP01');
    expect(list[0]?.number).toBe(1);
  });

  it('allocates the next code sequentially for a new episode', async () => {
    const ep2 = await episodesService.createEpisode(projectId, {
      title: 'Episode 2',
      synopsis: 'The plot thickens',
    });

    expect(ep2.code).toBe('EP02');
    expect(ep2.number).toBe(2);
    expect(ep2.title).toBe('Episode 2');

    const list = await episodesService.listEpisodes(projectId);
    expect(list).toHaveLength(2);
  });

  it('updates episode details', async () => {
    const list = await episodesService.listEpisodes(projectId);
    const ep1 = list[0]!;

    const updated = await episodesService.updateEpisode(ep1.id, {
      title: 'Pilot - Updated',
      status: 'in-production',
    });

    expect(updated.title).toBe('Pilot - Updated');
    expect(updated.status).toBe('in-production');
  });

  it('deletes an episode softly', async () => {
    const list = await episodesService.listEpisodes(projectId);
    expect(list).toHaveLength(2);

    await episodesService.deleteEpisode(list[1]!.id);

    const afterDelete = await episodesService.listEpisodes(projectId);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]?.code).toBe('EP01');
  });

  it('keeps at least one episode in every project', async () => {
    const [onlyEpisode] = await episodesService.listEpisodes(projectId);
    await expect(episodesService.deleteEpisode(onlyEpisode!.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('Cross-episode isolation', () => {
  it('prevents scenes from one episode leaking into another', async () => {
    // Create EP03
    const ep3 = await episodesService.createEpisode(projectId, {
      title: 'Episode 3',
      synopsis: '',
    });

    const ep1 = (await episodesService.listEpisodes(projectId)).find(e => e.code === 'EP01')!;

    // Create a scene in EP01
    await studio.scenes.create(projectId, {
      episodeId: ep1.id,
      code: 'EP01_SC01',
      number: 1,
      title: 'Scene in EP01',
      locationId: null,
      timeOfDay: 'day',
      summary: '',
      action: '',
      dialogue: [],
      emotion: '',
      visualGoal: '',
      audioGoal: '',
      durationSeconds: 10,
      characters: [],
      status: 'draft',
    });

    // Create a scene in EP03
    await studio.scenes.create(projectId, {
      episodeId: ep3.id,
      code: 'EP03_SC01',
      number: 1,
      title: 'Scene in EP03',
      locationId: null,
      timeOfDay: 'night',
      summary: '',
      action: '',
      dialogue: [],
      emotion: '',
      visualGoal: '',
      audioGoal: '',
      durationSeconds: 10,
      characters: [],
      status: 'draft',
    });

    // List EP01 scenes
    const ep1Scenes = await studio.scenes.listByEpisode(projectId, ep1.id);
    expect(ep1Scenes).toHaveLength(1);
    expect(ep1Scenes[0]?.title).toBe('Scene in EP01');

    // List EP03 scenes
    const ep3Scenes = await studio.scenes.listByEpisode(projectId, ep3.id);
    expect(ep3Scenes).toHaveLength(1);
    expect(ep3Scenes[0]?.title).toBe('Scene in EP03');
  });
});
