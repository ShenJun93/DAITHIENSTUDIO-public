/**
 * Cost reservation / escrow for generation budget.
 *
 * The estimate is reserved against the project ceiling atomically at enqueue
 * (same transaction as the INSERT), so concurrent enqueues can never both
 * commit past the ceiling. When a job completes, the reserved estimate is
 * reconciled against the actual cost (surplus released); when it fails or is
 * cancelled, the whole reservation is released. `encumberedUsd` is the budget
 * spoken for; `spentUsd` remains real money actually spent.
 *
 * Uses the real google provider descriptor only for its nonzero price table —
 * enqueue never makes a network call, and completion/failure are driven
 * directly through the repository so no paid provider is ever invoked.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('generation-cost-reservation');

// The google descriptor is only registered when an API key is present. A fake
// key makes its price table available for the ceiling math; no request is ever
// sent, so this stays fully offline.
process.env.GOOGLE_API_KEY = 'test-key';

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createGenerationService } = await import('@/application/services/generationService');

const studio = getStudio();
const projects = createProjectService(studio);
const generations = createGenerationService(studio);

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  delete process.env.GOOGLE_API_KEY;
  env.cleanup();
});

describe('generation cost reservation', () => {
  async function newProject(costLimitUsd: number) {
    return projects.create({
      title: `Cost Reservation ${Math.random().toString(36).slice(2, 8)}`,
      aspectRatio: '1:1',
      durationTargetSeconds: 30,
      costLimitUsd,
      productionType: 'motion-comic',
    });
  }

  function googleImageRequest(projectId: string, seed: number) {
    return {
      projectId,
      shotId: null,
      promptId: null,
      kind: 'image' as const,
      provider: 'google',
      model: 'imagen-3.0-generate-002',
      prompt: `cost reservation probe ${seed}`,
      negativePrompt: '',
      params: { count: 1 },
      referenceAssetIds: [],
      seed,
      priority: 100,
    };
  }

  async function googleImageJob(projectId: string, seed: number) {
    const request = googleImageRequest(projectId, seed);
    const prepared = await generations.prepareImage(request);
    return generations.confirmImage({
      request,
      confirmationToken: prepared.confirmationToken,
    });
  }

  it('Two concurrent enqueues cannot both reserve past the ceiling', async () => {
    // One google image costs $0.04; two would cost $0.08 > the $0.05 ceiling.
    const project = await newProject(0.05);

    const [first, second] = await Promise.allSettled([
      googleImageJob(project.id, 101),
      googleImageJob(project.id, 202),
    ]);

    expect(first.status === 'fulfilled' ? 'fulfilled' : 'rejected').not.toBe(
      second.status === 'fulfilled' ? 'fulfilled' : 'rejected',
    );

    const rejected = first.status === 'rejected' ? first : second;
    expect(rejected.status).toBe('rejected');
    if (rejected.status === 'rejected') {
      expect(rejected.reason).toMatchObject({ code: 'COST_LIMIT_EXCEEDED' });
    }

    const rows = await studio.generations.listByProject(project.id);
    expect(rows).toHaveLength(1);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(0.04);
    // Nothing completed yet, so nothing is really spent.
    expect(await studio.generations.spentUsd(project.id)).toBe(0);
  });

  it('Completing a job reconciles reserve against actual cost and releases the surplus', async () => {
    const project = await newProject(0.5);

    const first = await googleImageJob(project.id, 303);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(0.04);

    // The job actually cost $0.01, well under the $0.04 estimate.
    await studio.generations.complete(first.generation.id, { actualCostUsd: 0.01, raw: {} });

    expect(await studio.generations.encumberedUsd(project.id)).toBe(0.01);
    expect(await studio.generations.spentUsd(project.id)).toBe(0.01);

    // The released $0.03 is available again: a fresh job fits within the ceiling.
    const second = await googleImageJob(project.id, 404);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(0.05);
    expect(second.generation.status).toBe('pending');
  });

  it('Failing a job releases its full reservation', async () => {
    const project = await newProject(0.5);

    const first = await googleImageJob(project.id, 505);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(0.04);

    await studio.generations.fail(first.generation.id, {
      errorCode: 'PROVIDER_ERROR',
      errorMessage: 'fixture failure',
      retry: false,
    });

    expect(await studio.generations.encumberedUsd(project.id)).toBe(0);
    expect(await studio.generations.spentUsd(project.id)).toBe(0);

    // The whole reservation is back in the budget.
    const second = await googleImageJob(project.id, 606);
    expect(second.generation.status).toBe('pending');
    expect(await studio.generations.encumberedUsd(project.id)).toBe(0.04);
  });

  it('Cancelling a job releases its full reservation', async () => {
    const project = await newProject(0.5);

    const first = await googleImageJob(project.id, 707);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(0.04);

    await studio.generations.cancel(first.generation.id);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(0);

    const second = await googleImageJob(project.id, 808);
    expect(second.generation.status).toBe('pending');
    expect(await studio.generations.encumberedUsd(project.id)).toBe(0.04);
  });
});
