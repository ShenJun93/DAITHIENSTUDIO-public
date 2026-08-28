/**
 * Provider registry — the only place a provider key becomes a concrete adapter.
 *
 * Selection order for a generation: explicit request > project/env default >
 * "mock". If a remote provider is selected but its credentials are missing, the
 * registry refuses loudly instead of silently downgrading: a silent downgrade
 * would make an operator think they rendered with Veo when they did not.
 */
import type { GenerationKind } from '@/domain/enums';
import { DomainError } from '@/domain/errors';
import type {
  ImageProvider,
  ProviderDescriptor,
  ProviderRegistry,
  TextProvider,
  VideoProvider,
  VoiceProvider,
} from '@/application/ports';
import { MOCK_DESCRIPTOR, MockImageProvider, MockMusicProvider, MockSoundProvider, MockTextProvider, MockVideoProvider, MockVoiceProvider } from './mockProvider';
import {
  GoogleImageProvider,
  GoogleTextProvider,
  GoogleVideoProvider,
  GoogleVoiceProvider,
  googleDescriptor,
  type GoogleConfig,
} from './googleProvider';
import { ComfyUiImageProvider, comfyUiDescriptor, type ComfyUiConfig } from './comfyuiProvider';

export interface RegistryOptions {
  defaults: Record<GenerationKind, string>;
  google: GoogleConfig | null;
  comfyui: ComfyUiConfig | null;
}

export function readRegistryOptions(env: Record<string, string | undefined>): RegistryOptions {
  const apiKey = (env.GOOGLE_API_KEY ?? '').trim();
  const comfyUiBaseUrl = (env.COMFYUI_BASE_URL ?? '').trim();
  const comfyUiImageModel = (env.COMFYUI_IMAGE_MODEL ?? '').trim();
  const positiveNumber = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    defaults: {
      text: (env.AI_TEXT_PROVIDER ?? 'mock').trim() || 'mock',
      image: (env.AI_IMAGE_PROVIDER ?? 'mock').trim() || 'mock',
      video: (env.AI_VIDEO_PROVIDER ?? 'mock').trim() || 'mock',
      voice: (env.AI_VOICE_PROVIDER ?? 'mock').trim() || 'mock',
      music: (env.AI_MUSIC_PROVIDER ?? 'mock').trim() || 'mock',
      sound: (env.AI_SOUND_PROVIDER ?? 'mock').trim() || 'mock',
    },
    google: apiKey
      ? {
          apiKey,
          textModel: (env.GOOGLE_TEXT_MODEL ?? 'gemini-2.0-flash').trim(),
          imageModel: (env.GOOGLE_IMAGE_MODEL ?? 'imagen-3.0-generate-002').trim(),
          videoModel: (env.GOOGLE_VIDEO_MODEL ?? 'veo-2.0-generate-001').trim(),
          ttsVoice: (env.GOOGLE_TTS_VOICE ?? 'vi-VN-Standard-A').trim(),
        }
      : null,
    comfyui:
      comfyUiBaseUrl && comfyUiImageModel
        ? {
            baseUrl: comfyUiBaseUrl,
            imageModel: comfyUiImageModel,
            pollIntervalMs: positiveNumber(env.COMFYUI_POLL_INTERVAL_MS, 1_000),
            jobTimeoutMs: positiveNumber(env.JOB_TIMEOUT_MS, 600_000),
          }
        : null,
  };
}

export class DefaultProviderRegistry implements ProviderRegistry {
  private readonly mockImage = new MockImageProvider();
  private readonly mockVideo = new MockVideoProvider();
  private readonly mockVoice = new MockVoiceProvider();
  private readonly mockMusic = new MockMusicProvider();
  private readonly mockSound = new MockSoundProvider();
  private readonly mockText = new MockTextProvider();

  private readonly googleImage: GoogleImageProvider | null;
  private readonly googleVideo: GoogleVideoProvider | null;
  private readonly googleVoice: GoogleVoiceProvider | null;
  private readonly googleText: GoogleTextProvider | null;
  private readonly comfyUiImage: ComfyUiImageProvider | null;

  constructor(private readonly options: RegistryOptions) {
    const google = options.google;
    this.googleImage = google ? new GoogleImageProvider(google) : null;
    this.googleVideo = google ? new GoogleVideoProvider(google) : null;
    this.googleVoice = google ? new GoogleVoiceProvider(google) : null;
    this.googleText = google ? new GoogleTextProvider(google) : null;
    this.comfyUiImage = options.comfyui ? new ComfyUiImageProvider(options.comfyui) : null;
  }

  descriptors(): ProviderDescriptor[] {
    const list: ProviderDescriptor[] = [MOCK_DESCRIPTOR];
    if (this.options.google) list.push(googleDescriptor(this.options.google));
    if (this.options.comfyui) list.push(comfyUiDescriptor(this.options.comfyui));
    return list;
  }

  private missing(key: string, kind: GenerationKind): never {
    throw new DomainError(
      'PROVIDER_UNAVAILABLE',
      `Provider "${key}" is not configured for ${kind}. Configure its environment variables, or set AI_${kind.toUpperCase()}_PROVIDER=mock to work offline.`,
      { provider: key, kind },
    );
  }

  image(key?: string): ImageProvider {
    const resolved = key ?? this.defaultKeyFor('image');
    if (resolved === 'mock') return this.mockImage;
    if (resolved === 'google') return this.googleImage ?? this.missing('google', 'image');
    if (resolved === 'comfyui') return this.comfyUiImage ?? this.missing('comfyui', 'image');
    return this.missing(resolved, 'image');
  }

  video(key?: string): VideoProvider {
    const resolved = key ?? this.defaultKeyFor('video');
    if (resolved === 'mock') return this.mockVideo;
    if (resolved === 'google') return this.googleVideo ?? this.missing('google', 'video');
    return this.missing(resolved, 'video');
  }

  voice(key?: string): VoiceProvider {
    const resolved = key ?? this.defaultKeyFor('voice');
    if (resolved === 'mock') return this.mockVoice;
    if (resolved === 'google') return this.googleVoice ?? this.missing('google', 'voice');
    return this.missing(resolved, 'voice');
  }

  music(key?: string): VoiceProvider {
    const resolved = key ?? this.defaultKeyFor('music');
    if (resolved === 'mock') return this.mockMusic;
    return this.missing(resolved, 'music');
  }

  sound(key?: string): VoiceProvider {
    const resolved = key ?? this.defaultKeyFor('sound');
    if (resolved === 'mock') return this.mockSound;
    return this.missing(resolved, 'sound');
  }

  text(key?: string): TextProvider {
    const resolved = key ?? this.defaultKeyFor('text');
    if (resolved === 'mock') return this.mockText;
    if (resolved === 'google') return this.googleText ?? this.missing('google', 'text');
    return this.missing(resolved, 'text');
  }

  defaultKeyFor(kind: GenerationKind): string {
    return this.options.defaults[kind] ?? 'mock';
  }

  defaultModelFor(kind: GenerationKind, providerKey?: string): string {
    const key = providerKey ?? this.defaultKeyFor(kind);
    const descriptor = this.descriptors().find((candidate) => candidate.key === key);
    const model = descriptor?.models[kind]?.[0];
    if (model) return model;
    return MOCK_DESCRIPTOR.models[kind]?.[0] ?? 'mock-unknown';
  }
}
