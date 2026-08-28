import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Studio } from '@/application/ports';
import { createNodeGraphService } from '@/application/services/nodeGraphService';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('node-graph');
const { buildStudio } = await import('@/infrastructure/container');
const { getDb } = await import('@/infrastructure/db/client');
const { runMigrations } = await import('@/infrastructure/db/migrate');

describe('Constrained node graph persistence', () => {
  let studio: Studio;

  beforeAll(() => {
    runMigrations();
    studio = buildStudio(getDb());
  });
  afterAll(() => env.cleanup());

  async function project(title: string) {
    const { workspaceId, ownerId } = await studio.workspaces.ensureDefault();
    return studio.projects.create({
      workspaceId, ownerId, slug: `workflow-${randomUUID()}`, title, description: '', genre: 'animation',
      format: 'short-film', targetAudience: 'all', durationTargetSeconds: 60, aspectRatio: '16:9',
      stylePresetKey: undefined, costLimitUsd: 10, platform: 'youtube', language: 'vi-VN',
      secondaryAspectRatios: [], frameRate: 24, resolution: '1920x1080', creativeBrief: {},
    });
  }

  const validGraph = {
    nodes: [
      { id: 'image', type: 'generate-image' as const, position: { x: 0, y: 0 }, data: { label: 'Generate image', operationType: 'generate-image' as const } },
      { id: 'approve', type: 'approve-asset' as const, position: { x: 200, y: 0 }, data: { label: 'Approve asset', operationType: 'approve-asset' as const } },
    ],
    edges: [{ id: 'image-approve', source: 'image', sourceHandle: null, target: 'approve', targetHandle: null }],
  };

  it('Save and reload a bounded node workflow', async () => {
    const owner = await project('Owner');
    const service = createNodeGraphService(studio);
    const created = await service.create(owner.id, 'Image approval');
    const saved = await service.save(owner.id, created.id, validGraph);
    const reloaded = await service.get(owner.id, created.id);

    expect(saved.version).toBe(2);
    expect(reloaded.graph).toEqual(validGraph);
    await expect(createNodeGraphService(buildStudio(getDb())).get(owner.id, created.id)).resolves.toMatchObject({ version: 2 });
  });

  it('enforces project isolation for graph reads and writes', async () => {
    const owner = await project('Owner');
    const outsider = await project('Outsider');
    const service = createNodeGraphService(studio);
    const graph = await service.create(owner.id, 'Private graph');

    await expect(service.get(outsider.id, graph.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.save(outsider.id, graph.id, validGraph)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await service.get(owner.id, graph.id)).graph.nodes).toHaveLength(0);
  });

  it('rejects operation nodes outside the approved inventory', async () => {
    const owner = await project('Owner');
    const service = createNodeGraphService(studio);
    const graph = await service.create(owner.id, 'Invalid node');
    await expect(service.save(owner.id, graph.id, {
      nodes: [{ id: 'shell', type: 'run-shell', position: { x: 0, y: 0 }, data: { label: 'Shell', operationType: 'run-shell' } }],
      edges: [],
    })).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('rejects edges whose endpoints are absent', async () => {
    const owner = await project('Owner');
    const service = createNodeGraphService(studio);
    const graph = await service.create(owner.id, 'Invalid edge');
    await expect(service.save(owner.id, graph.id, {
      nodes: validGraph.nodes.slice(0, 1),
      edges: [{ id: 'missing', source: 'image', sourceHandle: null, target: 'absent', targetHandle: null }],
    })).rejects.toMatchObject({ name: 'ZodError' });
  });
});
