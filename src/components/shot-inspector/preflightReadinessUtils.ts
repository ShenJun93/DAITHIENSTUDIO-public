import type { GenerationKind } from '@/domain/enums';

export type PreflightGenerationKind = Extract<GenerationKind, 'image' | 'video'>;

export interface PreflightKindReadiness {
  kind: PreflightGenerationKind;
  provider: string;
  providerLabel: string | null;
  model: string | null;
  registered: boolean;
  offline: boolean;
  capabilitySupported: boolean;
  estimatedCostUsd: number;
}

export interface PreflightReadinessData {
  image: PreflightKindReadiness;
  video: PreflightKindReadiness;
}

export function providerRiskLabel(row: PreflightKindReadiness): 'OFFLINE / ZERO-CREDIT' | 'CANARY / PAID-RISK' {
  return row.provider === 'mock' ? 'OFFLINE / ZERO-CREDIT' : 'CANARY / PAID-RISK';
}

export function capabilityLabel(row: PreflightKindReadiness): 'Compatible' | 'Capability mismatch' | 'Provider unavailable' {
  if (!row.registered) return 'Provider unavailable';
  return row.capabilitySupported ? 'Compatible' : 'Capability mismatch';
}

export function formatEstimatedCost(estimatedCostUsd: number): string {
  return `$${estimatedCostUsd.toFixed(4)}`;
}
