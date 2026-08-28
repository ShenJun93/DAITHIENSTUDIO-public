import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('video-execution-confirmation-http');

const { POST: prepareRoute } = await import('@/app/api/generations/video/prepare/route');
const { POST: confirmRoute } = await import('@/app/api/generations/video/confirm/route');
const { POST: generationRoute } = await import('@/app/api/generations/route');
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { issueStudioSession, STUDIO_MUTATION_SESSION_COOKIE } = await import(
  '@/infrastructure/security/studioMutationAuth'
);

runMigrations();
const studio = getStudio();
const projects = createProjectService(studio);
const HTTP_KEY = 'video-confirmation-http-key';

let originalKey: string | null;
let projectId = '';

function videoRequest() {
  return {
    projectId,
    kind: 'video' as const,
    prompt: 'A safe HTTP video confirmation candidate.',
    negativePrompt: 'identity drift, watermark',
    params: { durationSeconds: 5 },
    referenceAssetIds: [],
    seed: 4242,
    priority: 100,
  };
}

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  originalKey = studio.config.apiKey;
  studio.config.apiKey = HTTP_KEY;
  const project = await projects.create({
    title: 'Video confirmation HTTP boundary',
    productionType: 'animated-series',
    costLimitUsd: 1,
  });
  projectId = project.id;
});

afterAll(() => {
  studio.config.apiKey = originalKey;
  env.cleanup();
});

describe('safe video execution HTTP boundary', () => {
  it('requires X-Studio-Key for Prepare', async () => {
    const response = await prepareRoute(
      jsonRequest('http://localhost/api/generations/video/prepare', videoRequest()),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('requires X-Studio-Key for Confirm even when the confirmation token is valid', async () => {
    const prepared = await prepareRoute(
      jsonRequest(
        'http://localhost/api/generations/video/prepare',
        videoRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    const preparedBody = await prepared.json();

    const response = await confirmRoute(
      jsonRequest(
        'http://localhost/api/generations/video/confirm',
        { request: videoRequest(), confirmationToken: preparedBody.data.confirmationToken },
      ),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('does not accept a browser mutation session as Confirm REST authorization', async () => {
    const prepared = await prepareRoute(
      jsonRequest(
        'http://localhost/api/generations/video/prepare',
        videoRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    const preparedBody = await prepared.json();
    const session = issueStudioSession(HTTP_KEY, HTTP_KEY);

    const response = await confirmRoute(
      jsonRequest(
        'http://localhost/api/generations/video/confirm',
        { request: videoRequest(), confirmationToken: preparedBody.data.confirmationToken },
        { cookie: `${STUDIO_MUTATION_SESSION_COOKIE}=${session}` },
      ),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('returns the resolved preview and opaque confirmation token without enqueueing', async () => {
    const before = await studio.generations.listByProject(projectId);
    const encumberedBefore = await studio.generations.encumberedUsd(projectId);
    const videoProvider = studio.providers.video('mock');
    const generateVideoSpy = vi.spyOn(videoProvider, 'generateVideo');

    try {
      const response = await prepareRoute(
        jsonRequest(
          'http://localhost/api/generations/video/prepare',
          videoRequest(),
          { 'X-Studio-Key': HTTP_KEY },
        ),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toMatchObject({
        capability: 'generation.video.submit',
        state: 'READY_FOR_CONFIRMATION',
        preview: {
          projectId,
          prompt: 'A safe HTTP video confirmation candidate.',
          negativePrompt: 'identity drift, watermark',
          reviewedDurationSeconds: 5,
          seed: 4242,
          priority: 100,
        },
      });
      expect(typeof body.data.confirmationToken).toBe('string');
      expect(typeof body.data.expiresAt).toBe('string');
      expect(await studio.generations.listByProject(projectId)).toEqual(before);
      expect(await studio.generations.encumberedUsd(projectId)).toBe(encumberedBefore);
      expect(generateVideoSpy).not.toHaveBeenCalled();
    } finally {
      generateVideoSpy.mockRestore();
    }
  });

  it('confirms exactly one pending video Generation and reports replay as reused', async () => {
    const prepared = await prepareRoute(
      jsonRequest(
        'http://localhost/api/generations/video/prepare',
        videoRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    const preparedBody = await prepared.json();
    const confirmBody = {
      request: videoRequest(),
      confirmationToken: preparedBody.data.confirmationToken,
    };

    const first = await confirmRoute(
      jsonRequest(
        'http://localhost/api/generations/video/confirm',
        confirmBody,
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.data.reused).toBe(false);
    expect(firstBody.data.generation).toMatchObject({
      projectId,
      kind: 'video',
      status: 'pending',
    });

    const second = await confirmRoute(
      jsonRequest(
        'http://localhost/api/generations/video/confirm',
        confirmBody,
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.data.reused).toBe(true);
    expect(secondBody.data.generation.id).toBe(firstBody.data.generation.id);
    expect(await studio.generations.listByProject(projectId)).toHaveLength(1);
  });

  it('keeps the legacy POST /api/generations video path fail-closed', async () => {
    const rowsBefore = await studio.generations.listByProject(projectId);
    const response = await generationRoute(
      jsonRequest(
        'http://localhost/api/generations',
        videoRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('CONFIRMATION_REQUIRED');
    expect(await studio.generations.listByProject(projectId)).toEqual(rowsBefore);
  });

  it('does not expose signing authority or submitted token in Confirm errors', async () => {
    const prepared = await prepareRoute(
      jsonRequest(
        'http://localhost/api/generations/video/prepare',
        videoRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    const preparedBody = await prepared.json();
    const token = preparedBody.data.confirmationToken as string;
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    const response = await confirmRoute(
      jsonRequest(
        'http://localhost/api/generations/video/confirm',
        { request: videoRequest(), confirmationToken: tampered },
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );

    expect(response.status).toBe(400);
    const text = JSON.stringify(await response.json());
    expect(text).toContain('CONFIRMATION_INVALID');
    expect(text).not.toContain(HTTP_KEY);
    expect(text).not.toContain(tampered);
    expect(text).not.toMatch(/hmac|signing|secret/i);
  });
});