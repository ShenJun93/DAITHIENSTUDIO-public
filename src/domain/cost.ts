/**
 * Cost model. Every generation records an estimate before it runs and an
 * actual afterwards, so the Render Queue can enforce a per-project ceiling
 * instead of discovering the bill later.
 *
 * Numbers are indicative list prices in USD and live in one place on purpose:
 * update this table, not call sites, when a provider changes pricing.
 */
import type { GenerationKind } from './enums';

export interface CostRate {
  /** Flat price per generated unit (image, or second of video/audio). */
  perUnitUsd: number;
  unit: 'image' | 'second' | 'thousand-characters';
}

const RATES: Record<string, Partial<Record<GenerationKind, CostRate>>> = {
  mock: {
    image: { perUnitUsd: 0, unit: 'image' },
    video: { perUnitUsd: 0, unit: 'second' },
    voice: { perUnitUsd: 0, unit: 'thousand-characters' },
    music: { perUnitUsd: 0, unit: 'second' },
    sound: { perUnitUsd: 0, unit: 'second' },
    text: { perUnitUsd: 0, unit: 'thousand-characters' },
  },
  google: {
    image: { perUnitUsd: 0.04, unit: 'image' },
    video: { perUnitUsd: 0.5, unit: 'second' },
    voice: { perUnitUsd: 0.016, unit: 'thousand-characters' },
    text: { perUnitUsd: 0.0004, unit: 'thousand-characters' },
  },
  comfyui: {
    image: { perUnitUsd: 0, unit: 'image' },
  },
};

export interface CostInput {
  provider: string;
  kind: GenerationKind;
  count?: number;
  durationSeconds?: number;
  characters?: number;
}

export function estimateCostUsd(input: CostInput): number {
  const rate = RATES[input.provider]?.[input.kind];
  if (!rate) return 0;

  const units =
    rate.unit === 'image'
      ? input.count ?? 1
      : rate.unit === 'second'
        ? (input.durationSeconds ?? 5) * (input.count ?? 1)
        : ((input.characters ?? 0) / 1000) * (input.count ?? 1);

  return Math.round(rate.perUnitUsd * units * 10_000) / 10_000;
}

export function knownProviders(): string[] {
  return Object.keys(RATES);
}

export function rateFor(provider: string, kind: GenerationKind): CostRate | null {
  return RATES[provider]?.[kind] ?? null;
}
