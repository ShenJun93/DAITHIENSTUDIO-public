/**
 * Google AI adapters (Gemini · Imagen · Veo · Cloud Text-to-Speech).
 *
 * Everything provider-specific stops at this file: request mapping, polling,
 * error taxonomy, cost accounting. The application layer only sees the ports.
 *
 * Requires GOOGLE_API_KEY. With no key the registry never constructs these, so
 * the studio still runs on the mock provider (rule: offline and free by default).
 *
 * Every outbound request goes through `fetchGoogleWithPolicy`, which confines
 * the credential to an allowlisted HTTPS host and revalidates every redirect
 * hop before following it. Every response body is parsed through a Zod
 * contract in `googleSchemas.ts` before the application ever sees it; a
 * response that fails the contract becomes `PROVIDER_BAD_RESPONSE` and never
 * produces a partial asset.
 *
 * Model names live in .env (GOOGLE_TEXT_MODEL / GOOGLE_IMAGE_MODEL /
 * GOOGLE_VIDEO_MODEL) because Google renames and deprecates them faster than a
 * release cycle. Verify the current names against
 * https://ai.google.dev/gemini-api/docs before trusting the defaults.
 */
import type {
  ImageProvider,
  ImageRequest,
  ProviderDescriptor,
  ProviderResult,
  TextProvider,
  TextRequest,
  VideoProvider,
  VideoRequest,
  VoiceProvider,
  VoiceRequest,
} from '@/application/ports';
import { estimateCostUsd } from '@/domain/cost';
import { MAX_UPLOAD_BYTES } from '@/domain/fileValidation';
import { GOOGLE_CAPABILITIES } from './capabilities';
import { ProviderError, classifyHttpStatus, withRetry } from './retry';
import { fetchGoogleWithPolicy } from './googleUrlPolicy';
import {
  googleGenerateContentResponseSchema,
  googleImagePredictResponseSchema,
  googleOperationSchema,
  googleTtsResponseSchema,
  googleVideoSamplesSchema,
  parseGoogleResponse,
  type GoogleOperation,
} from './googleSchemas';

const GENERATIVE_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TTS_BASE = 'https://texttospeech.googleapis.com/v1';

const REQUEST_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 600_000;

function badResponse(message: string): never {
  throw new ProviderError({ errorClass: 'fatal', code: 'PROVIDER_BAD_RESPONSE', message });
}

async function readResponseBytes(response: Response, label: string): Promise<Buffer> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) badResponse(`Google ${label} response declared an invalid Content-Length.`);
    if (Number(declaredLength) > MAX_UPLOAD_BYTES) {
      await response.body?.cancel();
      badResponse(`Google ${label} response exceeded the ${MAX_UPLOAD_BYTES}-byte limit.`);
    }
  }

  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        badResponse(`Google ${label} response exceeded the ${MAX_UPLOAD_BYTES}-byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'video/webm') return 'webm';
  if (mimeType === 'video/mp4') return 'mp4';
  return badResponse(`Google returned an unsupported media MIME type (${mimeType}).`);
}

export interface GoogleConfig {
  apiKey: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
  ttsVoice: string;
}

export function googleDescriptor(config: GoogleConfig): ProviderDescriptor {
  return {
    key: 'google',
    label: 'Google AI (Gemini · Imagen · Veo · Cloud TTS)',
    offline: false,
    models: {
      text: [config.textModel],
      image: [config.imageModel],
      video: [config.videoModel],
      voice: [config.ttsVoice],
    },
    capabilities: GOOGLE_CAPABILITIES,
  };
}

async function postJson(url: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchGoogleWithPolicy(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    apiKey,
    REQUEST_TIMEOUT_MS,
    signal,
  );

  const text = (await readResponseBytes(response, 'JSON')).toString('utf8');
  if (!response.ok) {
    throw new ProviderError(classifyHttpStatus(response.status, text));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError({
      errorClass: 'fatal',
      code: 'PROVIDER_BAD_RESPONSE',
      message: 'Google returned a non-JSON body',
    });
  }
}

async function getJson(url: string, apiKey: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchGoogleWithPolicy(url, { method: 'GET' }, apiKey, REQUEST_TIMEOUT_MS, signal);
  const text = (await readResponseBytes(response, 'JSON')).toString('utf8');
  if (!response.ok) throw new ProviderError(classifyHttpStatus(response.status, text));
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError({
      errorClass: 'fatal',
      code: 'PROVIDER_BAD_RESPONSE',
      message: 'Google returned a non-JSON body',
    });
  }
}

// ---------------------------------------------------------------------------
// Imagen — text to image
// ---------------------------------------------------------------------------

export class GoogleImageProvider implements ImageProvider {
  readonly descriptor: ProviderDescriptor;

  constructor(private readonly config: GoogleConfig) {
    this.descriptor = googleDescriptor(config);
  }

  async generateImage(request: ImageRequest): Promise<ProviderResult> {
    if (request.referenceFiles.length > 0 && !this.descriptor.capabilities.referenceImages) {
      throw new ProviderError({
        errorClass: 'validation',
        code: 'UNSUPPORTED_CAPABILITY',
        message: 'This Google image model does not accept reference images. Use the mock provider or a reference-capable model.',
      });
    }

    const model = request.model || this.config.imageModel;
    const url = `${GENERATIVE_BASE}/models/${encodeURIComponent(model)}:predict`;

    const body = {
      instances: [{ prompt: request.prompt }],
      parameters: {
        sampleCount: Math.min(4, Math.max(1, request.count)),
        aspectRatio: request.aspectRatio,
        ...(request.negativePrompt ? { negativePrompt: request.negativePrompt } : {}),
        ...(request.seed !== null ? { seed: request.seed } : {}),
        ...request.params,
      },
    };

    const json = await withRetry(() => postJson(url, this.config.apiKey, body, request.signal), {
      attempts: 3,
      baseDelayMs: 2_000,
      maxDelayMs: 20_000,
      signal: request.signal,
    });

    const parsed = parseGoogleResponse(googleImagePredictResponseSchema, json, 'Imagen predict');
    if (parsed.predictions.length === 0) {
      throw new ProviderError({
        errorClass: 'safety',
        code: 'PROVIDER_SAFETY',
        message: 'Imagen returned no images. This usually means the prompt was filtered.',
      });
    }

    const artifacts = parsed.predictions.flatMap((prediction, index) => {
      const base64 = prediction.bytesBase64Encoded ?? '';
      if (!base64) return [];
      const mimeType = prediction.mimeType ?? 'image/png';
      return [
        {
          filename: `imagen-${Date.now()}-${index + 1}.${extensionForMime(mimeType)}`,
          mimeType,
          data: Buffer.from(base64, 'base64'),
        },
      ];
    });

    if (artifacts.length === 0) {
      throw new ProviderError({
        errorClass: 'fatal',
        code: 'PROVIDER_BAD_RESPONSE',
        message: 'Imagen response contained no image bytes.',
      });
    }

    return {
      artifacts,
      raw: { model, predictionCount: parsed.predictions.length },
      actualCostUsd: estimateCostUsd({ provider: 'google', kind: 'image', count: artifacts.length }),
      modelUsed: model,
    };
  }
}

// ---------------------------------------------------------------------------
// Veo — text/image to video (long-running operation + polling)
// ---------------------------------------------------------------------------

export class GoogleVideoProvider implements VideoProvider {
  readonly descriptor: ProviderDescriptor;

  constructor(private readonly config: GoogleConfig) {
    this.descriptor = googleDescriptor(config);
  }

  async generateVideo(request: VideoRequest): Promise<ProviderResult> {
    const model = request.model || this.config.videoModel;
    const max = this.descriptor.capabilities.maxVideoSeconds;
    if (request.durationSeconds > max) {
      throw new ProviderError({
        errorClass: 'validation',
        code: 'UNSUPPORTED_CAPABILITY',
        message: `${model} generates at most ${max}s per clip; this shot asks for ${request.durationSeconds}s. Split the shot.`,
      });
    }
    if (request.lastFrame) {
      throw new ProviderError({
        errorClass: 'validation',
        code: 'UNSUPPORTED_CAPABILITY',
        message: 'This Google video model does not accept a last frame. Generate two shots and cut between them.',
      });
    }

    const instance: Record<string, unknown> = { prompt: request.prompt };
    if (request.firstFrame) {
      instance.image = {
        bytesBase64Encoded: request.firstFrame.data.toString('base64'),
        mimeType: request.firstFrame.mimeType,
      };
    }

    const startJson = await withRetry(
      () =>
        postJson(
          `${GENERATIVE_BASE}/models/${encodeURIComponent(model)}:predictLongRunning`,
          this.config.apiKey,
          {
            instances: [instance],
            parameters: {
              aspectRatio: request.aspectRatio,
              durationSeconds: request.durationSeconds,
              ...(request.negativePrompt ? { negativePrompt: request.negativePrompt } : {}),
              ...(request.seed !== null ? { seed: request.seed } : {}),
              ...request.params,
            },
          },
          request.signal,
        ),
      { attempts: 3, baseDelayMs: 3_000, maxDelayMs: 30_000, signal: request.signal },
    );

    const start = parseGoogleResponse(googleOperationSchema, startJson, 'Veo predictLongRunning');
    const operationName = start.name ?? '';
    if (!operationName) {
      throw new ProviderError({
        errorClass: 'fatal',
        code: 'PROVIDER_BAD_RESPONSE',
        message: 'Veo did not return an operation name.',
      });
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let operation: GoogleOperation = start;

    while (operation.done !== true) {
      if (request.signal?.aborted) {
        throw new ProviderError({ errorClass: 'fatal', code: 'CANCELLED', message: 'Cancelled while waiting for Veo' });
      }
      if (Date.now() > deadline) {
        throw new ProviderError({
          errorClass: 'timeout',
          code: 'PROVIDER_TIMEOUT',
          message: `Veo operation ${operationName} did not finish within ${POLL_TIMEOUT_MS / 1000}s`,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const pollJson = await getJson(`${GENERATIVE_BASE}/${operationName}`, this.config.apiKey, request.signal);
      operation = parseGoogleResponse(googleOperationSchema, pollJson, 'Veo operation poll');
    }

    if (operation.error) {
      throw new ProviderError({
        errorClass: 'fatal',
        code: 'PROVIDER_ERROR',
        message: `Veo failed: ${operation.error.message ?? 'unknown error'}`,
        status: operation.error.code,
      });
    }

    const response = operation.response ?? {};
    const samplesRaw =
      response.generatedSamples ??
      response.generateVideoResponse?.generatedSamples ??
      response.predictions;
    const samples = parseGoogleResponse(googleVideoSamplesSchema, samplesRaw, 'Veo generated samples');

    const artifacts: ProviderResult['artifacts'] = [];
    for (const [index, sample] of samples.entries()) {
      const media = sample.video ?? sample;
      const base64 = media.bytesBase64Encoded ?? '';
      const uri = media.uri ?? '';

      if (base64) {
        artifacts.push({
          filename: `veo-${index + 1}.mp4`,
          mimeType: 'video/mp4',
          data: Buffer.from(base64, 'base64'),
          durationSeconds: request.durationSeconds,
        });
        continue;
      }
      if (uri) {
        const download = await fetchGoogleWithPolicy(uri, { method: 'GET' }, this.config.apiKey, REQUEST_TIMEOUT_MS, request.signal);
        if (!download.ok) {
          const detail = (await readResponseBytes(download, 'Veo media error')).toString('utf8');
          throw new ProviderError(classifyHttpStatus(download.status, detail));
        }
        const mimeType = (download.headers.get('content-type') ?? 'video/mp4').split(';', 1)[0]!.trim().toLowerCase();
        artifacts.push({
          filename: `veo-${index + 1}.${extensionForMime(mimeType)}`,
          mimeType,
          data: await readResponseBytes(download, 'Veo media'),
          durationSeconds: request.durationSeconds,
        });
      }
    }

    if (artifacts.length === 0) {
      throw new ProviderError({
        errorClass: 'safety',
        code: 'PROVIDER_SAFETY',
        message: 'Veo completed without returning a video. The prompt was most likely filtered.',
      });
    }

    return {
      artifacts,
      raw: { model, operationName },
      actualCostUsd: estimateCostUsd({
        provider: 'google',
        kind: 'video',
        durationSeconds: request.durationSeconds,
        count: artifacts.length,
      }),
      modelUsed: model,
    };
  }
}

// ---------------------------------------------------------------------------
// Cloud Text-to-Speech
// ---------------------------------------------------------------------------

export class GoogleVoiceProvider implements VoiceProvider {
  readonly descriptor: ProviderDescriptor;

  constructor(private readonly config: GoogleConfig) {
    this.descriptor = googleDescriptor(config);
  }

  async synthesize(request: VoiceRequest): Promise<ProviderResult> {
    const voiceName = request.voiceName || this.config.ttsVoice;
    const json = await withRetry(
      () =>
        postJson(
          `${TTS_BASE}/text:synthesize`,
          this.config.apiKey,
          {
            input: { text: request.text },
            voice: { languageCode: request.language, name: voiceName },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: Math.min(4, Math.max(0.25, request.speed)),
              pitch: Math.min(20, Math.max(-20, request.pitch)),
            },
          },
          request.signal,
        ),
      { attempts: 3, baseDelayMs: 1_000, maxDelayMs: 10_000, signal: request.signal },
    );

    const parsed = parseGoogleResponse(googleTtsResponseSchema, json, 'Cloud TTS synthesize');
    const base64 = parsed.audioContent ?? '';
    if (!base64) {
      throw new ProviderError({
        errorClass: 'fatal',
        code: 'PROVIDER_BAD_RESPONSE',
        message: 'Cloud TTS returned no audio content.',
      });
    }

    return {
      artifacts: [
        {
          filename: `tts-${voiceName}-${request.text.length}.mp3`,
          mimeType: 'audio/mpeg',
          data: Buffer.from(base64, 'base64'),
        },
      ],
      raw: { voiceName, language: request.language },
      actualCostUsd: estimateCostUsd({ provider: 'google', kind: 'voice', characters: request.text.length }),
      modelUsed: voiceName,
    };
  }
}

// ---------------------------------------------------------------------------
// Gemini — structured text only. Prose responses are rejected, never salvaged.
// ---------------------------------------------------------------------------

export class GoogleTextProvider implements TextProvider {
  readonly descriptor: ProviderDescriptor;

  constructor(private readonly config: GoogleConfig) {
    this.descriptor = googleDescriptor(config);
  }

  async complete<T>(request: TextRequest): Promise<{ value: T; raw: Record<string, unknown>; costUsd: number }> {
    const model = request.model || this.config.textModel;
    const json = await withRetry(
      () =>
        postJson(
          `${GENERATIVE_BASE}/models/${encodeURIComponent(model)}:generateContent`,
          this.config.apiKey,
          {
            systemInstruction: {
              parts: [
                {
                  text: `${request.instruction}\n\nReturn only JSON matching the "${request.jsonSchemaName}" contract. No prose, no markdown fences.`,
                },
              ],
            },
            contents: [{ role: 'user', parts: [{ text: request.input }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
          },
          request.signal,
        ),
      { attempts: 3, baseDelayMs: 1_500, maxDelayMs: 15_000, signal: request.signal },
    );

    const parsed = parseGoogleResponse(googleGenerateContentResponseSchema, json, 'Gemini generateContent');
    const parts = parsed.candidates[0]?.content?.parts ?? [];
    const text = parts
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      throw new ProviderError({
        errorClass: 'safety',
        code: 'PROVIDER_SAFETY',
        message: 'Gemini returned no content (most likely a safety block).',
      });
    }

    let value: T;
    try {
      value = JSON.parse(text) as T;
    } catch {
      throw new ProviderError({
        errorClass: 'validation',
        code: 'PROVIDER_BAD_RESPONSE',
        message: `Gemini returned prose instead of JSON for schema "${request.jsonSchemaName}".`,
      });
    }

    const totalTokenCount = parsed.usageMetadata?.totalTokenCount ?? 0;
    return {
      value,
      raw: { model, totalTokenCount },
      costUsd: estimateCostUsd({
        provider: 'google',
        kind: 'text',
        characters: request.input.length + text.length,
      }),
    };
  }
}
