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

const env = useTempStudio('image-execution-confirmation-action-security');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { issueStudioSession } = await import('@/infrastructure/security/studioMutationAuth');
const generationActions = await import('@/app/generationActions');

runMigrations();
const studio = getStudio();
const projects = createProjectService(studio);
const ACTION_KEY = 'image-confirmation-action-key';

let originalKey: string | null;
let projectA: Awaited<ReturnType<typeof projects.create>>;
let projectB: Awaited<ReturnType<typeof projects.create>>;

function imageRequest(projectId = projectA.id) {
  return {
    projectId,
    kind: 'image' as const,
    prompt: 'A browser-session authorized image candidate.',
    negativePrompt: 'blur',
    params: { count: 1 },
    referenceAssetIds: [],
    seed: 8080,
    priority: 50,
  };
}

function authorizeSession() {
  authState.sessionToken = issueStudioSession(ACTION_KEY, ACTION_KEY);
}

beforeAll(async () => {
  originalKey = studio.config.apiKey;
  studio.config.apiKey = ACTION_KEY;
  projectA = await projects.create({
    title: 'Image action project A',
    productionType: 'youtube-short',
    costLimitUsd: 1,
  });
  projectB = await projects.create({
    title: 'Image action project B',
    productionType: 'youtube-short',
    costLimitUsd: 1,
  });
});

beforeEach(() => {
  authState.sessionToken = null;
});

afterAll(() => {
  studio.config.apiKey = originalKey;
  env.cleanup();
});

describe('safe image execution browser actions', () => {
  it('fails unauthorized Prepare before reading project ownership', async () => {
    const byId = vi.spyOn(studio.projects, 'byId');
    const bySlug = vi.spyOn(studio.projects, 'bySlug');
    try {
      const result = await generationActions.prepareImageGenerationAction(projectA.slug, imageRequest());

      expect(result).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
      expect(byId).not.toHaveBeenCalled();
      expect(bySlug).not.toHaveBeenCalled();
    } finally {
      byId.mockRestore();
      bySlug.mockRestore();
    }
  });

  it('rejects malformed authorized input with the stable validation code', async () => {
    authorizeSession();

    const result = await generationActions.prepareImageGenerationAction('', { kind: 'image' });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('rejects a request whose projectId does not belong to the supplied project slug', async () => {
    authorizeSession();
    const before = await studio.generations.listByProject(projectB.id);

    const result = await generationActions.prepareImageGenerationAction(
      projectA.slug,
      imageRequest(projectB.id),
    );

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await studio.generations.listByProject(projectB.id)).toEqual(before);
  });

  it('prepares through the application service without an HTTP hop or studio-key argument', async () => {
    authorizeSession();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('REST hop forbidden'));
    try {
      const before = await studio.generations.listByProject(projectA.id);
      const result = await generationActions.prepareImageGenerationAction(projectA.slug, imageRequest());

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      expect(result.data).toMatchObject({
        capability: 'generation.image.submit',
        state: 'READY_FOR_CONFIRMATION',
        preview: {
          projectId: projectA.id,
          prompt: 'A browser-session authorized image candidate.',
          seed: 8080,
          priority: 50,
        },
      });
      expect(typeof result.data.confirmationToken).toBe('string');
      expect(await studio.generations.listByProject(projectA.id)).toEqual(before);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(ACTION_KEY);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('confirms through the application service and replay reuses the same pending Generation', async () => {
    authorizeSession();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('REST hop forbidden'));
    try {
      const request = imageRequest();
      const prepared = await generationActions.prepareImageGenerationAction(projectA.slug, request);
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) throw new Error(prepared.message);

      const first = await generationActions.confirmImageGenerationAction(projectA.slug, {
        request,
        confirmationToken: prepared.data.confirmationToken,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error(first.message);
      expect(first.data.reused).toBe(false);
      expect(first.data.generation).toMatchObject({
        projectId: projectA.id,
        kind: 'image',
        status: 'pending',
      });

      const second = await generationActions.confirmImageGenerationAction(projectA.slug, {
        request,
        confirmationToken: prepared.data.confirmationToken,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) throw new Error(second.message);
      expect(second.data.reused).toBe(true);
      expect(second.data.generation.id).toBe(first.data.generation.id);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(JSON.stringify({ first, second })).not.toContain(ACTION_KEY);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fails cross-project Confirm before enqueueing anything in the mismatched project', async () => {
    authorizeSession();
    const prepared = await generationActions.prepareImageGenerationAction(projectA.slug, imageRequest());
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error(prepared.message);

    const beforeB = await studio.generations.listByProject(projectB.id);
    const result = await generationActions.confirmImageGenerationAction(projectA.slug, {
      request: imageRequest(projectB.id),
      confirmationToken: prepared.data.confirmationToken,
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await studio.generations.listByProject(projectB.id)).toEqual(beforeB);
  });
});
