import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('image-execution-confirmation');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createGenerationService } = await import('@/application/services/generationService');
const { createImageExecutionConfirmationTokenService } = await import(
  '@/application/services/imageExecutionConfirmation'
);

const studio = getStudio();
const projects = createProjectService(studio);
const generations = createGenerationService(studio);

interface PreparedImageResult {
  capability: 'generation.image.submit';
  state: 'READY_FOR_CONFIRMATION';
  preview: {
    projectId: string;
    productionType: string;
    shotId: string | null;
    promptId: string | null;
    promptVersion: number | null;
    provider: string;
    model: string;
    prompt: string;
    negativePrompt: string;
    estimatedCostUsd: number;
    seed: number | null;
    params: Record<string, unknown>;
    referenceAssetIds: string[];
    priority: number;
    warnings: string[];
  };
  confirmationToken: string;
  expiresAt: string;
}

function prepareImage(raw: unknown): Promise<PreparedImageResult> {
  return (
    generations as unknown as {
      prepareImage(input: unknown): Promise<PreparedImageResult>;
    }
  ).prepareImage(raw);
}

function imageRequest(projectId: string) {
  return {
    projectId,
    shotId: null,
    promptId: null,
    kind: 'image' as const,
    provider: 'mock',
    model: 'mock-image-v1',
    prompt: 'A paper lantern on a stone table, cinematic still.',
    negativePrompt: 'watermark',
    params: { count: 1, guidance: 7 },
    referenceAssetIds: [],
    seed: 42,
    priority: 50,
  };
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('safe image execution confirmation', () => {
  it('requires explicit confirmation before direct application image enqueue and mutates nothing', async () => {
    const project = await projects.create({
      title: 'Image confirmation gate',
      productionType: 'motion-comic',
      costLimitUsd: 1,
    });

    const generationsBefore = await studio.generations.listByProject(project.id);
    const encumberedBefore = await studio.generations.encumberedUsd(project.id);
    const activityBefore = await studio.activity.recent(project.id, 100);

    await expect(generations.enqueue(imageRequest(project.id))).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
    });

    expect(await studio.generations.listByProject(project.id)).toEqual(generationsBefore);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(encumberedBefore);
    expect(await studio.activity.recent(project.id, 100)).toEqual(activityBefore);
  });

  it('preserves the existing non-image enqueue contract', async () => {
    const project = await projects.create({
      title: 'Non-image generation regression',
      productionType: 'motion-comic',
    });

    const result = await generations.enqueue({
      projectId: project.id,
      shotId: null,
      promptId: null,
      kind: 'music',
      provider: 'mock',
      model: 'mock-music-v1',
      prompt: 'A short warm orchestral cue.',
      params: { durationSeconds: 2 },
      referenceAssetIds: [],
      priority: 100,
    });

    expect(result.reused).toBe(false);
    expect(result.generation).toMatchObject({
      projectId: project.id,
      kind: 'music',
      provider: 'mock',
      model: 'mock-music-v1',
      status: 'pending',
    });
  });

  it('prepares the exact resolved image candidate without any write, reservation, activity, or provider execution', async () => {
    const project = await projects.create({
      title: 'Read-only image prepare',
      productionType: 'motion-comic',
      costLimitUsd: 1,
    });
    const request = imageRequest(project.id);
    const generationsBefore = await studio.generations.listByProject(project.id);
    const encumberedBefore = await studio.generations.encumberedUsd(project.id);
    const activityBefore = await studio.activity.recent(project.id, 100);
    const imageProvider = studio.providers.image('mock');
    const generateImageSpy = vi.spyOn(imageProvider, 'generateImage');

    try {
      const prepared = await prepareImage(request);

      expect(prepared).toMatchObject({
        capability: 'generation.image.submit',
        state: 'READY_FOR_CONFIRMATION',
        preview: {
          projectId: project.id,
          productionType: 'motion-comic',
          shotId: null,
          promptId: null,
          promptVersion: null,
          provider: 'mock',
          model: 'mock-image-v1',
          prompt: request.prompt,
          negativePrompt: request.negativePrompt,
          estimatedCostUsd: 0,
          seed: 42,
          params: { count: 1, guidance: 7 },
          referenceAssetIds: [],
          priority: 50,
          warnings: [],
        },
        confirmationToken: expect.any(String),
        expiresAt: expect.any(String),
      });
      expect(prepared.confirmationToken.length).toBeGreaterThan(0);
      expect(Date.parse(prepared.expiresAt)).toBeGreaterThan(Date.now());
      expect(await studio.generations.listByProject(project.id)).toEqual(generationsBefore);
      expect(await studio.generations.encumberedUsd(project.id)).toBe(encumberedBefore);
      expect(await studio.activity.recent(project.id, 100)).toEqual(activityBefore);
      expect(generateImageSpy).not.toHaveBeenCalled();
    } finally {
      generateImageSpy.mockRestore();
    }
  });

  it('Confirm creates only a pending Generation and performs zero provider execution', async () => {
    const project = await projects.create({
      title: 'Confirm pending only',
      productionType: 'motion-comic',
      costLimitUsd: 1,
    });
    const request = imageRequest(project.id);
    const imageProvider = studio.providers.image('mock');
    const generateImageSpy = vi.spyOn(imageProvider, 'generateImage');

    try {
      const prepared = await prepareImage(request);
      const confirmed = await generations.confirmImage({
        request,
        confirmationToken: prepared.confirmationToken,
      });

      expect(confirmed.reused).toBe(false);
      expect(confirmed.generation).toMatchObject({
        projectId: project.id,
        kind: 'image',
        provider: 'mock',
        model: 'mock-image-v1',
        status: 'pending',
      });
      expect(await studio.generations.listByProject(project.id)).toHaveLength(1);
      expect(generateImageSpy).not.toHaveBeenCalled();
    } finally {
      generateImageSpy.mockRestore();
    }
  });

  it('rejects an expired Confirm before any enqueue, reservation, activity, or provider execution', async () => {
    const project = await projects.create({
      title: 'Expired image confirmation',
      productionType: 'motion-comic',
      costLimitUsd: 1,
    });
    const request = imageRequest(project.id);
    const generationsBefore = await studio.generations.listByProject(project.id);
    const encumberedBefore = await studio.generations.encumberedUsd(project.id);
    const activityBefore = await studio.activity.recent(project.id, 100);
    const imageProvider = studio.providers.image('mock');
    const generateImageSpy = vi.spyOn(imageProvider, 'generateImage');
    const expiredIssuer = createImageExecutionConfirmationTokenService({
      apiKey: studio.config.apiKey,
      nowMs: () => Date.now() - 5 * 60_000 - 1,
    });
    const expired = expiredIssuer.issue('a'.repeat(64));

    try {
      await expect(
        generations.confirmImage({ request, confirmationToken: expired.token }),
      ).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });

      expect(await studio.generations.listByProject(project.id)).toEqual(generationsBefore);
      expect(await studio.generations.encumberedUsd(project.id)).toBe(encumberedBefore);
      expect(await studio.activity.recent(project.id, 100)).toEqual(activityBefore);
      expect(generateImageSpy).not.toHaveBeenCalled();
    } finally {
      generateImageSpy.mockRestore();
    }
  });

  it('blocks image prepare when Production Type has not been selected', async () => {
    const project = await projects.create({
      title: 'Prepare without production type',
      productionType: null,
    });

    await expect(prepareImage(imageRequest(project.id))).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      details: {
        capability: {
          key: 'generation.image.submit',
          state: 'BLOCKED',
          reasonCode: 'PRODUCTION_TYPE_REQUIRED',
        },
      },
    });
    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('blocks image prepare for an archived project', async () => {
    const project = await projects.create({
      title: 'Archived image prepare',
      productionType: 'motion-comic',
    });
    await projects.update(project.id, { status: 'archived' });

    await expect(prepareImage(imageRequest(project.id))).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      details: {
        capability: {
          key: 'generation.image.submit',
          state: 'BLOCKED',
          reasonCode: 'PROJECT_ARCHIVED',
        },
      },
    });
    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('blocks image prepare when no registered provider can generate images', async () => {
    const project = await projects.create({
      title: 'No image provider capability',
      productionType: 'motion-comic',
    });
    const descriptorsSpy = vi.spyOn(studio.providers, 'descriptors').mockReturnValue([]);

    try {
      await expect(prepareImage(imageRequest(project.id))).rejects.toMatchObject({
        code: 'UNSUPPORTED_CAPABILITY',
        details: {
          capability: {
            key: 'generation.image.submit',
            state: 'BLOCKED',
            reasonCode: 'NO_CAPABLE_PROVIDER',
          },
        },
      });
      expect(await studio.generations.listByProject(project.id)).toEqual([]);
    } finally {
      descriptorsSpy.mockRestore();
    }
  });
});
