import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageRequest } from '@/application/ports';
import { estimateCostUsd } from '@/domain/cost';
import { ComfyUiImageProvider, type ComfyUiConfig } from '@/infrastructure/providers/comfyuiProvider';
import { DefaultProviderRegistry, readRegistryOptions } from '@/infrastructure/providers/registry';
import { ProviderError } from '@/infrastructure/providers/retry';

const CONFIG: ComfyUiConfig = {
  baseUrl: 'http://127.0.0.1:8188',
  imageModel: 'test-sd15-checkpoint.safetensors',
  pollIntervalMs: 1,
  jobTimeoutMs: 250,
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function imageRequest(overrides: Partial<ImageRequest> = {}): ImageRequest {
  return {
    prompt: 'a small paper lantern on a stone table',
    negativePrompt: 'watermark, text',
    model: CONFIG.imageModel,
    aspectRatio: '1:1',
    count: 1,
    seed: 42,
    referenceFiles: [],
    params: { steps: 4, cfg: 5, samplerName: 'euler', scheduler: 'normal' },
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function expectProviderError(promise: Promise<unknown>, code: string): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    const providerError = error as ProviderError;
    expect(providerError.failure.code).toBe(code);
    return providerError;
  }
  throw new Error(`Expected ProviderError ${code}`);
}

describe('ComfyUI image provider — local workflow experiment', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits, completes, downloads and returns one image from a core-node workflow', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { prompt_id: 'prompt-1', number: 1, node_errors: {} }))
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          'prompt-1': {
            status: { completed: true, status_str: 'success' },
            outputs: { '9': { images: [{ filename: 'studio_00001_.png', subfolder: '', type: 'output' }] } },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }));

    const result = await new ComfyUiImageProvider(CONFIG).generateImage(imageRequest());

    expect(result.actualCostUsd).toBe(0);
    expect(result.modelUsed).toBe(CONFIG.imageModel);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({ filename: 'studio_00001_.png', mimeType: 'image/png', width: 512, height: 512 });
    expect(result.artifacts[0]?.data).toEqual(Buffer.from(PNG));
    expect(result.raw).toMatchObject({ promptId: 'prompt-1', outputNodeId: '9', filename: 'studio_00001_.png' });
    expect(JSON.stringify(result.raw)).not.toContain(imageRequest().prompt);

    const submit = fetchMock.mock.calls[0];
    expect(submit?.[0]).toBe('http://127.0.0.1:8188/prompt');
    const payload = JSON.parse(String((submit?.[1] as RequestInit).body)) as { prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }> };
    expect(payload.prompt['4']?.inputs.ckpt_name).toBe(CONFIG.imageModel);
    expect(payload.prompt['6']?.inputs.text).toBe(imageRequest().prompt);
    expect(payload.prompt['7']?.inputs.text).toBe(imageRequest().negativePrompt);
    expect(payload.prompt['3']?.inputs.seed).toBe(42);
    expect(Object.values(payload.prompt).map((node) => node.class_type)).toEqual(
      expect.arrayContaining(['CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage']),
    );
  });

  it('rejects a malformed submit or history response as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { prompt_id: 123 }));
    await expectProviderError(new ComfyUiImageProvider(CONFIG).generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { prompt_id: 'prompt-bad-history', number: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { 'prompt-bad-history': { status: 'wrong', outputs: [] } }));
    await expectProviderError(new ComfyUiImageProvider(CONFIG).generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('rejects image MIME, filename and magic-byte mismatches before returning an artifact', async () => {
    const completed = (filename: string): Response =>
      jsonResponse(200, {
        'prompt-invalid-image': {
          status: { completed: true, status_str: 'success' },
          outputs: { '9': { images: [{ filename, subfolder: '', type: 'output' }] } },
        },
      });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { prompt_id: 'prompt-invalid-image', number: 1 }))
      .mockResolvedValueOnce(completed('fake.png'))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }));
    await expectProviderError(new ComfyUiImageProvider(CONFIG).generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { prompt_id: 'prompt-invalid-image', number: 2 }))
      .mockResolvedValueOnce(completed('image.txt'))
      .mockResolvedValueOnce(new Response(PNG, { headers: { 'content-type': 'image/png' } }));
    await expectProviderError(new ComfyUiImageProvider(CONFIG).generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('treats a ComfyUI workflow validation error as terminal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: { type: 'prompt_outputs_failed_validation' }, node_errors: { '4': { errors: [] } } }));

    const error = await expectProviderError(
      new ComfyUiImageProvider(CONFIG).generateImage(imageRequest()),
      'PROVIDER_VALIDATION',
    );
    expect(error.failure.errorClass).toBe('validation');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns stable unavailable and timeout failures without prompt leakage', async () => {
    fetchMock.mockRejectedValueOnce(new Error(`private transport detail: ${imageRequest().prompt}`));
    const unavailable = await expectProviderError(
      new ComfyUiImageProvider(CONFIG).generateImage(imageRequest()),
      'PROVIDER_UNAVAILABLE',
    );
    expect(unavailable.message).not.toContain(imageRequest().prompt);

    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('private timeout diagnostic')), { once: true });
      }),
    );
    try {
      const timedOut = expectProviderError(
        new ComfyUiImageProvider({ ...CONFIG, jobTimeoutMs: 25 }).generateImage(imageRequest()),
        'PROVIDER_TIMEOUT',
      );
      await vi.advanceTimersByTimeAsync(26);
      expect((await timedOut).message).not.toContain('private timeout diagnostic');
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses ComfyUI redirects without following a non-loopback target', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
    );

    await expectProviderError(new ComfyUiImageProvider(CONFIG).generateImage(imageRequest()), 'PROVIDER_UNTRUSTED_URL');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).redirect).toBe('manual');
  });

  it('rejects invalid sampling parameters before submit', async () => {
    await expectProviderError(
      new ComfyUiImageProvider(CONFIG).generateImage(imageRequest({ params: { steps: 500 } })),
      'PROVIDER_VALIDATION',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts studio-side polling promptly without submitting another request', async () => {
    // Waits for the real precondition (both fetch calls done, provider now inside its
    // poll wait) instead of racing an arbitrary real timer against a real 10s wait — the
    // previous version raced a real 5ms setTimeout against it, a wall-clock-reliance
    // flake source under CPU contention per .claude/rules/08-testing.md SS7. Polling via
    // vi.waitFor for an actual condition removes the race entirely, matching the
    // established idiom in the "maps aborts during streamed history and image bodies"
    // test below (also in this file).
    const controller = new AbortController();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { prompt_id: 'prompt-abort', number: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, {}));

    const promise = new ComfyUiImageProvider({ ...CONFIG, pollIntervalMs: 10_000 }).generateImage(
      imageRequest({ signal: controller.signal }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    controller.abort();

    await expectProviderError(promise, 'CANCELLED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps aborts during streamed history and image bodies to terminal cancellation', async () => {
    const stalledResponse = (signal: AbortSignal): Response =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{'));
            signal.addEventListener('abort', () => controller.error(new Error('private stream detail')), { once: true });
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const historyAbort = new AbortController();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { prompt_id: 'prompt-history-abort', number: 1 }))
      .mockImplementationOnce((_url: string, init: RequestInit) => stalledResponse(init.signal as AbortSignal));
    const historyPromise = new ComfyUiImageProvider(CONFIG).generateImage(imageRequest({ signal: historyAbort.signal }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    historyAbort.abort();
    const historyError = await expectProviderError(historyPromise, 'CANCELLED');
    expect(historyError.failure.errorClass).toBe('fatal');

    fetchMock.mockReset();
    const imageAbort = new AbortController();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { prompt_id: 'prompt-image-abort', number: 1 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          'prompt-image-abort': {
            status: { completed: true, status_str: 'success' },
            outputs: { '9': { images: [{ filename: 'pending.png', subfolder: '', type: 'output' }] } },
          },
        }),
      )
      .mockImplementationOnce((_url: string, init: RequestInit) => stalledResponse(init.signal as AbortSignal));
    const imagePromise = new ComfyUiImageProvider(CONFIG).generateImage(imageRequest({ signal: imageAbort.signal }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    imageAbort.abort();
    const imageError = await expectProviderError(imagePromise, 'CANCELLED');
    expect(imageError.failure.errorClass).toBe('fatal');
  });

  it('rejects unsupported aspect ratios and reference images before submit', async () => {
    const provider = new ComfyUiImageProvider(CONFIG);
    await expectProviderError(provider.generateImage(imageRequest({ aspectRatio: '16:9' })), 'UNSUPPORTED_CAPABILITY');
    await expectProviderError(
      provider.generateImage(imageRequest({ referenceFiles: [{ mimeType: 'image/png', data: Buffer.from(PNG) }] })),
      'UNSUPPORTED_CAPABILITY',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registers explicitly at zero cost while mock remains the unconfigured default', () => {
    const unconfigured = new DefaultProviderRegistry(readRegistryOptions({}));
    expect(unconfigured.defaultKeyFor('image')).toBe('mock');
    expect(unconfigured.descriptors().map((item) => item.key)).toEqual(['mock']);

    const configured = new DefaultProviderRegistry(
      readRegistryOptions({
        AI_IMAGE_PROVIDER: 'comfyui',
        COMFYUI_BASE_URL: CONFIG.baseUrl,
        COMFYUI_IMAGE_MODEL: CONFIG.imageModel,
      }),
    );
    expect(configured.defaultKeyFor('image')).toBe('comfyui');
    expect(configured.image().descriptor.key).toBe('comfyui');
    expect(configured.defaultModelFor('image')).toBe(CONFIG.imageModel);
    expect(estimateCostUsd({ provider: 'comfyui', kind: 'image', count: 4 })).toBe(0);
  });

  it('refuses non-loopback ComfyUI endpoints for the local experiment', () => {
    expect(
      () =>
        new DefaultProviderRegistry(
          readRegistryOptions({ COMFYUI_BASE_URL: 'http://192.168.1.50:8188', COMFYUI_IMAGE_MODEL: CONFIG.imageModel }),
        ),
    ).toThrow(/loopback/i);
  });
});
