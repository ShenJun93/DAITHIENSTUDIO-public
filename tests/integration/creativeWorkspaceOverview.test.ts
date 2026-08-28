import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('creative-workspace-overview');
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createCreativeWorkspaceService } = await import('@/application/services/creativeWorkspaceService');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const workspace = createCreativeWorkspaceService(studio);

beforeAll(() => runMigrations());
afterAll(() => env.cleanup());

describe('creative workspace persisted projection', () => {
  it('Read the workspace from persisted project records without writing production data', async () => {
    const project = await projects.create({ title: 'Workspace Read Model', format: 'motion-comic', platform: 'youtube', aspectRatio: '16:9', durationTargetSeconds: 60 });
    const before = await projects.get(project.slug);
    const result = await workspace.overview(project.slug);
    const after = await projects.get(project.slug);

    expect(result.project.format).toBe('motion-comic');
    expect(result.project.productionType).toBeNull();
    expect(result.productionType).toBeNull();
    expect(result.counts).toMatchObject({ scenes: 0, shots: 0, approvedAssets: 0 });
    expect(result.hasProductionData).toBeTypeOf('boolean');
    expect(result.hasProductionData).toBe(false);
    expect(result.warnings.map((warning) => warning.key)).toEqual(expect.arrayContaining(['script-empty', 'scenes', 'shots']));
    expect(after).toEqual(before);
  });

  it('Expose explicit production type independently from project format', async () => {
    const project = await projects.create({
      title: 'Workspace Explicit Identity',
      format: 'short-film',
      productionType: 'motion-comic',
      platform: 'youtube',
      aspectRatio: '16:9',
      durationTargetSeconds: 60,
    });

    const result = await workspace.overview(project.slug);
    expect(result.project.format).toBe('short-film');
    expect(result.project.productionType).toBe('motion-comic');
    expect(result.productionType).toBe('motion-comic');
  });

  it('Derive journey and warning summaries from the selected episode', async () => {
    const project = await projects.create({ title: 'Workspace Journey', aspectRatio: '16:9', durationTargetSeconds: 120 });
    await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(project.slug);
    await scripts.buildShots(project.slug);

    const result = await workspace.overview(project.slug);
    expect(result.counts.scenes).toBeGreaterThan(0);
    expect(result.counts.shots).toBeGreaterThan(0);
    expect(result.journey.find((item) => item.key === 'script')?.state).toBe('complete');
    expect(result.journey.find((item) => item.key === 'shots')?.detail).toBe(`${result.counts.shots} shots`);
    expect(result.warnings.some((warning) => warning.key === 'shot-media')).toBe(true);
  });
});
