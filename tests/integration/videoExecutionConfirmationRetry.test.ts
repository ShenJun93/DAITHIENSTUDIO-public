import { afterAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('video-execution-confirmation-retry');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createGenerationControlService } = await import('@/application/services/generationControlService');

runMigrations();
const studio = getStudio();
const projects = createProjectService(studio);
const controls = createGenerationControlService(studio);

afterAll(() => env.cleanup());

describe('safe video execution retry boundary', () => {
  it('requires fresh explicit confirmation instead of directly retrying a failed video', async () => {
    const project = await projects.create({
      title: 'Video retry confirmation gate',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });

    const source = await studio.generations.enqueue(
      {
        projectId: project.id,
        shotId: null,
        promptId: null,
        promptVersion: null,
        kind: 'video',
        provider: 'mock',
        model: 'mock-video-v1',
        prompt: 'A failed video that must not be retried without confirmation.',
        negativePrompt: '',
        params: { durationSeconds: 5 },
        referenceAssetIds: [],
        seed: 84,
        status: 'pending',
        priority: 100,
        maxAttempts: 3,
        scheduledAt: studio.clock.nowIso(),
        estimatedCostUsd: 0,
        idempotencyKey: 'video-retry-confirmation-source',
      },
      1,
    );
    await studio.generations.fail(source.id, {
      errorCode: 'TEST_FAIL',
      errorMessage: 'provider failed',
      retry: false,
    });

    const generationsBefore = await studio.generations.listByProject(project.id);
    const encumberedBefore = await studio.generations.encumberedUsd(project.id);
    const activityBefore = await studio.activity.recent(project.id, 100);

    await expect(controls.retryFailed(source.id)).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
    });

    expect(await studio.generations.listByProject(project.id)).toEqual(generationsBefore);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(encumberedBefore);
    expect(await studio.activity.recent(project.id, 100)).toEqual(activityBefore);
  });
});
