import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';
import type { GenerationRecord } from '@/application/records';

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function generationFixture(projectId: string): GenerationRecord {
  return {
    id: 'gen-security-fixture',
    projectId,
    shotId: null,
    promptId: null,
    promptVersion: null,
    kind: 'image',
    provider: 'mock',
    model: 'mock-image-v1',
    prompt: '',
    negativePrompt: '',
    params: {},
    referenceAssetIds: [],
    seed: null,
    status: 'completed',
    priority: 100,
    attempts: 1,
    maxAttempts: 1,
    scheduledAt: '',
    startedAt: null,
    finishedAt: null,
    estimatedCostUsd: 0,
    actualCostUsd: 0,
    errorCode: null,
    errorMessage: null,
    createdAt: '',
    updatedAt: '',
  };
}

const env = useTempStudio('http-security');

const { POST: uploadRoute } = await import('@/app/api/projects/[slug]/assets/upload/route');
const { POST: projectsRoute } = await import('@/app/api/projects/route');
const { GET: filesRoute } = await import('@/app/api/files/[...key]/route');
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createAssetService } = await import('@/application/services/assetService');
const { issueStudioSession, STUDIO_MUTATION_SESSION_COOKIE } = await import(
  '@/infrastructure/security/studioMutationAuth'
);

describe('HTTP Security (Phase 3)', () => {
  let projectSlug = '';

  beforeAll(async () => {
    await runMigrations();
    const studio = getStudio();
    const projects = createProjectService(studio);
    const project = await projects.create({
      title: 'Security Test',
      description: '',
      aspectRatio: '16:9',
      durationTargetSeconds: 120,
    });
    projectSlug = project.slug;
  });

  afterAll(() => {
    env.cleanup();
  });

  describe('API Boundary Security', () => {
    it('returns HTTP 400 for a malformed JSON request body', async () => {
      const res = await projectsRoute(
        new Request('http://localhost/api/projects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"title":',
        }),
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects an oversized JSON request before buffering the body', async () => {
      const res = await projectsRoute(
        new Request('http://localhost/api/projects', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': String(1024 * 1024 + 1) },
          body: '{}',
        }),
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toMatch(/JSON request exceeds/);
    });

    it('allows an open mutation when every configured provider is offline', async () => {
      const studio = getStudio();
      const originalKey = studio.config.apiKey;
      try {
        studio.config.apiKey = null;
        const res = await uploadRoute(
          new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST' }),
          { params: Promise.resolve({ slug: projectSlug }) },
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe('VALIDATION_FAILED');
      } finally {
        studio.config.apiKey = originalKey;
      }
    });

    it('refuses a paid-provider mutation when STUDIO_API_KEY is not configured', async () => {
      const studio = getStudio();
      const originalKey = studio.config.apiKey;
      const originalDescriptors = studio.providers.descriptors.bind(studio.providers);
      try {
        studio.config.apiKey = null;
        studio.providers.descriptors = () => [
          ...originalDescriptors(),
          { ...originalDescriptors()[0]!, key: 'paid-test', label: 'Paid test provider', offline: false },
        ];
        const res = await uploadRoute(
          new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST' }),
          { params: Promise.resolve({ slug: projectSlug }) },
        );
        expect(res.status).toBe(401);
        expect((await res.json()).error.code).toBe('UNAUTHORIZED');
      } finally {
        studio.config.apiKey = originalKey;
        studio.providers.descriptors = originalDescriptors;
      }
    });

    it('refuses an incorrect X-Studio-Key when a paid provider is configured', async () => {
      const studio = getStudio();
      const originalKey = studio.config.apiKey;
      const originalDescriptors = studio.providers.descriptors.bind(studio.providers);
      try {
        studio.config.apiKey = 'configured-studio-key';
        studio.providers.descriptors = () => [
          ...originalDescriptors(),
          { ...originalDescriptors()[0]!, key: 'paid-test', label: 'Paid test provider', offline: false },
        ];
        const res = await uploadRoute(
          new Request('http://localhost/api/projects/security-test/assets/upload', {
            method: 'POST',
            headers: { 'X-Studio-Key': 'incorrect-key' },
          }),
          { params: Promise.resolve({ slug: projectSlug }) },
        );
        expect(res.status).toBe(401);
        expect((await res.json()).error.code).toBe('UNAUTHORIZED');
      } finally {
        studio.config.apiKey = originalKey;
        studio.providers.descriptors = originalDescriptors;
      }
    });

    it('allows a correct X-Studio-Key when a paid provider is configured', async () => {
      const studio = getStudio();
      const originalKey = studio.config.apiKey;
      const originalDescriptors = studio.providers.descriptors.bind(studio.providers);
      try {
        studio.config.apiKey = 'configured-studio-key';
        studio.providers.descriptors = () => [
          ...originalDescriptors(),
          { ...originalDescriptors()[0]!, key: 'paid-test', label: 'Paid test provider', offline: false },
        ];
        const res = await uploadRoute(
          new Request('http://localhost/api/projects/security-test/assets/upload', {
            method: 'POST',
            headers: { 'X-Studio-Key': 'configured-studio-key' },
          }),
          { params: Promise.resolve({ slug: projectSlug }) },
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe('VALIDATION_FAILED');
      } finally {
        studio.config.apiKey = originalKey;
        studio.providers.descriptors = originalDescriptors;
      }
    });

    it('does not accept a browser session cookie as REST authorization', async () => {
      const studio = getStudio();
      const originalKey = studio.config.apiKey;
      try {
        studio.config.apiKey = 'configured-studio-key';
        const token = issueStudioSession('configured-studio-key', 'configured-studio-key');
        const res = await uploadRoute(
          new Request('http://localhost/api/projects/security-test/assets/upload', {
            method: 'POST',
            headers: { cookie: `${STUDIO_MUTATION_SESSION_COOKIE}=${token}` },
          }),
          { params: Promise.resolve({ slug: projectSlug }) },
        );
        expect(res.status).toBe(401);
        expect((await res.json()).error.code).toBe('UNAUTHORIZED');
      } finally {
        studio.config.apiKey = originalKey;
      }
    });

    it('masks internal stack traces from API responses', async () => {
      const studio = getStudio();
      const originalPut = studio.storage.put;
      const originalKey = studio.config.apiKey;
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        studio.config.apiKey = null;
        studio.storage.put = async () => {
          throw new Error('driver failed at C:\\private\\studio.db while running SELECT secret_token');
        };
        const formData = new FormData();
        formData.append('file', new File([PNG_SIGNATURE], 'safe.png', { type: 'image/png' }));
        formData.append('metadata', JSON.stringify({ kind: 'image', name: 'Safe fixture' }));
        const res = await uploadRoute(
          new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST', body: formData }),
          { params: Promise.resolve({ slug: projectSlug }) },
        );

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error.code).toBe('INTERNAL');
        expect(JSON.stringify(body)).not.toMatch(/private|studio\.db|SELECT|secret_token|stack/i);
        expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/private|studio\.db|SELECT|secret_token|stack/i);
      } finally {
        studio.storage.put = originalPut;
        studio.config.apiKey = originalKey;
        consoleError.mockRestore();
      }
    });
  });

  describe('File Upload Format Validation', () => {
    it('parses multipart metadata safely and returns 400 for malformed JSON', async () => {
      const formData = new FormData();
      const file = new File(['dummy'], 'test.png', { type: 'image/png' });
      formData.append('file', file);
      formData.append('metadata', '{ "broken": json'); // Malformed JSON

      const req = new Request('http://localhost/api/projects/security-test/assets/upload', {
        method: 'POST',
        headers: { 'X-Studio-Key': '' },
        body: formData
      });
      
      const res = await uploadRoute(req, { params: Promise.resolve({ slug: projectSlug }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toMatch(/valid JSON/);
    });

    it('validates PNG magic bytes', async () => {
      const formData = new FormData();
      const fakePng = new Uint8Array([0x66, 0x61, 0x6B, 0x65, 0x00, 0x00, 0x00, 0x00]);
      const file = new File([fakePng], 'fake.png', { type: 'image/png' });
      formData.append('file', file);
      const req = new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST', headers: { 'X-Studio-Key': '' }, body: formData });
      const res = await uploadRoute(req, { params: Promise.resolve({ slug: projectSlug }) });
      expect(res.status).toBe(400);
    });

    it('validates JPEG magic bytes', async () => {
      const formData = new FormData();
      const fakeJpg = new Uint8Array([0x66, 0x61, 0x6B, 0x65]);
      const file = new File([fakeJpg], 'fake.jpg', { type: 'image/jpeg' });
      formData.append('file', file);
      const req = new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST', headers: { 'X-Studio-Key': '' }, body: formData });
      const res = await uploadRoute(req, { params: Promise.resolve({ slug: projectSlug }) });
      expect(res.status).toBe(400);
    });

    it('validates WEBP magic bytes', async () => {
      const formData = new FormData();
      const fakeWebp = new Uint8Array([0x66, 0x61, 0x6B, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const file = new File([fakeWebp], 'fake.webp', { type: 'image/webp' });
      formData.append('file', file);
      const req = new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST', headers: { 'X-Studio-Key': '' }, body: formData });
      const res = await uploadRoute(req, { params: Promise.resolve({ slug: projectSlug }) });
      expect(res.status).toBe(400);
    });

    it('validates WAV magic bytes', async () => {
      const formData = new FormData();
      const fakeWav = new Uint8Array([0x66, 0x61, 0x6B, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const file = new File([fakeWav], 'fake.wav', { type: 'audio/wav' });
      formData.append('file', file);
      const req = new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST', headers: { 'X-Studio-Key': '' }, body: formData });
      const res = await uploadRoute(req, { params: Promise.resolve({ slug: projectSlug }) });
      expect(res.status).toBe(400);
    });

    it('validates MP4 ftyp box signature', async () => {
      const formData = new FormData();
      const fakeMp4 = new Uint8Array([0x66, 0x61, 0x6B, 0x65, 0x00, 0x00, 0x00, 0x00]);
      const file = new File([fakeMp4], 'fake.mp4', { type: 'video/mp4' });
      formData.append('file', file);
      const req = new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST', headers: { 'X-Studio-Key': '' }, body: formData });
      const res = await uploadRoute(req, { params: Promise.resolve({ slug: projectSlug }) });
      expect(res.status).toBe(400);
    });

    it('validates WEBM EBML header signature', async () => {
      const formData = new FormData();
      const fakeWebm = new Uint8Array([0x66, 0x61, 0x6B, 0x65]);
      const file = new File([fakeWebm], 'fake.webm', { type: 'video/webm' });
      formData.append('file', file);
      const req = new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST', headers: { 'X-Studio-Key': '' }, body: formData });
      const res = await uploadRoute(req, { params: Promise.resolve({ slug: projectSlug }) });
      expect(res.status).toBe(400);
    });

    it('validates MP3 ID3v2 or ADTS frame signature', async () => {
      const formData = new FormData();
      const fakeMp3 = new Uint8Array([0x66, 0x61, 0x6B, 0x65]);
      const file = new File([fakeMp3], 'fake.mp3', { type: 'audio/mpeg' });
      formData.append('file', file);
      const req = new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST', headers: { 'X-Studio-Key': '' }, body: formData });
      const res = await uploadRoute(req, { params: Promise.resolve({ slug: projectSlug }) });
      expect(res.status).toBe(400);
    });

    it('validates SVG as XML text and blocks obvious script tags', async () => {
      const formData = new FormData();
      const maliciousSvg = '<svg><script>alert(1)</script></svg>';
      const file = new File([maliciousSvg], 'bad.svg', { type: 'image/svg+xml' });
      formData.append('file', file);

      const req = new Request('http://localhost/api/projects/security-test/assets/upload', {
        method: 'POST',
        headers: { 'X-Studio-Key': '' },
        body: formData
      });
      
      const res = await uploadRoute(req, { params: Promise.resolve({ slug: projectSlug }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toMatch(/<script> tag/);
    });

    it('rejects a filename extension that disagrees with the declared MIME and signature', async () => {
      const formData = new FormData();
      formData.append('file', new File([PNG_SIGNATURE], 'disguised.mp4', { type: 'image/png' }));
      const res = await uploadRoute(
        new Request('http://localhost/api/projects/security-test/assets/upload', { method: 'POST', body: formData }),
        { params: Promise.resolve({ slug: projectSlug }) },
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toMatch(/extension/i);
    });
  });

  describe('Size Limits', () => {
    it('rejects an oversized multipart request before parsing its body', async () => {
      const res = await uploadRoute(
        new Request('http://localhost/api/projects/security-test/assets/upload', {
          method: 'POST',
          headers: {
            'content-type': 'multipart/form-data; boundary=fixture',
            'content-length': String(52 * 1024 * 1024),
          },
          body: '--fixture--',
        }),
        { params: Promise.resolve({ slug: projectSlug }) },
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toMatch(/Multipart request exceeds/);
    });

    it('applies a 50 MB size limit to manual uploads', async () => {
      const studio = getStudio();
      const assetService = createAssetService(studio);
      await expect(assetService.upload(projectSlug, { kind: 'image', name: 'huge' }, {
        fileName: 'huge.png',
        mimeType: 'image/png',
        data: Buffer.alloc(51 * 1024 * 1024)
      })).rejects.toThrow(/limit is 52428800/);
    });

    it('applies a 50 MB size limit to provider-returned artifacts', async () => {
      const studio = getStudio();
      const assetService = createAssetService(studio);
      const project = await studio.projects.bySlug(projectSlug);
      
      await expect(assetService.storeGenerationArtifacts({
        project: project!,
        generation: generationFixture(project!.id),
        shotCode: null,
        sceneId: null,
        artifacts: [{ filename: 'huge.png', mimeType: 'image/png', data: Buffer.alloc(51 * 1024 * 1024) }]
      })).rejects.toThrow(/limit is 52428800/);
    });

    it('rejects a provider artifact whose extension disagrees with its MIME and signature', async () => {
      const studio = getStudio();
      const assetService = createAssetService(studio);
      const project = await studio.projects.bySlug(projectSlug);

      await expect(assetService.storeGenerationArtifacts({
        project: project!,
        generation: generationFixture(project!.id),
        shotCode: null,
        sceneId: null,
        artifacts: [{ filename: 'disguised.mp4', mimeType: 'image/png', data: Buffer.from(PNG_SIGNATURE) }],
      })).rejects.toThrow(/extension/i);
    });
  });

  describe('Safe Serving Policy for Active Formats', () => {
    it('serves SVG files with restrictive Content-Security-Policy headers', async () => {
      const studio = getStudio();
      // Directly put a valid SVG to test serving
      const validSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
      const stored = await studio.storage.put('projects/security-test/test.svg', validSvg, 'image/svg+xml');

      const req = new Request('http://localhost/api/files/projects/security-test/test.svg');
      const res = await filesRoute(req, { params: Promise.resolve({ key: ['projects', projectSlug, 'test.svg'] }) });
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });
});
