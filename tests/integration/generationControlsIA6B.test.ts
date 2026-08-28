import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

const env = useTempStudio('generation-controls-ia6b');
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createPromptService } = await import('@/application/services/promptService');
const { createGenerationControlService } = await import('@/application/services/generationControlService');

runMigrations();
const studio = getStudio();
const controls = createGenerationControlService(studio);

afterAll(() => env.cleanup());

async function createProject(title: string, costLimitUsd = 25) {
  return createProjectService(studio).create({ title, costLimitUsd });
}

async function enqueueRaw(input: {
  projectId: string;
  shotId?: string | null;
  promptId?: string | null;
  promptVersion?: number | null;
  idempotencyKey: string;
  estimatedCostUsd?: number;
}) {
  return studio.generations.enqueue(
    {
      projectId: input.projectId,
      shotId: input.shotId ?? null,
      promptId: input.promptId ?? null,
      promptVersion: input.promptVersion ?? null,
      kind: 'music',
      provider: 'mock',
      model: 'mock-music-v1',
      prompt: 'exact stored retry prompt',
      negativePrompt: 'blur',
      params: { count: 1, cfg: 6.5 },
      referenceAssetIds: [],
      seed: 4242,
      status: 'pending',
      priority: 10,
      maxAttempts: 3,
      scheduledAt: studio.clock.nowIso(),
      estimatedCostUsd: input.estimatedCostUsd ?? 0,
      idempotencyKey: input.idempotencyKey,
    },
    25,
  );
}

describe('Shot Inspector IA6B generation controls', () => {
  it('Manually retry a failed generation without erasing its audit trail', async () => {
    const project = await createProject('IA6B retry provenance');
    const scripts = createScriptService(studio);
    await scripts.saveScript(project.slug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
    await scripts.parseIntoScenes(project.slug);
    const built = await scripts.buildShots(project.slug);
    const shot = built.shots[0]!;
    const prompt = await createPromptService(studio).buildForShot(shot.id, 'image');
    await studio.shots.update(shot.id, { status: 'approved' });

    const source = await enqueueRaw({
      projectId: project.id,
      shotId: shot.id,
      promptId: prompt.prompt.id,
      promptVersion: prompt.version.version,
      idempotencyKey: 'ia6b-source',
    });
    await studio.generations.fail(source.id, { errorCode: 'TEST_FAIL', errorMessage: 'provider failed', retry: false });

    const retried = await controls.retryFailed(source.id);
    const duplicate = await controls.retryFailed(source.id);
    const original = await studio.generations.byId(source.id);

    expect(original?.status).toBe('failed');
    expect(retried.id).not.toBe(source.id);
    expect(duplicate.id).toBe(retried.id);
    expect(retried).toMatchObject({
      status: 'pending',
      projectId: source.projectId,
      shotId: source.shotId,
      promptId: source.promptId,
      promptVersion: source.promptVersion,
      provider: source.provider,
      model: source.model,
      prompt: source.prompt,
      negativePrompt: source.negativePrompt,
      params: source.params,
      referenceAssetIds: source.referenceAssetIds,
      seed: source.seed,
      estimatedCostUsd: source.estimatedCostUsd,
    });
    expect((await studio.shots.byId(shot.id))?.status).toBe('approved');

    const activity = await studio.activity.recent(project.id, 100);
    expect(activity).toContainEqual(
      expect.objectContaining({ action: 'generation.manual-retry', targetId: retried.id }),
    );
  });

  it('two simultaneous retries for the same failed generation resolve to one record, not a duplicate or a raw error', async () => {
    // Regression test for TASK-DEBT-IA6B-RETRY-RACE-001: retryFailed's
    // byIdempotencyKey check and its later enqueue() call are separated by an await
    // gap, so two genuinely concurrent calls (Promise.all, not sequential awaits like
    // the first test above) can both pass the check before either commits. Before the
    // fix, the race loser hit the idempotencyKey UNIQUE constraint as a raw error
    // instead of reusing the winner's record.
    const project = await createProject('IA6B retry race');
    const source = await enqueueRaw({ projectId: project.id, idempotencyKey: 'ia6b-race-source' });
    await studio.generations.fail(source.id, { errorCode: 'TEST_FAIL', errorMessage: 'provider failed', retry: false });

    const [first, second] = await Promise.all([controls.retryFailed(source.id), controls.retryFailed(source.id)]);

    expect(first.id).toBe(second.id);
    expect(first.id).not.toBe(source.id);
    expect(first.status).toBe('pending');

    const retryKey = `manual-retry:${source.id}:${source.attempts}`;
    const persisted = await studio.generations.byIdempotencyKey(retryKey);
    expect(persisted?.id).toBe(first.id);

    const activity = await studio.activity.recent(project.id, 100);
    const retryLogs = activity.filter(
      (entry) => entry.action === 'generation.manual-retry' && entry.targetId === first.id,
    );
    expect(retryLogs.length).toBe(1);
  });

  it('reuses the existing atomic enqueue budget gate when a failed job is retried', async () => {
    const project = await createProject('IA6B retry budget', 1);
    const source = await studio.generations.enqueue(
      {
        projectId: project.id,
        shotId: null,
        promptId: null,
        promptVersion: null,
        kind: 'music',
        provider: 'mock',
        model: 'mock-music-v1',
        prompt: 'budget retry source',
        negativePrompt: '',
        params: { count: 1 },
        referenceAssetIds: [],
        seed: 1,
        status: 'pending',
        priority: 10,
        maxAttempts: 3,
        scheduledAt: studio.clock.nowIso(),
        estimatedCostUsd: 0.75,
        idempotencyKey: 'ia6b-budget-source',
      },
      1,
    );
    await studio.generations.fail(source.id, { errorCode: 'TEST_FAIL', errorMessage: 'failed', retry: false });

    await studio.generations.enqueue(
      {
        projectId: project.id,
        shotId: null,
        promptId: null,
        promptVersion: null,
        kind: 'music',
        provider: 'mock',
        model: 'mock-music-v1',
        prompt: 'other reserved work',
        negativePrompt: '',
        params: { count: 1 },
        referenceAssetIds: [],
        seed: 2,
        status: 'pending',
        priority: 10,
        maxAttempts: 3,
        scheduledAt: studio.clock.nowIso(),
        estimatedCostUsd: 0.5,
        idempotencyKey: 'ia6b-budget-other',
      },
      1,
    );

    await expect(controls.retryFailed(source.id)).rejects.toMatchObject({ code: 'COST_LIMIT_EXCEEDED' });
    expect((await studio.generations.byId(source.id))?.status).toBe('failed');
  });

  it('Cancel only a queued generation from the Shot Inspector', async () => {
    const project = await createProject('IA6B cancel pending');
    const pending = await enqueueRaw({ projectId: project.id, idempotencyKey: 'ia6b-cancel-pending' });
    const cancelled = await controls.cancelPending(pending.id);
    expect(cancelled.status).toBe('cancelled');

    await expect(controls.cancelPending(pending.id)).rejects.toMatchObject({ code: 'JOB_NOT_CANCELLABLE' });

    const processing = await enqueueRaw({ projectId: project.id, idempotencyKey: 'ia6b-cancel-processing' });
    await studio.generations.markProcessing(processing.id, 'ia6b-test-worker');
    await expect(controls.cancelPending(processing.id)).rejects.toMatchObject({ code: 'JOB_NOT_CANCELLABLE' });
    await expect(studio.generations.cancel(processing.id)).rejects.toMatchObject({ code: 'JOB_NOT_CANCELLABLE' });
    expect((await studio.generations.byId(processing.id))?.status).toBe('processing');
  });

  it('rejects manual retry for non-failed jobs', async () => {
    const project = await createProject('IA6B retry state guard');
    const pending = await enqueueRaw({ projectId: project.id, idempotencyKey: 'ia6b-retry-state' });
    await expect(controls.retryFailed(pending.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
