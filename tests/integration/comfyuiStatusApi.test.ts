import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GET } from '@/app/api/providers/comfyui/status/route';

// Mock the registry reader
vi.mock('@/infrastructure/providers/registry', () => ({
  readRegistryOptions: vi.fn(),
}));

import { readRegistryOptions } from '@/infrastructure/providers/registry';

describe('ComfyUI Status API (TASK-011B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('ComfyUI is completely unconfigured', async () => {
    vi.mocked(readRegistryOptions).mockReturnValue({
      defaults: { text: 'mock', image: 'mock', video: 'mock', voice: 'mock', music: 'mock', sound: 'mock' },
      google: null,
      comfyui: null,
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe('unconfigured');
  });

  it('ComfyUI is configured and running normally', async () => {
    vi.mocked(readRegistryOptions).mockReturnValue({
      defaults: { text: 'mock', image: 'mock', video: 'mock', voice: 'mock', music: 'mock', sound: 'mock' },
      google: null,
      comfyui: { baseUrl: 'http://127.0.0.1:8188', imageModel: 'test-model.safetensors', pollIntervalMs: 1000, jobTimeoutMs: 600000 },
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe('ready');
    expect(json.model).toBe('test-model.safetensors');
  });

  it('ComfyUI is configured but unreachable', async () => {
    vi.mocked(readRegistryOptions).mockReturnValue({
      defaults: { text: 'mock', image: 'mock', video: 'mock', voice: 'mock', music: 'mock', sound: 'mock' },
      google: null,
      comfyui: { baseUrl: 'http://127.0.0.1:8188', imageModel: 'test-model.safetensors', pollIntervalMs: 1000, jobTimeoutMs: 600000 },
    });

    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    global.fetch = vi.fn().mockRejectedValue(
      new Error('Connection refused at http://127.0.0.1:8188 from C:\\private\\operator'),
    );

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe('unreachable');
    expect(json.error).toBe('Could not reach ComfyUI. Start it and verify the configured local endpoint.');
    expect(json).not.toHaveProperty('details');
    expect(JSON.stringify(json)).not.toContain('127.0.0.1');
    expect(JSON.stringify(json)).not.toContain('private');
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('keeps environment access out of the app route', async () => {
    const source = await readFile(
      'src/app/api/providers/comfyui/status/route.ts',
      'utf8',
    );
    const componentSource = await readFile('src/components/ComfyUiStatus.tsx', 'utf8');

    expect(source).not.toContain('process.env');
    expect(source).not.toContain('readRegistryOptions');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(componentSource).not.toContain('details');
    expect(componentSource).not.toMatch(/catch\s*\([^)]/);
    expect(componentSource).toContain('comfyUiStatusResponseSchema.safeParse');
    expect(componentSource).toContain('role="status"');
    expect(componentSource).toContain('role="alert"');
  });

  it('refuses a non-loopback status target without sending a request', async () => {
    vi.mocked(readRegistryOptions).mockReturnValue({
      defaults: { text: 'mock', image: 'mock', video: 'mock', voice: 'mock', music: 'mock', sound: 'mock' },
      google: null,
      comfyui: { baseUrl: 'http://169.254.169.254', imageModel: 'model.safetensors', pollIntervalMs: 1000, jobTimeoutMs: 600000 },
    });
    global.fetch = vi.fn();

    const response = await GET();
    const json = await response.json();

    expect(json).toMatchObject({ status: 'unreachable' });
    expect(JSON.stringify(json)).not.toContain('169.254.169.254');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses redirects and exposes only a safe checkpoint label', async () => {
    vi.mocked(readRegistryOptions).mockReturnValue({
      defaults: { text: 'mock', image: 'mock', video: 'mock', voice: 'mock', music: 'mock', sound: 'mock' },
      google: null,
      comfyui: { baseUrl: 'http://127.0.0.1:8188', imageModel: 'C:\\private\\model.safetensors', pollIntervalMs: 1000, jobTimeoutMs: 600000 },
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
    );

    const response = await GET();
    const json = await response.json();

    expect(json).toEqual({
      status: 'unreachable',
      error: 'Could not reach ComfyUI. Start it and verify the configured local endpoint.',
      model: 'model.safetensors',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8188/system_stats',
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(JSON.stringify(json)).not.toContain('private');
    expect(JSON.stringify(json)).not.toContain('169.254.169.254');
  });
});
