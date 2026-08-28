import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('video-execution-confirmation-confirm');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createGenerationService } = await import('@/application/services/generationService');
const { continuitySchema, promptBlocksSchema } = await import('@/domain/schemas');
const { createImageExecutionConfirmationTokenService } = await import(
  '@/application/services/imageExecutionConfirmation'
);
const { createVideoExecutionConfirmationTokenService } = await import(
  '@/application/services/videoExecutionConfirmation'
);

const studio = getStudio();
const projects = createProjectService(studio);
const generations = createGenerationService(studio);

interface PreparedVideoResult {
  confirmationToken: string;
}

interface ConfirmedVideoResult {
  generation: {
    id: string;
    projectId: string;
    kind: string;
    provider: string;
    model: string;
    prompt: string;
    negativePrompt: string;
    promptId: string | null;
    promptVersion: number | null;
    seed: number | null;
    params: Record<string, unknown>;
    referenceAssetIds: string[];
    priority: number;
    status: string;
  };
  reused: boolean;
  warnings: string[];
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

function videoRequest(projectId: string, shotId: string | null = null) {
  return {
    projectId,
    shotId,
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

async function createShotFixture(projectId: string) {
  const [episode] = await studio.episodes.listByProject(projectId);
  const scene = await studio.scenes.create(projectId, {
    code: 'SC01',
    number: 1,
    title: 'Scene One',
    episodeId: episode!.id,
    locationId: null,
    timeOfDay: 'day',
    summary: '',
    action: 'Test action',
    emotion: '',
    visualGoal: '',
    audioGoal: '',
    status: 'draft',
    characters: [],
    dialogue: [],
    durationSeconds: 10,
  });

  return studio.shots.create(projectId, {
    sceneId: scene.id,
    episodeId: episode!.id,
    code: 'SH001',
    shotNumber: 1,
    title: 'Shot',
    description: '',
    shotSize: 'wide',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'static', speed: 'medium' },
    lens: '50mm',
    durationSeconds: 5,
    characters: [],
    location: null,
    props: [],
    dialogue: '',
    emotion: 'neutral',
    lighting: 'day',
    visualEffects: [],
    soundEffects: [],
    continuity: continuitySchema.parse({}),
    aspectRatio: '16:9',
    importance: 'normal',
  });
}

async function createPromptFixture(projectId: string) {
  const compiled = 'A pinned video prompt with clean lint.';
  const { prompt } = await studio.prompts.createWithVersion({
    projectId,
    shotId: null,
    kind: 'video',
    name: 'Video prompt',
    blocks: promptBlocksSchema.parse({}),
    compiled,
    negative: '',
    lockRefs: { characters: [], style: null, location: null, props: [] },
    lint: {
      ok: true,
      score: 100,
      characterCount: compiled.length,
      issues: [],
    },
  });
  return prompt;
}

async function createPromptWithCompiled(projectId: string, compiled: string, name: string) {
  const { prompt } = await studio.prompts.createWithVersion({
    projectId,
    shotId: null,
    kind: 'video',
    name,
    blocks: promptBlocksSchema.parse({}),
    compiled,
    negative: 'identity drift, watermark',
    lockRefs: { characters: [], style: null, location: null, props: [] },
    lint: {
      ok: true,
      score: 100,
      characterCount: compiled.length,
      issues: [],
    },
  });
  return prompt;
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('safe video execution confirm', () => {
  it('commits the exact prepared video candidate into one pending Generation without provider execution', async () => {
    const project = await projects.create({
      title: 'Confirmed video enqueue',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const request = videoRequest(project.id);
    const prepared = await prepareVideo(request);
    const videoProvider = studio.providers.video('mock');
    const generateVideoSpy = vi.spyOn(videoProvider, 'generateVideo');

    try {
      const confirmed = await confirmVideo({
        request,
        confirmationToken: prepared.confirmationToken,
      });

      expect(confirmed.reused).toBe(false);
      expect(confirmed.generation).toMatchObject({
        projectId: project.id,
        kind: 'video',
        provider: 'mock',
        model: 'mock-video-v1',
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        seed: 84,
        params: { durationSeconds: 5 },
        referenceAssetIds: [],
        priority: 100,
        status: 'pending',
      });
      expect(await studio.generations.listByProject(project.id)).toHaveLength(1);
      expect(generateVideoSpy).not.toHaveBeenCalled();
    } finally {
      generateVideoSpy.mockRestore();
    }
  });

  it('reuses the same pending Generation when the same Prepare and Confirm are repeated', async () => {
    const project = await projects.create({
      title: 'Repeat confirm idempotency',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const request = videoRequest(project.id);

    const firstPrepared = await prepareVideo(request);
    const first = await confirmVideo({
      request,
      confirmationToken: firstPrepared.confirmationToken,
    });
    const secondPrepared = await prepareVideo(request);
    const second = await confirmVideo({
      request,
      confirmationToken: secondPrepared.confirmationToken,
    });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.generation.id).toBe(first.generation.id);
    expect(await studio.generations.listByProject(project.id)).toHaveLength(1);
  });

  it('does not reuse a video Generation when the reference identity differs', async () => {
    const project = await projects.create({
      title: 'Reference identity difference',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const requestA = { ...videoRequest(project.id), referenceAssetIds: ['frame-a', 'frame-b'] };
    const requestB = { ...videoRequest(project.id), referenceAssetIds: ['frame-c', 'frame-d'] };

    const preparedA = await prepareVideo(requestA);
    const confirmedA = await confirmVideo({
      request: requestA,
      confirmationToken: preparedA.confirmationToken,
    });
    const preparedB = await prepareVideo(requestB);
    const confirmedB = await confirmVideo({
      request: requestB,
      confirmationToken: preparedB.confirmationToken,
    });

    expect(confirmedA.reused).toBe(false);
    expect(confirmedB.reused).toBe(false);
    expect(confirmedB.generation.id).not.toBe(confirmedA.generation.id);
    expect(await studio.generations.listByProject(project.id)).toHaveLength(2);
  });

  it('treats reference order as significant for video idempotency identity', async () => {
    const project = await projects.create({
      title: 'Reference order significance',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const requestForward = { ...videoRequest(project.id), referenceAssetIds: ['frame-a', 'frame-b'] };
    const requestReverse = { ...videoRequest(project.id), referenceAssetIds: ['frame-b', 'frame-a'] };

    const preparedForward = await prepareVideo(requestForward);
    const confirmedForward = await confirmVideo({
      request: requestForward,
      confirmationToken: preparedForward.confirmationToken,
    });
    const preparedReverse = await prepareVideo(requestReverse);
    const confirmedReverse = await confirmVideo({
      request: requestReverse,
      confirmationToken: preparedReverse.confirmationToken,
    });

    expect(confirmedForward.reused).toBe(false);
    expect(confirmedReverse.reused).toBe(false);
    expect(confirmedReverse.generation.id).not.toBe(confirmedForward.generation.id);
    expect(await studio.generations.listByProject(project.id)).toHaveLength(2);
  });

  it('reuses one video Generation for an exact replay with the same ordered references', async () => {
    const project = await projects.create({
      title: 'Exact replay with ordered references',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const request = { ...videoRequest(project.id), referenceAssetIds: ['frame-a', 'frame-b'] };

    const firstPrepared = await prepareVideo(request);
    const first = await confirmVideo({
      request,
      confirmationToken: firstPrepared.confirmationToken,
    });
    const secondPrepared = await prepareVideo(request);
    const second = await confirmVideo({
      request,
      confirmationToken: secondPrepared.confirmationToken,
    });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.generation.id).toBe(first.generation.id);
    expect(await studio.generations.listByProject(project.id)).toHaveLength(1);
  });

  it('does not reuse a video Generation across different prompt lineage with identical compiled text', async () => {
    const project = await projects.create({
      title: 'Prompt lineage identity',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const compiled = 'A lineage-sensitive compiled video prompt with identical text.';
    const promptA = await createPromptWithCompiled(project.id, compiled, 'Prompt A');
    const promptB = await createPromptWithCompiled(project.id, compiled, 'Prompt B');

    const requestA = { ...videoRequest(project.id), promptId: promptA.id };
    const preparedA = await prepareVideo(requestA);
    const confirmedA = await confirmVideo({
      request: requestA,
      confirmationToken: preparedA.confirmationToken,
    });

    const requestB = { ...videoRequest(project.id), promptId: promptB.id };
    const preparedB = await prepareVideo(requestB);
    const confirmedB = await confirmVideo({
      request: requestB,
      confirmationToken: preparedB.confirmationToken,
    });

    expect(confirmedA.reused).toBe(false);
    expect(confirmedB.reused).toBe(false);
    expect(confirmedB.generation.id).not.toBe(confirmedA.generation.id);
    expect(confirmedB.generation.promptId).toBe(promptB.id);
    expect(confirmedA.generation.promptId).toBe(promptA.id);
    expect(await studio.generations.listByProject(project.id)).toHaveLength(2);
  });

  it('does not reuse a video Generation across different priority', async () => {
    const project = await projects.create({
      title: 'Priority identity',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const requestLow = { ...videoRequest(project.id), priority: 100 };
    const requestHigh = { ...videoRequest(project.id), priority: 200 };

    const preparedLow = await prepareVideo(requestLow);
    const confirmedLow = await confirmVideo({
      request: requestLow,
      confirmationToken: preparedLow.confirmationToken,
    });
    const preparedHigh = await prepareVideo(requestHigh);
    const confirmedHigh = await confirmVideo({
      request: requestHigh,
      confirmationToken: preparedHigh.confirmationToken,
    });

    expect(confirmedLow.reused).toBe(false);
    expect(confirmedHigh.reused).toBe(false);
    expect(confirmedHigh.generation.id).not.toBe(confirmedLow.generation.id);
    const rows = await studio.generations.listByProject(project.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.priority).sort((a, b) => a - b)).toEqual([100, 200]);
  });

  it('does not reuse a video Generation when the reviewed shot duration changes', async () => {
    const project = await projects.create({
      title: 'Duration cost basis identity',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const shot = await createShotFixture(project.id);
    const request = videoRequest(project.id, shot.id);

    const preparedFirst = await prepareVideo(request);
    const confirmedFirst = await confirmVideo({
      request,
      confirmationToken: preparedFirst.confirmationToken,
    });
    await studio.shots.update(shot.id, { durationSeconds: 8 });
    const preparedSecond = await prepareVideo(request);
    const confirmedSecond = await confirmVideo({
      request,
      confirmationToken: preparedSecond.confirmationToken,
    });

    expect(confirmedFirst.reused).toBe(false);
    expect(confirmedSecond.reused).toBe(false);
    expect(confirmedSecond.generation.id).not.toBe(confirmedFirst.generation.id);
    expect(await studio.generations.listByProject(project.id)).toHaveLength(2);
  });

  describe('stale confirmation matrix', () => {
    it.each([
      ['provider/model', (request: ReturnType<typeof videoRequest>) => ({ ...request, model: 'mock-video-v2' })],
      ['prompt', (request: ReturnType<typeof videoRequest>) => ({ ...request, prompt: 'A changed video prompt.' })],
      ['negative prompt', (request: ReturnType<typeof videoRequest>) => ({ ...request, negativePrompt: 'changed' })],
      ['seed', (request: ReturnType<typeof videoRequest>) => ({ ...request, seed: 85 })],
      ['params', (request: ReturnType<typeof videoRequest>) => ({ ...request, params: { durationSeconds: 6 } })],
      [
        'reference IDs',
        (request: ReturnType<typeof videoRequest>) => ({ ...request, referenceAssetIds: ['asset_x'] }),
      ],
      ['priority', (request: ReturnType<typeof videoRequest>) => ({ ...request, priority: 99 })],
    ])('rejects a changed %s after prepare as CONFIRMATION_STALE and creates nothing', async (_name, mutate) => {
      const project = await projects.create({
        title: 'Stale changed video request',
        productionType: 'animated-series',
      });
      const request = videoRequest(project.id);
      const prepared = await prepareVideo(request);

      await expect(
        confirmVideo({
          request: mutate(request),
          confirmationToken: prepared.confirmationToken,
        }),
      ).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });

      expect(await studio.generations.listByProject(project.id)).toEqual([]);
      expect(await studio.generations.encumberedUsd(project.id)).toBe(0);
    });

    it('rejects Production Type drift after prepare as CONFIRMATION_STALE', async () => {
      const project = await projects.create({
        title: 'Production type drift video confirm',
        productionType: 'animated-series',
      });
      const request = videoRequest(project.id);
      const prepared = await prepareVideo(request);
      await projects.update(project.id, { productionType: 'product-ad' });

      await expect(
        confirmVideo({ request, confirmationToken: prepared.confirmationToken }),
      ).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });

      expect(await studio.generations.listByProject(project.id)).toEqual([]);
    });

    it('fails closed when project status becomes archived after prepare', async () => {
      const project = await projects.create({
        title: 'Archived after video prepare',
        productionType: 'animated-series',
      });
      const request = videoRequest(project.id);
      const prepared = await prepareVideo(request);
      await projects.update(project.id, { status: 'archived' });

      await expect(
        confirmVideo({ request, confirmationToken: prepared.confirmationToken }),
      ).rejects.toMatchObject({
        code: 'UNSUPPORTED_CAPABILITY',
        details: {
          capability: {
            key: 'generation.video.submit',
            reasonCode: 'PROJECT_ARCHIVED',
          },
        },
      });

      expect(await studio.generations.listByProject(project.id)).toEqual([]);
    });

    it('rejects prompt version drift after prepare as CONFIRMATION_STALE', async () => {
      const project = await projects.create({
        title: 'Prompt version drift video confirm',
        productionType: 'animated-series',
      });
      const prompt = await createPromptFixture(project.id);
      const request = videoRequest(project.id);
      const prepared = await prepareVideo({ ...request, promptId: prompt.id });

      await studio.prompts.addVersion(prompt.id, {
        blocks: promptBlocksSchema.parse({}),
        compiled: 'A changed pinned video prompt.',
        negative: '',
        lockRefs: { characters: [], style: null, location: null, props: [] },
        lint: {
          ok: true,
          score: 100,
          characterCount: 30,
          issues: [],
        },
      });

      await expect(
        confirmVideo({ request: { ...request, promptId: prompt.id }, confirmationToken: prepared.confirmationToken }),
      ).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });

      expect(await studio.generations.listByProject(project.id)).toEqual([]);
    });

    it('rejects shot duration drift before Confirm as CONFIRMATION_STALE', async () => {
      const project = await projects.create({
        title: 'Shot duration drift video confirm',
        productionType: 'animated-series',
      });
      const shot = await createShotFixture(project.id);
      const request = videoRequest(project.id, shot.id);
      const prepared = await prepareVideo(request);

      await studio.shots.update(shot.id, { durationSeconds: 8 });

      await expect(
        confirmVideo({ request, confirmationToken: prepared.confirmationToken }),
      ).rejects.toMatchObject({ code: 'CONFIRMATION_STALE' });

      expect(await studio.generations.listByProject(project.id)).toEqual([]);
    });

    it('retains the same generation when idempotency is preserved across status changes and transient continuity warnings', async () => {
      const project = await projects.create({
        title: 'Transient warnings video confirm',
        productionType: 'animated-series',
      });
      const shot = await createShotFixture(project.id);
      const prompt = await createPromptFixture(project.id);
      const request = { ...videoRequest(project.id, shot.id), promptId: prompt.id };

      // Prepare #1
      const prepared1 = await prepareVideo(request);

      // Confirm #1
      const confirmed1 = await confirmVideo({ request, confirmationToken: prepared1.confirmationToken });

      // Verify first Generation exists
      expect(confirmed1.reused).toBe(false);

      // Prepare #2
      const prepared2 = await prepareVideo(request);

      // Confirm #2
      const confirmed2 = await confirmVideo({ request, confirmationToken: prepared2.confirmationToken });

      // Verify it reused the exact same generation
      expect(confirmed2.reused).toBe(true);
      expect(confirmed2.generation.id).toBe(confirmed1.generation.id);
      const totalGenerations = await studio.generations.listByProject(project.id);
      expect(totalGenerations).toHaveLength(1);
    });
  });

  describe('invalid and expired confirmation tokens', () => {
    it('rejects a tampered confirmation token and creates nothing', async () => {
      const project = await projects.create({
        title: 'Tampered video confirm token',
        productionType: 'animated-series',
      });
      const request = videoRequest(project.id);
      const prepared = await prepareVideo(request);
      const last = prepared.confirmationToken.at(-1) ?? '';
      const tampered = `${prepared.confirmationToken.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;

      await expect(
        confirmVideo({ request, confirmationToken: tampered }),
      ).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });

      expect(await studio.generations.listByProject(project.id)).toEqual([]);
    });

    it('rejects an expired video confirmation token and creates nothing', async () => {
      const project = await projects.create({
        title: 'Expired video confirmation',
        productionType: 'animated-series',
      });
      const request = videoRequest(project.id);
      const expiredIssuer = createVideoExecutionConfirmationTokenService({
        apiKey: studio.config.apiKey,
        nowMs: () => Date.now() - 5 * 60_000 - 1,
      });
      const expired = expiredIssuer.issue('a'.repeat(64));

      await expect(
        confirmVideo({ request, confirmationToken: expired.token }),
      ).rejects.toMatchObject({ code: 'CONFIRMATION_EXPIRED' });

      expect(await studio.generations.listByProject(project.id)).toEqual([]);
    });

    it('rejects an image confirmation token at the video Confirm boundary and creates nothing', async () => {
      const project = await projects.create({
        title: 'Wrong-kind video confirm token',
        productionType: 'animated-series',
      });
      const request = videoRequest(project.id);
      const imageIssuer = createImageExecutionConfirmationTokenService({
        apiKey: studio.config.apiKey,
      });
      const imageToken = imageIssuer.issue('b'.repeat(64));

      await expect(
        confirmVideo({ request, confirmationToken: imageToken.token }),
      ).rejects.toMatchObject({ code: 'CONFIRMATION_INVALID' });

      expect(await studio.generations.listByProject(project.id)).toEqual([]);
    });
  });
});
