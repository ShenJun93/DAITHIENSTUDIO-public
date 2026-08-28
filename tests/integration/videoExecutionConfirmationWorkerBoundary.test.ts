import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';
import { TINY_VIDEO_MP4_BASE64 } from '../fixtures/media/tinyVideoMp4Base64';

const env = useTempStudio('video-execution-confirmation-worker-boundary');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createGenerationService } = await import('@/application/services/generationService');
const { createWorker } = await import('@/infrastructure/queue/worker');

const studio = getStudio();
const projects = createProjectService(studio);
const generations = createGenerationService(studio);

const videoBytes = Buffer.from(TINY_VIDEO_MP4_BASE64, 'base64');

function videoRequest(projectId: string) {
  return {
    projectId,
    shotId: null,
    promptId: null,
    kind: 'video' as const,
    provider: 'mock',
    model: 'mock-video-v1',
    prompt: 'A locked character crosses the frame with controlled camera motion.',
    negativePrompt: 'identity drift, watermark',
    params: { durationSeconds: 5 },
    referenceAssetIds: [],
    seed: 84,
    priority: 100,
  };
}

interface PreparedVideoResult {
  confirmationToken: string;
}

interface ConfirmedVideoResult {
  generation: { id: string; status: string; provider: string };
  reused: boolean;
}

function prepareVideo(raw: unknown): Promise<PreparedVideoResult> {
  return (
    generations as unknown as {
      prepareVideo(input: unknown): Promise<PreparedVideoResult>;
    }
  ).prepareVideo(raw);
}

function confirmVideo(raw: unknown): Promise<ConfirmedVideoResult> {
  return (
    generations as unknown as {
      confirmVideo(input: unknown): Promise<ConfirmedVideoResult>;
    }
  ).confirmVideo(raw);
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('safe video execution confirmation worker boundary', () => {
  it('proves Prepare mutates nothing, Confirm queues pending-only, no implicit worker runs, and only the explicit worker boundary executes the provider', async () => {
    const project = await projects.create({
      title: 'Worker boundary',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const request = videoRequest(project.id);
    const videoProvider = studio.providers.video('mock');
    const generateVideoSpy = vi.spyOn(videoProvider, 'generateVideo');

    try {
      const generationsBefore = await studio.generations.listByProject(project.id);
      const encumberedBefore = await studio.generations.encumberedUsd(project.id);

      const prepared = await prepareVideo(request);

      expect(prepared.confirmationToken.length).toBeGreaterThan(0);
      expect(await studio.generations.listByProject(project.id)).toEqual(generationsBefore);
      expect(await studio.generations.encumberedUsd(project.id)).toBe(encumberedBefore);
      expect(generateVideoSpy).not.toHaveBeenCalled();

      const confirmed = await confirmVideo({
        request,
        confirmationToken: prepared.confirmationToken,
      });

      expect(confirmed.reused).toBe(false);
      expect(confirmed.generation.status).toBe('pending');
      expect(confirmed.generation.provider).toBe('mock');
      expect(await studio.generations.listByProject(project.id)).toHaveLength(1);
      expect(await studio.assets.listByGeneration(confirmed.generation.id)).toEqual([]);
      expect(generateVideoSpy).not.toHaveBeenCalled();

      const reread = await studio.generations.byId(confirmed.generation.id);
      expect(reread?.status).toBe('pending');
      expect(await studio.assets.listByGeneration(confirmed.generation.id)).toEqual([]);
      expect(generateVideoSpy).not.toHaveBeenCalled();

      generateVideoSpy.mockResolvedValue({
        artifacts: [
          {
            filename: 'worker-boundary.mp4',
            mimeType: 'video/mp4',
            data: videoBytes,
            width: 32,
            height: 24,
            durationSeconds: 1,
          },
        ],
        raw: { provider: 'mock', note: 'worker-boundary video' },
        actualCostUsd: 0,
        modelUsed: 'mock-video-v1',
      });

      const worker = createWorker(studio, { workerId: 'video-worker-boundary' });
      const didWork = await worker.runOne();

      expect(didWork).toBe(true);
      expect(generateVideoSpy).toHaveBeenCalledTimes(1);

      const completed = await studio.generations.byId(confirmed.generation.id);
      expect(completed?.status).toBe('completed');
      expect(completed?.actualCostUsd).toBe(0);
      expect(completed?.provider).toBe('mock');
      expect(completed?.model).toBe('mock-video-v1');

      const produced = await studio.assets.listByGeneration(confirmed.generation.id);
      expect(produced).toHaveLength(1);
      expect(produced[0]?.mimeType.startsWith('video/')).toBe(true);
      expect(produced[0]?.generationId).toBe(confirmed.generation.id);
      expect(produced[0]?.projectId).toBe(project.id);
      expect(produced[0]?.kind).toBe('video');
      expect(produced[0]?.tags).toEqual(expect.arrayContaining(['video', 'mock', 'mock-video-v1']));
      expect(produced[0]?.metadata).toMatchObject({
        provider: 'mock',
        model: 'mock-video-v1',
        seed: 84,
        params: { durationSeconds: 5 },
      });
    } finally {
      generateVideoSpy.mockRestore();
    }
  });
});