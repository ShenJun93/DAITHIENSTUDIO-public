import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('image-execution-confirmation-confirm');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createGenerationService } = await import('@/application/services/generationService');

const studio = getStudio();
const projects = createProjectService(studio);
const generations = createGenerationService(studio);

interface PreparedImageResult {
  confirmationToken: string;
}

interface ConfirmedImageResult {
  generation: {
    id: string;
    projectId: string;
    kind: string;
    provider: string;
    model: string;
    prompt: string;
    negativePrompt: string;
    seed: number | null;
    params: Record<string, unknown>;
    referenceAssetIds: string[];
    priority: number;
    status: string;
  };
  reused: boolean;
  warnings: string[];
}

function prepareImage(raw: unknown): Promise<PreparedImageResult> {
  return (
    generations as unknown as {
      prepareImage(input: unknown): Promise<PreparedImageResult>;
    }
  ).prepareImage(raw);
}

function confirmImage(raw: unknown): Promise<ConfirmedImageResult> {
  return (
    generations as unknown as {
      confirmImage(input: unknown): Promise<ConfirmedImageResult>;
    }
  ).confirmImage(raw);
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

describe('safe image execution confirm', () => {
  it('commits the exact prepared image candidate into one pending Generation without provider execution', async () => {
    const project = await projects.create({
      title: 'Confirmed image enqueue',
      productionType: 'motion-comic',
      costLimitUsd: 1,
    });
    const request = imageRequest(project.id);
    const prepared = await prepareImage(request);
    const imageProvider = studio.providers.image('mock');
    const generateImageSpy = vi.spyOn(imageProvider, 'generateImage');

    try {
      const confirmed = await confirmImage({
        request,
        confirmationToken: prepared.confirmationToken,
      });

      expect(confirmed.reused).toBe(false);
      expect(confirmed.generation).toMatchObject({
        projectId: project.id,
        kind: 'image',
        provider: 'mock',
        model: 'mock-image-v1',
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        seed: 42,
        params: { count: 1, guidance: 7 },
        referenceAssetIds: [],
        priority: 50,
        status: 'pending',
      });
      expect(await studio.generations.listByProject(project.id)).toHaveLength(1);
      expect(generateImageSpy).not.toHaveBeenCalled();
    } finally {
      generateImageSpy.mockRestore();
    }
  });

  it('rejects a changed request after prepare as CONFIRMATION_STALE and creates nothing', async () => {
    const project = await projects.create({
      title: 'Stale changed request',
      productionType: 'motion-comic',
    });
    const request = imageRequest(project.id);
    const prepared = await prepareImage(request);

    await expect(
      confirmImage({
        request: { ...request, seed: 43 },
        confirmationToken: prepared.confirmationToken,
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });

    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('rejects a tampered confirmation token and creates nothing', async () => {
    const project = await projects.create({
      title: 'Tampered confirm token',
      productionType: 'motion-comic',
    });
    const request = imageRequest(project.id);
    const prepared = await prepareImage(request);
    const last = prepared.confirmationToken.at(-1) ?? '';
    const tampered = `${prepared.confirmationToken.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;

    await expect(
      confirmImage({ request, confirmationToken: tampered }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });

    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('rejects Production Type drift after prepare as CONFIRMATION_STALE', async () => {
    const project = await projects.create({
      title: 'Production type drift confirm',
      productionType: 'motion-comic',
    });
    const request = imageRequest(project.id);
    const prepared = await prepareImage(request);
    await projects.update(project.id, { productionType: 'product-ad' });

    await expect(
      confirmImage({ request, confirmationToken: prepared.confirmationToken }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });

    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('fails closed when project status becomes archived after prepare', async () => {
    const project = await projects.create({
      title: 'Archived after prepare',
      productionType: 'motion-comic',
    });
    const request = imageRequest(project.id);
    const prepared = await prepareImage(request);
    await projects.update(project.id, { status: 'archived' });

    await expect(
      confirmImage({ request, confirmationToken: prepared.confirmationToken }),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      details: {
        capability: {
          key: 'generation.image.submit',
          reasonCode: 'PROJECT_ARCHIVED',
        },
      },
    });

    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('reuses the same pending Generation when the same confirmation is submitted twice', async () => {
    const project = await projects.create({
      title: 'Double confirm idempotency',
      productionType: 'motion-comic',
    });
    const request = imageRequest(project.id);
    const prepared = await prepareImage(request);

    const first = await confirmImage({ request, confirmationToken: prepared.confirmationToken });
    const second = await confirmImage({ request, confirmationToken: prepared.confirmationToken });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.generation.id).toBe(first.generation.id);
    expect(await studio.generations.listByProject(project.id)).toHaveLength(1);
  });
});
