import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const authState = vi.hoisted(() => ({ sessionToken: null as string | null }));

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: () => null,
  }),
  cookies: async () => ({
    get: (name: string) =>
      name === 'studio_mutation_session' && authState.sessionToken
        ? { value: authState.sessionToken }
        : undefined,
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const env = useTempStudio('video-execution-confirmation-action-security');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { issueStudioSession } = await import('@/infrastructure/security/studioMutationAuth');
const { revalidatePath } = await import('next/cache');
const generationActions = await import('@/app/generationActions');

runMigrations();
const studio = getStudio();
const projects = createProjectService(studio);
const ACTION_KEY = 'video-confirmation-action-key';

let originalKey: string | null;
let projectA: Awaited<ReturnType<typeof projects.create>>;
let projectB: Awaited<ReturnType<typeof projects.create>>;

function videoRequest(projectId = projectA.id) {
  return {
    projectId,
    shotId: null,
    promptId: null,
    kind: 'video' as const,
    provider: 'mock',
    model: 'mock-video-v1',
    prompt: 'A browser-session authorized video candidate.',
    negativePrompt: 'identity drift, watermark',
    params: { durationSeconds: 5 },
    referenceAssetIds: [],
    seed: 9090,
    priority: 100,
  };
}

function authorizeSession() {
  authState.sessionToken = issueStudioSession(ACTION_KEY, ACTION_KEY);
}

beforeAll(async () => {
  originalKey = studio.config.apiKey;
  studio.config.apiKey = ACTION_KEY;
  projectA = await projects.create({
    title: 'Video action project A',
    productionType: 'animated-series',
    costLimitUsd: 1,
  });
  projectB = await projects.create({
    title: 'Video action project B',
    productionType: 'animated-series',
    costLimitUsd: 1,
  });
});

beforeEach(() => {
  authState.sessionToken = null;
  vi.mocked(revalidatePath).mockClear();
});

afterAll(() => {
  studio.config.apiKey = originalKey;
  env.cleanup();
});

describe('safe video execution browser actions', () => {
  it('fails unauthorized Prepare before reading project ownership', async () => {
    const byId = vi.spyOn(studio.projects, 'byId');
    const bySlug = vi.spyOn(studio.projects, 'bySlug');
    try {
      const result = await generationActions.prepareVideoGenerationAction(projectA.slug, videoRequest());

      expect(result).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
      expect(byId).not.toHaveBeenCalled();
      expect(bySlug).not.toHaveBeenCalled();
    } finally {
      byId.mockRestore();
      bySlug.mockRestore();
    }
  });

  it('fails unauthorized Confirm before reading project ownership', async () => {
    const byId = vi.spyOn(studio.projects, 'byId');
    const bySlug = vi.spyOn(studio.projects, 'bySlug');
    try {
      const result = await generationActions.confirmVideoGenerationAction(projectA.slug, {
        request: videoRequest(),
        confirmationToken: 'forged-token',
      });

      expect(result).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
      expect(byId).not.toHaveBeenCalled();
      expect(bySlug).not.toHaveBeenCalled();
    } finally {
      byId.mockRestore();
      bySlug.mockRestore();
    }
  });

  it('rejects a cross-project Prepare with the anti-enumeration NOT_FOUND shape', async () => {
    authorizeSession();
    const before = await studio.generations.listByProject(projectB.id);

    const result = await generationActions.prepareVideoGenerationAction(
      projectA.slug,
      videoRequest(projectB.id),
    );

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(result.message).not.toContain(projectB.id);
    expect(result.message).not.toContain(projectB.title);
    expect(JSON.stringify(result)).not.toContain(projectB.id);
    expect(await studio.generations.listByProject(projectB.id)).toEqual(before);
  });

  it('rejects cross-project Confirm with a genuinely valid project B token using anti-enumeration NOT_FOUND', async () => {
    authorizeSession();
    const preparedB = await generationActions.prepareVideoGenerationAction(
      projectB.slug,
      videoRequest(projectB.id),
    );
    expect(preparedB.ok).toBe(true);
    if (!preparedB.ok) throw new Error(preparedB.message);

    const beforeB = await studio.generations.listByProject(projectB.id);
    const result = await generationActions.confirmVideoGenerationAction(projectA.slug, {
      request: videoRequest(projectB.id),
      confirmationToken: preparedB.data.confirmationToken,
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(result.message).not.toContain(projectB.id);
    expect(result.message).not.toContain(projectB.title);
    expect(JSON.stringify(result)).not.toContain(projectB.id);
    expect(await studio.generations.listByProject(projectB.id)).toEqual(beforeB);
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });

  it('prepares through the application service without an HTTP hop or studio-key argument', async () => {
    authorizeSession();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('REST hop forbidden'));
    try {
      const before = await studio.generations.listByProject(projectA.id);
      const result = await generationActions.prepareVideoGenerationAction(projectA.slug, videoRequest());

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      expect(result.data).toMatchObject({
        capability: 'generation.video.submit',
        state: 'READY_FOR_CONFIRMATION',
        preview: {
          projectId: projectA.id,
          prompt: 'A browser-session authorized video candidate.',
          reviewedDurationSeconds: 5,
          seed: 9090,
          priority: 100,
        },
      });
      expect(typeof result.data.confirmationToken).toBe('string');
      expect(await studio.generations.listByProject(projectA.id)).toEqual(before);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(ACTION_KEY);
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('confirms through the application service, replay reuses the same pending Generation, and revalidates the layout', async () => {
    authorizeSession();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('REST hop forbidden'));
    const videoProvider = studio.providers.video('mock');
    const generateVideoSpy = vi.spyOn(videoProvider, 'generateVideo');
    try {
      const request = videoRequest();
      const prepared = await generationActions.prepareVideoGenerationAction(projectA.slug, request);
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) throw new Error(prepared.message);

      const first = await generationActions.confirmVideoGenerationAction(projectA.slug, {
        request,
        confirmationToken: prepared.data.confirmationToken,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error(first.message);
      expect(first.message).toBe('Video generation queued.');
      expect(first.data.reused).toBe(false);
      expect(first.data.generation).toMatchObject({
        projectId: projectA.id,
        kind: 'video',
        provider: 'mock',
        model: 'mock-video-v1',
        status: 'pending',
      });
      expect(generateVideoSpy).not.toHaveBeenCalled();

      const second = await generationActions.confirmVideoGenerationAction(projectA.slug, {
        request,
        confirmationToken: prepared.data.confirmationToken,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) throw new Error(second.message);
      expect(second.message).toBe('Existing video generation reused.');
      expect(second.data.reused).toBe(true);
      expect(second.data.generation.id).toBe(first.data.generation.id);
      expect(await studio.generations.listByProject(projectA.id)).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(generateVideoSpy).not.toHaveBeenCalled();
      expect(JSON.stringify({ first, second })).not.toContain(ACTION_KEY);
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(`/projects/${projectA.slug}`, 'layout');
    } finally {
      fetchSpy.mockRestore();
      generateVideoSpy.mockRestore();
    }
  });

  it('never lets a possession of a valid token reach paid mutation through a cross-project owner', async () => {
    authorizeSession();
    const preparedB = await generationActions.prepareVideoGenerationAction(
      projectB.slug,
      videoRequest(projectB.id),
    );
    expect(preparedB.ok).toBe(true);
    if (!preparedB.ok) throw new Error(preparedB.message);

    const beforeB = await studio.generations.listByProject(projectB.id);
    const result = await generationActions.confirmVideoGenerationAction(projectA.slug, {
      request: videoRequest(projectB.id),
      confirmationToken: preparedB.data.confirmationToken,
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await studio.generations.listByProject(projectB.id)).toEqual(beforeB);
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });
});