import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('production-type-identity');
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');

const studio = getStudio();
const projects = createProjectService(studio);

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('production type identity', () => {
  it('persists null when no explicit production type is selected and never infers from Project.format', async () => {
    const project = await projects.create({
      title: 'No Production Type Alias',
      format: 'motion-comic',
    });

    const reloaded = await projects.get(project.slug);
    expect(reloaded.format).toBe('motion-comic');
    expect(reloaded.productionType).toBeNull();
  });

  it('persists an explicit production type independently from Project.format', async () => {
    const project = await projects.create({
      title: 'Explicit Silent Comedy',
      format: 'short-film',
      productionType: 'silent-comedy',
    });

    const reloaded = await projects.get(project.slug);
    expect(reloaded.format).toBe('short-film');
    expect(reloaded.productionType).toBe('silent-comedy');
  });

  it('can explicitly set and clear production type on update', async () => {
    const project = await projects.create({ title: 'Mutable Explicit Identity' });

    const selected = await projects.update(project.id, { productionType: 'youtube-short' });
    expect(selected.productionType).toBe('youtube-short');

    const cleared = await projects.update(project.id, { productionType: null });
    expect(cleared.productionType).toBeNull();
  });

  it('rejects unknown production type values at the project boundary', async () => {
    await expect(
      projects.create({
        title: 'Invalid Production Type',
        productionType: 'short-film',
      }),
    ).rejects.toThrow();
  });
});
