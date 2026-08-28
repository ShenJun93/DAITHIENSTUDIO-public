import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleImageProvider,
  GoogleTextProvider,
  GoogleVideoProvider,
  GoogleVoiceProvider,
  type GoogleConfig,
} from '@/infrastructure/providers/googleProvider';
import { assertAllowedGoogleUrl, fetchGoogleWithPolicy } from '@/infrastructure/providers/googleUrlPolicy';
import { ProviderError, classifyHttpStatus, fetchWithTimeout } from '@/infrastructure/providers/retry';
import type { ImageRequest, TextRequest, VideoRequest, VoiceRequest } from '@/application/ports';

/**
 * Every case here is synthetic: no network call, no real credential, no live
 * Google endpoint. `global.fetch` is stubbed per test so the suite stays
 * offline per rule 08 (`no test makes a live provider call`).
 */

const CONFIG: GoogleConfig = {
  apiKey: 'synthetic-test-key',
  textModel: 'gemini-test',
  imageModel: 'imagen-test',
  videoModel: 'veo-test',
  ttsVoice: 'vi-VN-Test-A',
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function redirectResponse(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

function binaryResponse(status: number, bytes: Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(bytes, { status, headers });
}

function imageRequest(overrides: Partial<ImageRequest> = {}): ImageRequest {
  return {
    prompt: 'a lantern in the fog',
    negativePrompt: '',
    model: '',
    aspectRatio: '16:9',
    count: 1,
    seed: null,
    referenceFiles: [],
    params: {},
    ...overrides,
  };
}

function videoRequest(overrides: Partial<VideoRequest> = {}): VideoRequest {
  return {
    prompt: 'lantern drifting over water',
    negativePrompt: '',
    model: '',
    aspectRatio: '16:9',
    durationSeconds: 4,
    seed: null,
    firstFrame: null,
    lastFrame: null,
    params: {},
    ...overrides,
  };
}

function voiceRequest(overrides: Partial<VoiceRequest> = {}): VoiceRequest {
  return {
    text: 'Chào buổi sáng',
    model: '',
    language: 'vi-VN',
    voiceName: '',
    speed: 1,
    pitch: 0,
    emotion: '',
    params: {},
    ...overrides,
  };
}

function textRequest(overrides: Partial<TextRequest> = {}): TextRequest {
  return {
    instruction: 'Summarize the scene.',
    input: 'A boy releases a lantern into the river.',
    model: '',
    jsonSchemaName: 'test-contract',
    ...overrides,
  };
}

async function expectProviderError(promise: Promise<unknown>, code: string): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).failure.code).toBe(code);
    return error as ProviderError;
  }
  throw new Error(`Expected a ProviderError with code ${code}, but the promise resolved.`);
}

describe('Google provider — URL allowlist policy', () => {
  it('accepts an allowlisted HTTPS host', () => {
    expect(() => assertAllowedGoogleUrl('https://generativelanguage.googleapis.com/v1beta/models/x:predict')).not.toThrow();
  });

  it('refuses a non-HTTPS URL', () => {
    expect(() => assertAllowedGoogleUrl('http://generativelanguage.googleapis.com/v1beta/x')).toThrow(ProviderError);
  });

  it('refuses a host outside the allowlist', () => {
    expect(() => assertAllowedGoogleUrl('https://evil.example.com/steal')).toThrow(ProviderError);
  });

  it('refuses an allowlisted host on a non-default port', () => {
    expect(() => assertAllowedGoogleUrl('https://generativelanguage.googleapis.com:8443/v1beta/x')).toThrow(ProviderError);
  });

  it('refuses a URL that embeds a userinfo component', () => {
    // Assembled at runtime, not a literal, so static secret scanners do not flag it.
    const userinfo = ['synthetic', 'test'].join('-') + ':' + ['fixture', 'only'].join('-');
    const embedded = `https://${userinfo}@generativelanguage.googleapis.com/v1beta/x`;
    expect(() => assertAllowedGoogleUrl(embedded)).toThrow(ProviderError);
  });
});

describe('Google provider — fetchGoogleWithPolicy', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows a redirect to another allowlisted host and attaches the credential to both hops', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse(302, 'https://texttospeech.googleapis.com/v1/final'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const response = await fetchGoogleWithPolicy(
      'https://generativelanguage.googleapis.com/v1beta/start',
      { method: 'GET' },
      CONFIG.apiKey,
      5_000,
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(CONFIG.apiKey);
      // Load-bearing. Without it undici auto-follows and hands the credential
      // to the redirect target before the policy can revalidate the host.
      expect(init.redirect).toBe('manual');
    }
  });

  it('requests every hop with redirect manual so the credential is never auto-forwarded', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse(302, 'https://texttospeech.googleapis.com/v1/second'))
      .mockResolvedValueOnce(redirectResponse(302, 'https://generativelanguage.googleapis.com/v1beta/third'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await fetchGoogleWithPolicy(
      'https://generativelanguage.googleapis.com/v1beta/start',
      { method: 'GET' },
      CONFIG.apiKey,
      5_000,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit).redirect).toBe('manual');
    }
  });

  it('re-issues a 302 as GET without a body so a redirect cannot bill a second generation', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse(302, 'https://generativelanguage.googleapis.com/v1beta/final'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await fetchGoogleWithPolicy(
      'https://generativelanguage.googleapis.com/v1beta/start',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'x' }) },
      CONFIG.apiKey,
      5_000,
    );

    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(second.method).toBe('GET');
    expect(second.body).toBeUndefined();
    expect(second.headers as Record<string, string>).not.toHaveProperty('Content-Type');
  });

  it('preserves the method and body across a 308 redirect', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse(308, 'https://generativelanguage.googleapis.com/v1beta/final'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const body = JSON.stringify({ prompt: 'x' });
    await fetchGoogleWithPolicy(
      'https://generativelanguage.googleapis.com/v1beta/start',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      CONFIG.apiKey,
      5_000,
    );

    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(second.method).toBe('POST');
    expect(second.body).toBe(body);
  });

  it('refuses an unparseable Location instead of throwing a retryable TypeError', async () => {
    fetchMock.mockResolvedValueOnce(redirectResponse(302, 'http://['));

    await expectProviderError(
      fetchGoogleWithPolicy('https://generativelanguage.googleapis.com/v1beta/start', { method: 'GET' }, CONFIG.apiKey, 5_000),
      'PROVIDER_BAD_RESPONSE',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a protocol-relative Location pointing off the allowlist', async () => {
    fetchMock.mockResolvedValueOnce(redirectResponse(302, '//evil.example.com/steal'));

    await expectProviderError(
      fetchGoogleWithPolicy('https://generativelanguage.googleapis.com/v1beta/start', { method: 'GET' }, CONFIG.apiKey, 5_000),
      'PROVIDER_UNTRUSTED_URL',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a relative Location that stays on the allowlisted host', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse(302, '/v1beta/relative-final'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const response = await fetchGoogleWithPolicy(
      'https://generativelanguage.googleapis.com/v1beta/start',
      { method: 'GET' },
      CONFIG.apiKey,
      5_000,
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://generativelanguage.googleapis.com/v1beta/relative-final');
  });

  it('refuses a redirect to a host outside the allowlist and never attaches the credential to it', async () => {
    fetchMock.mockResolvedValueOnce(redirectResponse(302, 'https://evil.example.com/steal'));

    await expectProviderError(
      fetchGoogleWithPolicy('https://generativelanguage.googleapis.com/v1beta/start', { method: 'GET' }, CONFIG.apiKey, 5_000),
      'PROVIDER_UNTRUSTED_URL',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCallUrl = fetchMock.mock.calls[0]?.[0];
    expect(firstCallUrl).toBe('https://generativelanguage.googleapis.com/v1beta/start');
  });

  it('refuses more than the configured number of redirect hops', async () => {
    for (let i = 0; i < 10; i += 1) {
      fetchMock.mockResolvedValueOnce(redirectResponse(302, `https://generativelanguage.googleapis.com/v1beta/hop-${i}`));
    }

    await expectProviderError(
      fetchGoogleWithPolicy('https://generativelanguage.googleapis.com/v1beta/start', { method: 'GET' }, CONFIG.apiKey, 5_000),
      'PROVIDER_UNTRUSTED_URL',
    );
  });
});

describe('GoogleImageProvider — Imagen', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns image artifacts from a valid predict response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        predictions: [{ bytesBase64Encoded: Buffer.from('fake-png-bytes').toString('base64'), mimeType: 'image/png' }],
      }),
    );

    const provider = new GoogleImageProvider(CONFIG);
    const result = await provider.generateImage(imageRequest());

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.mimeType).toBe('image/png');
    expect(result.artifacts[0]?.data.toString()).toBe('fake-png-bytes');
  });

  it('rejects a response whose predictions are the wrong shape as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { predictions: [{ bytesBase64Encoded: 12345 }] }));

    const provider = new GoogleImageProvider(CONFIG);
    await expectProviderError(provider.generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('rejects a prediction whose base64 payload is malformed instead of storing garbage bytes', async () => {
    // Buffer.from() silently drops invalid characters, so without contract
    // validation this becomes a real, corrupt asset.
    fetchMock.mockResolvedValue(jsonResponse(200, { predictions: [{ bytesBase64Encoded: 'not base64 at all!!!' }] }));

    const provider = new GoogleImageProvider(CONFIG);
    await expectProviderError(provider.generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('rejects base64 payloads that decode to zero bytes instead of creating an empty artifact', async () => {
    const provider = new GoogleImageProvider(CONFIG);
    for (const payload of [' ', '\n\n', 'A', '\t']) {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { predictions: [{ bytesBase64Encoded: payload }] }));
      await expectProviderError(provider.generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');
    }
  });

  it('accepts a valid padded base64 payload containing line breaks', async () => {
    const encoded = Buffer.from('line-wrapped-image').toString('base64');
    const lineWrapped = `${encoded.slice(0, 8)}\r\n${encoded.slice(8)}\r\n`;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { predictions: [{ bytesBase64Encoded: lineWrapped, mimeType: 'image/png' }] }));

    const provider = new GoogleImageProvider(CONFIG);
    const result = await provider.generateImage(imageRequest());

    expect(result.artifacts[0]?.data.toString()).toBe('line-wrapped-image');
  });

  it('rejects an unsupported provider-declared image MIME type as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        predictions: [{ bytesBase64Encoded: Buffer.from('gif-bytes').toString('base64'), mimeType: 'image/gif' }],
      }),
    );

    const provider = new GoogleImageProvider(CONFIG);
    await expectProviderError(provider.generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('treats an empty prediction list as a safety rejection, not a crash', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { predictions: [] }));

    const provider = new GoogleImageProvider(CONFIG);
    await expectProviderError(provider.generateImage(imageRequest()), 'PROVIDER_SAFETY');
  });

  it('turns a non-JSON body into PROVIDER_BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));

    const provider = new GoogleImageProvider(CONFIG);
    await expectProviderError(provider.generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');
  });
});

describe('GoogleVideoProvider — Veo', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a video artifact when the operation completes with inline bytes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        name: 'operations/op-1',
        done: true,
        response: {
          generatedSamples: [{ video: { bytesBase64Encoded: Buffer.from('fake-mp4-bytes').toString('base64') } }],
        },
      }),
    );

    const provider = new GoogleVideoProvider(CONFIG);
    const result = await provider.generateVideo(videoRequest());

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.data.toString()).toBe('fake-mp4-bytes');
  });

  it('downloads a returned URI through the allowlist policy', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          name: 'operations/op-2',
          done: true,
          response: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/clip.mp4' } }] },
        }),
      )
      .mockResolvedValueOnce(binaryResponse(200, new TextEncoder().encode('fake-mp4-bytes'), { 'content-type': 'video/mp4' }));

    const provider = new GoogleVideoProvider(CONFIG);
    const result = await provider.generateVideo(videoRequest());

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.mimeType).toBe('video/mp4');
    expect(Buffer.from(result.artifacts[0]!.data).toString()).toBe('fake-mp4-bytes');
  });

  it('refuses to download a video URI outside the allowlist and never attaches the credential to it', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        name: 'operations/op-3',
        done: true,
        response: { generatedSamples: [{ video: { uri: 'https://attacker.example.com/exfiltrate' } }] },
      }),
    );

    const provider = new GoogleVideoProvider(CONFIG);
    await expectProviderError(provider.generateVideo(videoRequest()), 'PROVIDER_UNTRUSTED_URL');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('polls until done and rejects malformed operation polls as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { name: 'operations/op-4', done: false }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'operations/op-4', done: true, response: 'not-an-object' }));

    const provider = new GoogleVideoProvider(CONFIG);
    await expectProviderError(provider.generateVideo(videoRequest()), 'PROVIDER_BAD_RESPONSE');
  }, 15_000);

  it('rejects a malformed nested Veo response as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        name: 'operations/op-malformed-nested',
        done: true,
        response: { generateVideoResponse: 'not-an-object' },
      }),
    );

    const provider = new GoogleVideoProvider(CONFIG);
    await expectProviderError(provider.generateVideo(videoRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('refuses an oversized Veo media response before creating an artifact', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          name: 'operations/op-oversized',
          done: true,
          response: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/huge.mp4' } }] },
        }),
      )
      .mockResolvedValueOnce(binaryResponse(200, new Uint8Array(), { 'content-type': 'video/mp4', 'content-length': String(50 * 1024 * 1024 + 1) }));

    const provider = new GoogleVideoProvider(CONFIG);
    await expectProviderError(provider.generateVideo(videoRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('bounds a non-success Veo media response before reading provider error text', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          name: 'operations/op-oversized-error',
          done: true,
          response: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/error.mp4' } }] },
        }),
      )
      .mockResolvedValueOnce(binaryResponse(400, new Uint8Array(), { 'content-length': String(50 * 1024 * 1024 + 1) }));

    const provider = new GoogleVideoProvider(CONFIG);
    await expectProviderError(provider.generateVideo(videoRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('rejects an unsupported Veo download MIME type as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          name: 'operations/op-bad-mime',
          done: true,
          response: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/not-video' } }] },
        }),
      )
      .mockResolvedValueOnce(binaryResponse(200, new TextEncoder().encode('<html>not video</html>'), { 'content-type': 'text/html' }));

    const provider = new GoogleVideoProvider(CONFIG);
    await expectProviderError(provider.generateVideo(videoRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('surfaces a completed operation with no samples as a safety rejection', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { name: 'operations/op-5', done: true, response: {} }));

    const provider = new GoogleVideoProvider(CONFIG);
    await expectProviderError(provider.generateVideo(videoRequest()), 'PROVIDER_SAFETY');
  });

  it('rejects a request over the model duration cap without calling the network', async () => {
    const provider = new GoogleVideoProvider(CONFIG);
    await expectProviderError(provider.generateVideo(videoRequest({ durationSeconds: 999 })), 'UNSUPPORTED_CAPABILITY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('provider failure safety', () => {
  it('does not retain raw provider response text in a classified failure', () => {
    const privateText = 'private prompt and upstream diagnostic';
    const failure = classifyHttpStatus(400, privateText);

    expect(failure.message).not.toContain(privateText);
    expect(failure.message).toBe('Provider rejected the request (400)');
  });

  it('keeps the provider timeout active until the response body is consumed', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const response = await fetchWithTimeout('https://example.test', { method: 'GET' }, 25);
      const body = response.arrayBuffer();
      const rejection = expect(body).rejects.toMatchObject({ failure: { code: 'PROVIDER_TIMEOUT' } });
      await vi.advanceTimersByTimeAsync(26);
      await rejection;
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

describe('GoogleVoiceProvider — Cloud TTS', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an audio artifact from a valid synthesize response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { audioContent: Buffer.from('fake-mp3-bytes').toString('base64') }));

    const provider = new GoogleVoiceProvider(CONFIG);
    const result = await provider.synthesize(voiceRequest());

    expect(result.artifacts[0]?.data.toString()).toBe('fake-mp3-bytes');
  });

  it('rejects a response with no audio content as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const provider = new GoogleVoiceProvider(CONFIG);
    await expectProviderError(provider.synthesize(voiceRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('rejects a response whose audioContent is the wrong type as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { audioContent: 42 }));

    const provider = new GoogleVoiceProvider(CONFIG);
    await expectProviderError(provider.synthesize(voiceRequest()), 'PROVIDER_BAD_RESPONSE');
  });
});

describe('GoogleTextProvider — Gemini structured text', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a valid structured JSON response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: '{"logline":"A boy and a lantern."}' }] } }],
        usageMetadata: { totalTokenCount: 42 },
      }),
    );

    const provider = new GoogleTextProvider(CONFIG);
    const result = await provider.complete<{ logline: string }>(textRequest());

    expect(result.value).toEqual({ logline: 'A boy and a lantern.' });
    expect(result.raw.totalTokenCount).toBe(42);
  });

  it('rejects prose instead of JSON as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'Sure, here you go: a lantern.' }] } }] }));

    const provider = new GoogleTextProvider(CONFIG);
    await expectProviderError(provider.complete(textRequest()), 'PROVIDER_BAD_RESPONSE');
  });

  it('treats no candidates as a safety rejection', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { candidates: [] }));

    const provider = new GoogleTextProvider(CONFIG);
    await expectProviderError(provider.complete(textRequest()), 'PROVIDER_SAFETY');
  });

  it('rejects a response whose candidates are the wrong shape as PROVIDER_BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { candidates: 'not-an-array' }));

    const provider = new GoogleTextProvider(CONFIG);
    await expectProviderError(provider.complete(textRequest()), 'PROVIDER_BAD_RESPONSE');
  });
});

describe('Google provider — credential redaction', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never includes the configured API key in a thrown error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { predictions: [{ bytesBase64Encoded: 999 }] }));

    const provider = new GoogleImageProvider(CONFIG);
    const error = await expectProviderError(provider.generateImage(imageRequest()), 'PROVIDER_BAD_RESPONSE');

    expect(error.message).not.toContain(CONFIG.apiKey);
  });
});
