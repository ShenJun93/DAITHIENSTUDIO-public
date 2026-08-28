import { z, type ZodType } from 'zod';
import type { ImageProvider, ImageRequest, ProviderDescriptor, ProviderResult } from '@/application/ports';
import { MAX_UPLOAD_BYTES, validateFileArtifact } from '@/domain/fileValidation';
import { COMFYUI_CAPABILITIES } from './capabilities';
import {
  comfyUiHistorySchema,
  comfyUiParamsSchema,
  comfyUiSubmitSchema,
  type ComfyUiImageRef,
} from './comfyuiSchemas';
import { ProviderError, classifyHttpStatus, fetchWithTimeout } from './retry';

const MAX_JSON_BYTES = 1024 * 1024;
const OUTPUT_MIME = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export interface ComfyUiConfig {
  baseUrl: string;
  imageModel: string;
  pollIntervalMs: number;
  jobTimeoutMs: number;
}

interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

type Workflow = Record<string, WorkflowNode>;

function providerError(errorClass: ProviderError['failure']['errorClass'], code: string, message: string, status?: number): never {
  throw new ProviderError({ errorClass, code, message, status });
}

export function validateComfyUiBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return providerError('validation', 'PROVIDER_VALIDATION', 'ComfyUI base URL must be a valid loopback HTTP URL.');
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (url.protocol !== 'http:' || !loopback || url.username || url.password || url.search || url.hash) {
    return providerError(
      'validation',
      'PROVIDER_VALIDATION',
      'The experimental ComfyUI provider accepts only an unauthenticated loopback HTTP URL.',
    );
  }
  return url.toString().replace(/\/+$/, '');
}

export function comfyUiDescriptor(config: ComfyUiConfig): ProviderDescriptor {
  return {
    key: 'comfyui',
    label: 'ComfyUI (local experiment)',
    offline: true,
    models: { image: [config.imageModel] },
    capabilities: COMFYUI_CAPABILITIES,
  };
}

function workflowFor(request: ImageRequest, model: string): Workflow {
  const parsedParams = comfyUiParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    return providerError('validation', 'PROVIDER_VALIDATION', 'ComfyUI sampling parameters are outside the experimental contract.');
  }
  const params = parsedParams.data;
  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        cfg: params.cfg,
        denoise: 1,
        latent_image: ['5', 0],
        model: ['4', 0],
        negative: ['7', 0],
        positive: ['6', 0],
        sampler_name: params.samplerName,
        scheduler: params.scheduler,
        seed: request.seed ?? 0,
        steps: params.steps,
      },
    },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
    '5': { class_type: 'EmptyLatentImage', inputs: { batch_size: 1, height: 512, width: 512 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: request.prompt } },
    '7': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: request.negativePrompt } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'DAITHIENSTUDIO', images: ['8', 0] } },
  };
}

async function readBounded(response: Response, limit: number, label: string, signal?: AbortSignal): Promise<Buffer> {
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel();
    return providerError('fatal', 'PROVIDER_BAD_RESPONSE', `ComfyUI ${label} exceeded the ${limit}-byte response limit.`);
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (error) {
      if (signal?.aborted) cancelled();
      throw error;
    }
    const { done, value } = chunk;
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return providerError('fatal', 'PROVIDER_BAD_RESPONSE', `ComfyUI ${label} exceeded the ${limit}-byte response limit.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function parseJson<S extends ZodType>(schema: S, bytes: Buffer, label: string): z.infer<S> {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    return providerError('fatal', 'PROVIDER_BAD_RESPONSE', `ComfyUI returned non-JSON data for ${label}.`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return providerError('fatal', 'PROVIDER_BAD_RESPONSE', `ComfyUI returned an invalid ${label} response.`);
  }
  return parsed.data;
}

function cancelled(): never {
  return providerError('fatal', 'CANCELLED', 'ComfyUI generation was cancelled by the studio.');
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) cancelled();
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = (): void => signal?.removeEventListener('abort', onAbort);
    const onAbort = (): void => {
      clearTimeout(timer);
      cleanup();
      reject(new ProviderError({ errorClass: 'fatal', code: 'CANCELLED', message: 'ComfyUI generation was cancelled by the studio.' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
  });
}

export class ComfyUiImageProvider implements ImageProvider {
  readonly descriptor: ProviderDescriptor;
  private readonly baseUrl: string;

  constructor(private readonly config: ComfyUiConfig) {
    this.baseUrl = validateComfyUiBaseUrl(config.baseUrl);
    if (!config.imageModel.trim()) {
      providerError('validation', 'PROVIDER_VALIDATION', 'COMFYUI_IMAGE_MODEL must name an installed checkpoint.');
    }
    this.descriptor = comfyUiDescriptor(config);
  }

  private async request(path: string, init: RequestInit, deadline: number, signal?: AbortSignal): Promise<Response> {
    if (signal?.aborted) cancelled();
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      providerError('timeout', 'PROVIDER_TIMEOUT', 'ComfyUI generation exceeded the configured job timeout.');
    }
    try {
      const response = await fetchWithTimeout(
        `${this.baseUrl}${path}`,
        { ...init, redirect: 'manual' },
        remaining,
        signal,
      );
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        providerError('fatal', 'PROVIDER_UNTRUSTED_URL', 'ComfyUI redirects are refused by the loopback-only provider.');
      }
      return response;
    } catch (error) {
      if (signal?.aborted) cancelled();
      throw error;
    }
  }

  private async json<S extends ZodType>(
    path: string,
    init: RequestInit,
    schema: S,
    label: string,
    deadline: number,
    signal?: AbortSignal,
  ): Promise<z.infer<S>> {
    const response = await this.request(path, init, deadline, signal);
    const bytes = await readBounded(response, MAX_JSON_BYTES, label, signal);
    if (!response.ok) throw new ProviderError(classifyHttpStatus(response.status, bytes.toString('utf8')));
    return parseJson(schema, bytes, label);
  }

  async generateImage(request: ImageRequest): Promise<ProviderResult> {
    if (request.aspectRatio !== '1:1' || request.count !== 1 || request.referenceFiles.length > 0) {
      providerError(
        'validation',
        'UNSUPPORTED_CAPABILITY',
        'The ComfyUI experiment supports one 512×512 text-to-image output with no reference image.',
      );
    }
    if (request.model !== this.config.imageModel) {
      providerError('validation', 'UNSUPPORTED_CAPABILITY', 'The requested ComfyUI checkpoint is not configured for this provider.');
    }

    const deadline = Date.now() + this.config.jobTimeoutMs;
    const workflow = workflowFor(request, this.config.imageModel);
    const submit = await this.json(
      '/prompt',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: workflow }) },
      comfyUiSubmitSchema,
      'submit',
      deadline,
      request.signal,
    );

    let outputNodeId = '';
    let image: ComfyUiImageRef | undefined;
    while (!image) {
      const history = await this.json(
        `/history/${encodeURIComponent(submit.prompt_id)}`,
        { method: 'GET' },
        comfyUiHistorySchema,
        'history',
        deadline,
        request.signal,
      );
      const entry = history[submit.prompt_id];
      if (entry) {
        if (entry.status.completed && entry.status.status_str !== 'success') {
          providerError('fatal', 'PROVIDER_ERROR', 'ComfyUI finished the workflow without a successful result.');
        }
        if (entry.status.completed) {
          for (const [nodeId, output] of Object.entries(entry.outputs)) {
            const candidate = output.images?.[0];
            if (candidate) {
              outputNodeId = nodeId;
              image = candidate;
              break;
            }
          }
          if (!image) providerError('fatal', 'PROVIDER_BAD_RESPONSE', 'ComfyUI completed without returning an image output.');
        }
      }
      if (!image) await wait(Math.max(1, Math.min(this.config.pollIntervalMs, deadline - Date.now())), request.signal);
    }

    const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type });
    const download = await this.request(`/view?${query.toString()}`, { method: 'GET' }, deadline, request.signal);
    const data = await readBounded(download, MAX_UPLOAD_BYTES, 'image', request.signal);
    if (!download.ok) throw new ProviderError(classifyHttpStatus(download.status, data.toString('utf8')));
    const mimeType = OUTPUT_MIME.safeParse((download.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase());
    if (!mimeType.success) providerError('fatal', 'PROVIDER_BAD_RESPONSE', 'ComfyUI returned an unsupported image Content-Type.');

    const safeFilename = image.filename.replace(/\\/g, '/').split('/').pop() || 'comfyui-output.png';
    try {
      validateFileArtifact(data, mimeType.data, safeFilename);
    } catch {
      providerError('fatal', 'PROVIDER_BAD_RESPONSE', 'ComfyUI returned image bytes that do not match the output metadata.');
    }
    return {
      artifacts: [{ filename: safeFilename, mimeType: mimeType.data, data, width: 512, height: 512 }],
      raw: {
        promptId: submit.prompt_id,
        outputNodeId,
        filename: safeFilename,
        subfolder: image.subfolder,
        outputType: image.type,
        settings: { width: 512, height: 512, seed: request.seed ?? 0, model: this.config.imageModel },
      },
      actualCostUsd: 0,
      modelUsed: this.config.imageModel,
    };
  }
}
