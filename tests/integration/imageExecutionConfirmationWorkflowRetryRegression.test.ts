import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('image-execution-confirmation-workflow-retry-regression');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createWorkflowService } = await import('@/application/services/workflowService');
const { createGenerationControlService } = await import('@/application/services/generationControlService');

runMigrations();
const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const workflow = createWorkflowService(studio);
const controls = createGenerationControlService(studio);

afterAll(() => env.cleanup());

describe('safe image execution bypass regressions', () => {
  it('workflow auto-enqueue cannot create an image Generation without confirmation', async () => {
    const project = await projects.create({
      title: 'Workflow image confirmation boundary',
      productionType: 'youtube-short',
      costLimitUsd: 1,
    });

    await scripts.saveScript(project.slug, {
      title: 'Main',
      scriptType: 'motion-comic',
      raw: DEMO_SCRIPT,
    });

    const run = await workflow.run({
      projectId: project.id,
      workflowKey: 'ugc',
      autoEnqueueGenerations: true,
    });

    const imageGenerations = (await studio.generations.listByProject(project.id)).filter(
      (generation) => generation.kind === 'image',
    );
    const enqueueImage = run.steps.find((step) => step.key === 'enqueue-image');

    expect(imageGenerations).toEqual([]);
    expect(enqueueImage).toBeDefined();
    expect(enqueueImage?.status).toBe('completed');
    expect(enqueueImage?.detail).toMatch(/^0 queued, [1-9]\d* skipped$/);
  });

  it('preserves retry and idempotency behavior for failed non-image generations', async () => {
    const project = await projects.create({
      title: 'Non-image retry regression',
      productionType: 'motion-comic',
      costLimitUsd: 1,
    });

    const source = await studio.generations.enqueue(
      {
        projectId: project.id,
        shotId: null,
        promptId: null,
        promptVersion: null,
        kind: 'music',
        provider: 'mock',
        model: 'mock-music-v1',
        prompt: 'A short failed cue that may be retried without image confirmation.',
        negativePrompt: '',
        params: { durationSeconds: 2 },
        referenceAssetIds: [],
        seed: null,
        status: 'pending',
        priority: 100,
        maxAttempts: 3,
        scheduledAt: studio.clock.nowIso(),
        estimatedCostUsd: 0,
        idempotencyKey: 'non-image-retry-source',
      },
      1,
    );
    await studio.generations.fail(source.id, {
      errorCode: 'TEST_FAIL',
      errorMessage: 'provider failed',
      retry: false,
    });

    const first = await controls.retryFailed(source.id);
    const second = await controls.retryFailed(source.id);

    expect(first.id).not.toBe(source.id);
    expect(first.kind).toBe('music');
    expect(first.status).toBe('pending');
    expect(second.id).toBe(first.id);
  });
});
