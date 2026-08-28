import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('video-execution-confirmation');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createGenerationService } = await import('@/application/services/generationService');
const { continuitySchema, promptBlocksSchema, shotCharacterRefSchema } = await import('@/domain/schemas');

const studio = getStudio();
const projects = createProjectService(studio);
const generations = createGenerationService(studio);

interface PreparedVideoResult {
  capability: 'generation.video.submit';
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
    reviewedDurationSeconds: number;
    seed: number | null;
    params: Record<string, unknown>;
    referenceAssetIds: string[];
    priority: number;
    warnings: string[];
  };
  confirmationToken: string;
  expiresAt: string;
}

function prepareVideo(raw: unknown): Promise<PreparedVideoResult> {
  return (
    generations as unknown as {
      prepareVideo(input: unknown): Promise<PreparedVideoResult>;
    }
  ).prepareVideo(raw);
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

async function createShotFixture(
  projectId: string,
  options: { importance?: 'normal' | 'key'; withUnpinnedCharacter?: boolean } = {},
) {
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
    characters: options.withUnpinnedCharacter
      ? [shotCharacterRefSchema.parse({ characterId: 'char-unpinned', versionId: '' })]
      : [],
    location: null,
    props: [],
    dialogue: '',
    emotion: 'neutral',
    lighting: 'day',
    visualEffects: [],
    soundEffects: [],
    continuity: continuitySchema.parse({}),
    aspectRatio: '16:9',
    importance: options.importance ?? 'normal',
  });
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('safe video execution confirmation', () => {
  it('requires explicit confirmation before direct application video enqueue and mutates nothing', async () => {
    const project = await projects.create({
      title: 'Video gate',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });

    const generationsBefore = await studio.generations.listByProject(project.id);
    const encumberedBefore = await studio.generations.encumberedUsd(project.id);
    const activityBefore = await studio.activity.recent(project.id, 100);

    await expect(generations.enqueue(videoRequest(project.id))).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
    });

    expect(await studio.generations.listByProject(project.id)).toEqual(generationsBefore);
    expect(await studio.generations.encumberedUsd(project.id)).toBe(encumberedBefore);
    expect(await studio.activity.recent(project.id, 100)).toEqual(activityBefore);
  });

  it('preserves the existing non-image non-video enqueue contract', async () => {
    const project = await projects.create({
      title: 'Non-video generation regression',
      productionType: 'animated-series',
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

  it('prepares the exact resolved video candidate without any write, reservation, activity, shot status change, or provider execution', async () => {
    const project = await projects.create({
      title: 'Read-only video prepare',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const shot = await createShotFixture(project.id);
    const request = videoRequest(project.id, shot.id);
    const generationsBefore = await studio.generations.listByProject(project.id);
    const encumberedBefore = await studio.generations.encumberedUsd(project.id);
    const activityBefore = await studio.activity.recent(project.id, 100);
    const shotBefore = await studio.shots.byId(shot.id);
    const videoProvider = studio.providers.video('mock');
    const generateVideoSpy = vi.spyOn(videoProvider, 'generateVideo');

    try {
      const prepared = await prepareVideo(request);

      expect(prepared).toMatchObject({
        capability: 'generation.video.submit',
        state: 'READY_FOR_CONFIRMATION',
        preview: {
          projectId: project.id,
          productionType: 'animated-series',
          shotId: shot.id,
          promptId: null,
          promptVersion: null,
          provider: 'mock',
          model: 'mock-video-v1',
          prompt: request.prompt,
          negativePrompt: request.negativePrompt,
          estimatedCostUsd: 0,
          reviewedDurationSeconds: 5,
          seed: 84,
          params: { durationSeconds: 5 },
          referenceAssetIds: [],
          priority: 100,
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
      expect(await studio.shots.byId(shot.id)).toMatchObject({ status: shotBefore!.status });
      expect(generateVideoSpy).not.toHaveBeenCalled();
    } finally {
      generateVideoSpy.mockRestore();
    }
  });

  it('rejects a caller-supplied idempotencyKey for video and mutates nothing', async () => {
    const project = await projects.create({
      title: 'Caller idempotency override',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const generationsBefore = await studio.generations.listByProject(project.id);
    const encumberedBefore = await studio.generations.encumberedUsd(project.id);
    const activityBefore = await studio.activity.recent(project.id, 100);
    const videoProvider = studio.providers.video('mock');
    const generateVideoSpy = vi.spyOn(videoProvider, 'generateVideo');

    try {
      await expect(
        prepareVideo({ ...videoRequest(project.id), idempotencyKey: 'caller-controlled-key' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(await studio.generations.listByProject(project.id)).toEqual(generationsBefore);
      expect(await studio.generations.encumberedUsd(project.id)).toBe(encumberedBefore);
      expect(await studio.activity.recent(project.id, 100)).toEqual(activityBefore);
      expect(generateVideoSpy).not.toHaveBeenCalled();
    } finally {
      generateVideoSpy.mockRestore();
    }
  });

  it('blocks video prepare when Production Type has not been selected', async () => {
    const project = await projects.create({
      title: 'Prepare without production type',
      productionType: null,
    });

    await expect(prepareVideo(videoRequest(project.id))).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      details: {
        capability: {
          key: 'generation.video.submit',
          state: 'BLOCKED',
          reasonCode: 'PRODUCTION_TYPE_REQUIRED',
        },
      },
    });
    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('blocks video prepare for an archived project', async () => {
    const project = await projects.create({
      title: 'Archived video prepare',
      productionType: 'animated-series',
    });
    await projects.update(project.id, { status: 'archived' });

    await expect(prepareVideo(videoRequest(project.id))).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      details: {
        capability: {
          key: 'generation.video.submit',
          state: 'BLOCKED',
          reasonCode: 'PROJECT_ARCHIVED',
        },
      },
    });
    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('blocks video prepare when no registered provider can generate video', async () => {
    const project = await projects.create({
      title: 'No video provider capability',
      productionType: 'animated-series',
    });
    const descriptorsSpy = vi.spyOn(studio.providers, 'descriptors').mockReturnValue([]);

    try {
      await expect(prepareVideo(videoRequest(project.id))).rejects.toMatchObject({
        code: 'UNSUPPORTED_CAPABILITY',
        details: {
          capability: {
            key: 'generation.video.submit',
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

  it('blocks video prepare when the selected provider lacks textToVideo', async () => {
    const project = await projects.create({
      title: 'Selected provider lacks video capability',
      productionType: 'animated-series',
    });
    const mockDescriptor = studio.providers
      .descriptors()
      .find((descriptor) => descriptor.key === 'mock')!;
    const weakDescriptor = {
      ...mockDescriptor,
      key: 'weak-video',
      capabilities: { ...mockDescriptor.capabilities, textToVideo: false },
    };
    const descriptorsSpy = vi
      .spyOn(studio.providers, 'descriptors')
      .mockReturnValue([mockDescriptor, weakDescriptor]);

    try {
      await expect(
        prepareVideo({
          ...videoRequest(project.id),
          provider: 'weak-video',
          model: 'weak-video-v1',
        }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
      expect(await studio.generations.listByProject(project.id)).toEqual([]);
    } finally {
      descriptorsSpy.mockRestore();
    }
  });

  it('blocks video prepare when the pinned prompt has blocking lint', async () => {
    const project = await projects.create({
      title: 'Blocking prompt lint video prepare',
      productionType: 'animated-series',
    });
    const compiled = 'A blocked video prompt.';
    const { prompt } = await studio.prompts.createWithVersion({
      projectId: project.id,
      shotId: null,
      kind: 'video',
      name: 'Blocked video prompt',
      blocks: promptBlocksSchema.parse({}),
      compiled,
      negative: '',
      lockRefs: { characters: [], style: null, location: null, props: [] },
      lint: {
        ok: false,
        score: 10,
        characterCount: compiled.length,
        issues: [
          { rule: 'test-blocker', severity: 'error', message: 'Blocking lint.', hint: 'Fix it.' },
        ],
      },
    });

    await expect(
      prepareVideo({ ...videoRequest(project.id), promptId: prompt.id }),
    ).rejects.toMatchObject({ code: 'PROMPT_LINT_BLOCKED' });
    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('blocks video prepare when the shot has blocking continuity errors', async () => {
    const project = await projects.create({
      title: 'Blocking continuity video prepare',
      productionType: 'animated-series',
    });
    const shot = await createShotFixture(project.id, { withUnpinnedCharacter: true });

    await expect(
      prepareVideo(videoRequest(project.id, shot.id)),
    ).rejects.toMatchObject({ code: 'MISSING_REFERENCE' });
    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('blocks video prepare for a key shot without an approved image or storyboard', async () => {
    const project = await projects.create({
      title: 'Key shot without keyframe',
      productionType: 'animated-series',
    });
    const shot = await createShotFixture(project.id, { importance: 'key' });

    await expect(
      prepareVideo(videoRequest(project.id, shot.id)),
    ).rejects.toMatchObject({ code: 'MISSING_REFERENCE' });
    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });

  it('prepares a key shot video candidate once an approved image or storyboard exists', async () => {
    const project = await projects.create({
      title: 'Key shot with approved keyframe',
      productionType: 'animated-series',
      costLimitUsd: 1,
    });
    const shot = await createShotFixture(project.id, { importance: 'key' });
    const keyframe = await studio.assets.register({
      projectId: project.id,
      shotId: shot.id,
      generationId: null,
      kind: 'image',
      name: 'Approved keyframe',
      storageKey: `tests/${project.id}/keyframe.png`,
      mimeType: 'image/png',
      sizeBytes: 128,
      checksum: 'f'.repeat(64),
      width: 1920,
      height: 1080,
      durationSeconds: null,
      tags: [],
      metadata: {},
    });
    await studio.assets.setApproval(keyframe.id, 'approved');

    const prepared = await prepareVideo(videoRequest(project.id, shot.id));

    expect(prepared).toMatchObject({
      capability: 'generation.video.submit',
      state: 'READY_FOR_CONFIRMATION',
      preview: {
        projectId: project.id,
        shotId: shot.id,
        provider: 'mock',
        model: 'mock-video-v1',
        reviewedDurationSeconds: 5,
      },
    });
    expect(await studio.generations.listByProject(project.id)).toEqual([]);
  });
});
