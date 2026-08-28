import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('image-execution-confirmation-http');

const { POST: prepareRoute } = await import('@/app/api/generations/image/prepare/route');
const { POST: confirmRoute } = await import('@/app/api/generations/image/confirm/route');
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
const HTTP_KEY = 'image-confirmation-http-key';

let originalKey: string | null;
let projectId = '';

function imageRequest() {
  return {
    projectId,
    kind: 'image' as const,
    prompt: 'A safe HTTP image confirmation candidate.',
    negativePrompt: 'blur',
    params: { count: 1 },
    referenceAssetIds: [],
    seed: 1234,
    priority: 50,
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
    title: 'Image confirmation HTTP boundary',
    productionType: 'youtube-short',
    costLimitUsd: 1,
  });
  projectId = project.id;
});

afterAll(() => {
  studio.config.apiKey = originalKey;
  env.cleanup();
});

describe('safe image execution HTTP boundary', () => {
  it('requires X-Studio-Key for Prepare', async () => {
    const response = await prepareRoute(
      jsonRequest('http://localhost/api/generations/image/prepare', imageRequest()),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed Prepare input with the stable validation envelope', async () => {
    const response = await prepareRoute(
      jsonRequest(
        'http://localhost/api/generations/image/prepare',
        { kind: 'image' },
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('returns the resolved preview and opaque confirmation token without enqueueing', async () => {
    const before = await studio.generations.listByProject(projectId);
    const response = await prepareRoute(
      jsonRequest(
        'http://localhost/api/generations/image/prepare',
        imageRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      capability: 'generation.image.submit',
      state: 'READY_FOR_CONFIRMATION',
      preview: {
        projectId,
        prompt: 'A safe HTTP image confirmation candidate.',
        negativePrompt: 'blur',
        seed: 1234,
        priority: 50,
      },
    });
    expect(typeof body.data.confirmationToken).toBe('string');
    expect(typeof body.data.expiresAt).toBe('string');
    expect(await studio.generations.listByProject(projectId)).toEqual(before);
  });

  it('does not accept a browser mutation session as Confirm REST authorization', async () => {
    const prepared = await prepareRoute(
      jsonRequest(
        'http://localhost/api/generations/image/prepare',
        imageRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    const preparedBody = await prepared.json();
    const session = issueStudioSession(HTTP_KEY, HTTP_KEY);

    const response = await confirmRoute(
      jsonRequest(
        'http://localhost/api/generations/image/confirm',
        { request: imageRequest(), confirmationToken: preparedBody.data.confirmationToken },
        { cookie: `${STUDIO_MUTATION_SESSION_COOKIE}=${session}` },
      ),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('confirms exactly one pending Generation and reports replay as reused', async () => {
    const prepared = await prepareRoute(
      jsonRequest(
        'http://localhost/api/generations/image/prepare',
        imageRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    const preparedBody = await prepared.json();
    const confirmBody = {
      request: imageRequest(),
      confirmationToken: preparedBody.data.confirmationToken,
    };

    const first = await confirmRoute(
      jsonRequest(
        'http://localhost/api/generations/image/confirm',
        confirmBody,
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.data.reused).toBe(false);
    expect(firstBody.data.generation).toMatchObject({
      projectId,
      kind: 'image',
      status: 'pending',
    });

    const second = await confirmRoute(
      jsonRequest(
        'http://localhost/api/generations/image/confirm',
        confirmBody,
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.data.reused).toBe(true);
    expect(secondBody.data.generation.id).toBe(firstBody.data.generation.id);
  });

  it('keeps the legacy POST /api/generations image path fail-closed', async () => {
    const response = await generationRoute(
      jsonRequest(
        'http://localhost/api/generations',
        imageRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('does not expose signing authority or submitted token in Confirm errors', async () => {
    const prepared = await prepareRoute(
      jsonRequest(
        'http://localhost/api/generations/image/prepare',
        imageRequest(),
        { 'X-Studio-Key': HTTP_KEY },
      ),
    );
    const preparedBody = await prepared.json();
    const token = preparedBody.data.confirmationToken as string;
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    const response = await confirmRoute(
      jsonRequest(
        'http://localhost/api/generations/image/confirm',
        { request: imageRequest(), confirmationToken: tampered },
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
