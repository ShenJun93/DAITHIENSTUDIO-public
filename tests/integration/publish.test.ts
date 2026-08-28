import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/domain/errors';
import type { Studio } from '@/application/ports';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('publish');
const { buildStudio } = await import('@/infrastructure/container');
const { getDb } = await import('@/infrastructure/db/client');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createPublishService, MAX_PUBLISH_ATTEMPTS } = await import('@/application/services/publishService');

describe('Publish service integration', () => {
  let studio: Studio;
  const deliver = vi.fn<Studio['delivery']['deliver']>();

  beforeAll(() => {
    runMigrations();
    studio = buildStudio(getDb(), { delivery: { deliver } });
  });

  beforeEach(() => deliver.mockReset().mockResolvedValue(undefined));
  afterAll(() => env.cleanup());

  async function fixture(approve = true) {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    const project = await studio.projects.create({
      workspaceId, ownerId, slug: `publish-${randomUUID()}`, title: 'Publish Test', description: 'Publishing handoff',
      genre: 'action', format: 'short-film', targetAudience: 'all', durationTargetSeconds: 60, aspectRatio: '16:9',
      stylePresetKey: undefined, costLimitUsd: 10, platform: 'youtube', language: 'vi-VN', secondaryAspectRatios: ['9:16'],
      frameRate: 24, resolution: '1920x1080', creativeBrief: {},
    });
    const exp = await studio.exports.record({
      projectId: project.id, kind: 'project-package', storageKey: 'exports/package.zip', frozenVersions: {}, summary: { shots: 2 },
    });
    if (approve) {
      await studio.approvals.record(project.id, {
        targetType: 'export', targetId: exp.id, decision: 'approved', note: 'Approved for delivery.', decidedBy: ownerId,
      });
    }
    studio.storage.url = vi.fn().mockReturnValue('http://localhost:3000/api/exports/package');
    return { project, exp, ownerId };
  }

  it('Refuse to publish an export without operator approval', async () => {
    const { project, exp } = await fixture(false);
    const service = createPublishService(studio);
    await expect(
      service.publish({ projectId: project.id, exportId: exp.id, endpoint: 'https://delivery.example/webhook' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('Deliver one export idempotently through the publishing handoff', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    const input = { projectId: project.id, exportId: exp.id, endpoint: 'https://delivery.example/webhook' };
    const first = await service.publish(input);
    const duplicate = await service.publish(input);

    expect(first.status).toBe('completed');
    expect(first.attemptCount).toBe(1);
    expect(duplicate.id).toBe(first.id);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(input.endpoint, expect.objectContaining({ exportId: exp.id }), first.idempotencyKey);
  });

  it('retries a failed delivery with the same persisted idempotency key', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    deliver.mockRejectedValueOnce(new DomainError('PROVIDER_REJECTED', 'Publishing destination is unavailable.'));
    const input = { projectId: project.id, exportId: exp.id, endpoint: 'https://delivery.example/retry' };

    await expect(service.publish(input)).rejects.toThrow('unavailable');
    const failed = (await service.list(project.id))[0];
    expect(failed).toMatchObject({ status: 'failed', attemptCount: 1 });
    const completed = await service.retry(failed!.id);
    expect(completed).toMatchObject({ id: failed!.id, status: 'completed', attemptCount: 2, idempotencyKey: failed!.idempotencyKey });
  });

  it('persists and enforces the bounded retry limit', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    let failed = await studio.publishes.create({
      projectId: project.id, exportId: exp.id, endpoint: 'https://delivery.example/limit', idempotencyKey: 'delivery_limit',
    });
    for (let attempt = 0; attempt < MAX_PUBLISH_ATTEMPTS; attempt += 1) failed = await studio.publishes.incrementAttempt(failed.id);
    failed = await studio.publishes.updateStatus(failed.id, 'failed', 'Publishing destination is unavailable.');
    await expect(service.retry(failed.id)).rejects.toThrow('retry limit reached');
    expect((await service.byId(failed.id))?.attemptCount).toBe(MAX_PUBLISH_ATTEMPTS);
    expect(deliver).not.toHaveBeenCalled();
  });
});
