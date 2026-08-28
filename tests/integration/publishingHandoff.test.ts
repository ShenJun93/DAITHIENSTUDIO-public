import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createMockN8nServer, MockServerControls } from '../helpers/mockN8nEndpoint';
import type { Studio } from '@/application/ports';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('pubHandoff');
const { buildStudio } = await import('@/infrastructure/container');
const { getDb } = await import('@/infrastructure/db/client');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createPublishService } = await import('@/application/services/publishService');
const { createDeliveryAdapter } = await import('@/infrastructure/delivery/adapter');

describe('publishing handoff integration with real delivery (Gate 8)', () => {
  let server: MockServerControls;
  let studio: Studio;

  beforeAll(async () => {
    runMigrations();
    // Start mock server
    server = createMockN8nServer(5678);
    await server.start();
    // Build a studio with a real delivery adapter, allowing localhost
    const delivery = createDeliveryAdapter({ allowedHosts: ['127.0.0.1', 'localhost'], timeoutMs: 1000 });
    studio = buildStudio(getDb(), { delivery });
  });

  beforeEach(() => {
    server.reset();
  });

  afterAll(async () => {
    await server.stop();
    env.cleanup();
  });

  async function fixture(overrideProjectSlug?: string) {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    const project = await studio.projects.create({
      workspaceId, ownerId, slug: overrideProjectSlug || `handoff-${randomUUID()}`, title: 'Publish Test', description: 'desc',
      genre: 'action', format: 'short-film', targetAudience: 'all', durationTargetSeconds: 60, aspectRatio: '16:9',
      stylePresetKey: undefined, costLimitUsd: 10, platform: 'youtube', language: 'vi-VN', secondaryAspectRatios: ['9:16'],
      frameRate: 24, resolution: '1920x1080', creativeBrief: {},
    });
    const exp = await studio.exports.record({
      projectId: project.id, kind: 'project-package', storageKey: 'exports/package.zip', frozenVersions: {}, summary: { shots: 2, episodeId: 'EP01' },
    });
    await studio.approvals.record(project.id, {
      targetType: 'export', targetId: exp.id, decision: 'approved', note: 'Approved for delivery.', decidedBy: ownerId,
    });
    return { project, exp };
  }

  /**
   * Two fully distinct, real projects with real, differently-valued exports — used to prove
   * actual project-to-project isolation instead of asserting against data that was never created.
   */
  async function twoProjectFixture() {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    const create = (slug: string, title: string) => studio.projects.create({
      workspaceId, ownerId, slug, title, description: `desc-${slug}`,
      genre: 'action', format: 'short-film', targetAudience: 'all', durationTargetSeconds: 60, aspectRatio: '16:9',
      stylePresetKey: undefined, costLimitUsd: 10, platform: 'youtube', language: 'vi-VN', secondaryAspectRatios: ['9:16'],
      frameRate: 24, resolution: '1920x1080', creativeBrief: {},
    });
    const projectA = await create(`iso-a-${randomUUID()}`, 'Isolation Project A');
    const projectB = await create(`iso-b-${randomUUID()}`, 'Isolation Project B');

    const expA = await studio.exports.record({
      projectId: projectA.id, kind: 'project-package', storageKey: `exports/${projectA.slug}-package.zip`, frozenVersions: {},
      summary: { shots: 3, episodeId: 'EP01', projectSlug: projectA.slug, projectTitle: projectA.title },
    });
    const expB = await studio.exports.record({
      projectId: projectB.id, kind: 'project-package', storageKey: `exports/${projectB.slug}-package.zip`, frozenVersions: {},
      summary: { shots: 7, episodeId: 'EP02', projectSlug: projectB.slug, projectTitle: projectB.title },
    });

    await studio.approvals.record(projectA.id, {
      targetType: 'export', targetId: expA.id, decision: 'approved', note: 'Approved for delivery.', decidedBy: ownerId,
    });
    await studio.approvals.record(projectB.id, {
      targetType: 'export', targetId: expB.id, decision: 'approved', note: 'Approved for delivery.', decidedBy: ownerId,
    });

    return { projectA, expA, projectB, expB };
  }

  test('A. Successful delivery', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    const endpoint = server.url('/success');

    const result = await service.publish({ projectId: project.id, exportId: exp.id, endpoint });
    
    expect(result.status).toBe('completed');
    expect(result.attemptCount).toBe(1);

    const requests = server.getRequests();
    expect(requests.length).toBe(1);
    expect(requests[0]!.path).toBe('/success');
    expect(requests[0]!.body.projectId).toBe(project.id);
    expect(requests[0]!.body.exportId).toBe(exp.id);

    // Verify audit log
    const logs = await studio.activity.recent(project.id, 100);
    const successLog = logs.find(l => l.action === 'publish.success');
    expect(successLog).toBeDefined();
    expect(successLog?.details).toHaveProperty('destinationHost', '127.0.0.1');
  });

  test('B. Failure handling', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    const endpoint = server.url('/fail');

    await expect(service.publish({ projectId: project.id, exportId: exp.id, endpoint }))
      .rejects.toThrow('Publishing destination is unavailable');

    const requests = server.getRequests();
    expect(requests.length).toBe(1);

    const publishes = await service.list(project.id);
    expect(publishes[0]!.status).toBe('failed');
    expect(publishes[0]!.attemptCount).toBe(1);

    const logs = await studio.activity.recent(project.id, 100);
    const failLog = logs.find(l => l.action === 'publish.failed');
    expect(failLog).toBeDefined();
  });

  test('C. Bounded retry', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    const endpoint = server.url('/retry-then-success');

    // Attempt 1 -> fails
    await expect(service.publish({ projectId: project.id, exportId: exp.id, endpoint })).rejects.toThrow();
    
    // Attempt 2 -> fails
    const publishes = await service.list(project.id);
    await expect(service.retry(publishes[0]!.id)).rejects.toThrow();
    
    // Attempt 3 -> succeeds
    const result = await service.retry(publishes[0]!.id);
    expect(result.status).toBe('completed');
    expect(result.attemptCount).toBe(3);

    const requests = server.getRequests();
    expect(requests.length).toBe(3);
  });

  test('D. Permanent failure', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    const endpoint = server.url('/always-fail');

    // Attempt 1
    await expect(service.publish({ projectId: project.id, exportId: exp.id, endpoint })).rejects.toThrow();
    let publishes = await service.list(project.id);
    
    // Attempt 2
    await expect(service.retry(publishes[0]!.id)).rejects.toThrow();
    
    // Attempt 3
    await expect(service.retry(publishes[0]!.id)).rejects.toThrow();
    
    // Attempt 4 -> blocked by bound
    await expect(service.retry(publishes[0]!.id)).rejects.toThrow('Publish retry limit reached');

    publishes = await service.list(project.id);
    expect(publishes[0]!.status).toBe('failed');
    expect(publishes[0]!.attemptCount).toBe(3);
  });

  test('E. Idempotency', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    const endpoint = server.url('/duplicate-check');

    const p1 = service.publish({ projectId: project.id, exportId: exp.id, endpoint });
    const p2 = service.publish({ projectId: project.id, exportId: exp.id, endpoint });
    
    const [r1, r2] = await Promise.all([p1, p2]);
    
    expect(r1.id).toBe(r2.id); // Deduplicated by service
    expect(['pending', 'running', 'completed']).toContain(r1.status);
    expect(['pending', 'running', 'completed']).toContain(r2.status);
    
    const finalRecord = await studio.publishes.byId(r1.id);
    expect(finalRecord).toBeDefined();
    expect(finalRecord!.status).toBe('completed');
    
    const requests = server.getRequests();
    // Studio handles duplicate checks directly, only issues 1 outbound
    expect(requests.length).toBe(1);
    expect(requests[0]!.path).toBe('/duplicate-check');
  });

  test('E2. Many concurrent requests', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    const endpoint = server.url('/duplicate-check');

    const promises = Array.from({ length: 10 }).map(() => 
      service.publish({ projectId: project.id, exportId: exp.id, endpoint })
    );
    
    const results = await Promise.all(promises);
    
    // All should return the exact same publish record ID
    const firstId = results[0]!.id;
    for (const r of results) {
      expect(r.id).toBe(firstId);
      expect(['pending', 'running', 'completed']).toContain(r.status);
    }
    
    // Wait for the actual execution to finish (the first one will resolve when it finishes delivery)
    const finalRecord2 = await studio.publishes.byId(firstId);
    expect(finalRecord2).toBeDefined();
    expect(finalRecord2!.status).toBe('completed');
    
    const requests = server.getRequests();
    // Only 1 outbound request total should be sent
    const endpointRequests = requests.filter(r => r.path === '/duplicate-check');
    expect(endpointRequests.length).toBe(1);
  });

  test('F. Cross-project payload isolation: publishing one project\'s export never carries another real project\'s data', async () => {
    const { projectA, expA, projectB, expB } = await twoProjectFixture();
    const service = createPublishService(studio);

    // A -> B must not leak.
    await service.publish({ projectId: projectA.id, exportId: expA.id, endpoint: server.url('/success') });
    const reqA = server.getRequests().at(-1)!;
    expect(reqA.body.projectId).toBe(projectA.id);
    expect(reqA.body.projectId).not.toBe(projectB.id);
    expect(reqA.body.exportId).toBe(expA.id);
    expect(reqA.body.exportId).not.toBe(expB.id);
    expect(reqA.body.downloadUrl).toContain(encodeURIComponent(expA.storageKey.split('/').pop()!));
    expect(reqA.body.downloadUrl).not.toContain(encodeURIComponent(expB.storageKey.split('/').pop()!));
    expect(reqA.body.metadata).toEqual(expA.summary);
    expect(reqA.body.metadata).not.toEqual(expB.summary);
    const metadataAJson = JSON.stringify(reqA.body.metadata);
    expect(metadataAJson).toContain('EP01');
    expect(metadataAJson).toContain(projectA.slug);
    expect(metadataAJson).not.toContain('EP02');
    expect(metadataAJson).not.toContain(projectB.slug);

    server.reset();

    // B -> A must not leak, in the reverse direction.
    await service.publish({ projectId: projectB.id, exportId: expB.id, endpoint: server.url('/success') });
    const reqB = server.getRequests().at(-1)!;
    expect(reqB.body.projectId).toBe(projectB.id);
    expect(reqB.body.projectId).not.toBe(projectA.id);
    expect(reqB.body.exportId).toBe(expB.id);
    expect(reqB.body.exportId).not.toBe(expA.id);
    expect(reqB.body.downloadUrl).toContain(encodeURIComponent(expB.storageKey.split('/').pop()!));
    expect(reqB.body.downloadUrl).not.toContain(encodeURIComponent(expA.storageKey.split('/').pop()!));
    expect(reqB.body.metadata).toEqual(expB.summary);
    expect(reqB.body.metadata).not.toEqual(expA.summary);
    const metadataBJson = JSON.stringify(reqB.body.metadata);
    expect(metadataBJson).toContain('EP02');
    expect(metadataBJson).toContain(projectB.slug);
    expect(metadataBJson).not.toContain('EP01');
    expect(metadataBJson).not.toContain(projectA.slug);
  });

  test('F2. Cross-project isolation: an export cannot be published under a different project\'s id', async () => {
    const { projectA, projectB, expB } = await twoProjectFixture();
    const service = createPublishService(studio);
    const endpoint = server.url('/success');

    // Project A asks to publish project B's real export id — must be rejected, not silently delivered.
    await expect(service.publish({ projectId: projectA.id, exportId: expB.id, endpoint }))
      .rejects.toThrow('Export does not belong to project.');

    const reqs = server.getRequests();
    expect(reqs.length).toBe(0);
  });

  test('G. Host allowlist', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    const endpoint = 'http://127.0.0.2:5678/success'; // Not in allowed list ('127.0.0.1', 'localhost')

    await expect(service.publish({ projectId: project.id, exportId: exp.id, endpoint }))
      .rejects.toThrow('Publishing endpoint host is not allowed.');

    const reqs = server.getRequests();
    expect(reqs.length).toBe(0);
  });

  test('H. Audit sanitization', async () => {
    const { project, exp } = await fixture();
    const service = createPublishService(studio);
    const endpoint = server.url('/success');

    await service.publish({ projectId: project.id, exportId: exp.id, endpoint });
    
    const logs = await studio.activity.recent(project.id, 100);
    const logStr = JSON.stringify(logs);
    
    // Ensure the full endpoint url with a fake secret isn't leaked
    const endpointWithSecret = server.url('/success?token=SUPERSECRET');
    const exp2 = await studio.exports.record({
      projectId: project.id, kind: 'project-package', storageKey: 'exports/package.zip', frozenVersions: {}, summary: { shots: 2 },
    });
    const { ownerId } = await studio.workspaces.ensureDefault();
    await studio.approvals.record(project.id, {
      targetType: 'export', targetId: exp2.id, decision: 'approved', note: 'Approved for delivery.', decidedBy: ownerId,
    });
    
    await service.publish({ projectId: project.id, exportId: exp2.id, endpoint: endpointWithSecret });
    const logs2 = await studio.activity.recent(project.id, 100);
    const logStr2 = JSON.stringify(logs2);
    
    expect(logStr2).not.toContain('SUPERSECRET');
  });
});
