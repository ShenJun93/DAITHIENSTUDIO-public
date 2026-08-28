import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('comfyui-generation');
process.env.AI_IMAGE_PROVIDER = 'comfyui';
process.env.COMFYUI_BASE_URL = 'http://127.0.0.1:8188';
process.env.COMFYUI_IMAGE_MODEL = 'test-sd15-checkpoint.safetensors';
process.env.COMFYUI_POLL_INTERVAL_MS = '1';

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createGenerationService } = await import('@/application/services/generationService');
const { createWorker } = await import('@/infrastructure/queue/worker');

const studio = getStudio();
const projects = createProjectService(studio);
const generations = createGenerationService(studio);
const fetchMock = vi.fn();
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeAll(() => {
  runMigrations();
  vi.stubGlobal('fetch', fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
  process.env.AI_IMAGE_PROVIDER = 'mock';
  delete process.env.COMFYUI_BASE_URL;
  delete process.env.COMFYUI_IMAGE_MODEL;
  delete process.env.COMFYUI_POLL_INTERVAL_MS;
  env.cleanup();
});

describe('ComfyUI generation integration', () => {
  it('stores a completed ComfyUI image with generation provenance and zero cost', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ prompt_id: 'integration-prompt', number: 1 }))
      .mockResolvedValueOnce(
        jsonResponse({
          'integration-prompt': {
            status: { completed: true, status_str: 'success' },
            outputs: { '9': { images: [{ filename: 'integration.png', subfolder: '', type: 'output' }] } },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }));

    const project = await projects.create({
      title: 'ComfyUI Integration',
      aspectRatio: '1:1',
      durationTargetSeconds: 30,
      productionType: 'motion-comic',
    });
    const request = {
      projectId: project.id,
      shotId: null,
      promptId: null,
      kind: 'image' as const,
      provider: 'comfyui',
      model: 'test-sd15-checkpoint.safetensors',
      prompt: 'a paper lantern on a stone table',
      negativePrompt: 'watermark',
      params: { steps: 4, cfg: 5 },
      referenceAssetIds: [],
      seed: 42,
      priority: 100,
    };
    const prepared = await generations.prepareImage(request);
    const queued = await generations.confirmImage({
      request,
      confirmationToken: prepared.confirmationToken,
    });

    await createWorker(studio, { workerId: 'comfyui-integration' }).runOne();

    const completed = await generations.byId(queued.generation.id);
    expect(completed.generation.status).toBe('completed');
    expect(completed.generation.actualCostUsd).toBe(0);
    expect(completed.generation.provider).toBe('comfyui');
    expect(completed.assets).toHaveLength(1);
    expect(completed.assets[0]).toMatchObject({
      generationId: queued.generation.id,
      mimeType: 'image/png',
      width: 512,
      height: 512,
    });
    expect(await studio.storage.get(completed.assets[0]!.storageKey)).toEqual(Buffer.from(png));
  });
});

