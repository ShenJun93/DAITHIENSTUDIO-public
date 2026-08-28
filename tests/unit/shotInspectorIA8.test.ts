import { describe, expect, it } from 'vitest';
import {
  capabilityLabel,
  formatEstimatedCost,
  providerRiskLabel,
  type PreflightKindReadiness,
} from '@/components/shot-inspector/preflightReadinessUtils';

const row = (overrides: Partial<PreflightKindReadiness> = {}): PreflightKindReadiness => ({
  kind: 'image',
  provider: 'mock',
  providerLabel: 'Mock',
  model: 'mock-image-v1',
  registered: true,
  offline: true,
  capabilitySupported: true,
  estimatedCostUsd: 0,
  ...overrides,
});

describe('Shot Inspector IA8 — provider-safe preflight readiness helpers', () => {
  it('labels only mock as offline zero-credit', () => {
    expect(providerRiskLabel(row())).toBe('OFFLINE / ZERO-CREDIT');
  });

  it('labels every non-mock provider as canary paid risk even when descriptor is offline', () => {
    expect(providerRiskLabel(row({ provider: 'comfyui', offline: true }))).toBe('CANARY / PAID-RISK');
    expect(providerRiskLabel(row({ provider: 'google', offline: false }))).toBe('CANARY / PAID-RISK');
  });

  it('reports descriptor capability and availability without execution', () => {
    expect(capabilityLabel(row())).toBe('Compatible');
    expect(capabilityLabel(row({ capabilitySupported: false }))).toBe('Capability mismatch');
    expect(capabilityLabel(row({ registered: false, capabilitySupported: false }))).toBe('Provider unavailable');
  });

  it('formats canonical estimate display without claiming exact spend', () => {
    expect(formatEstimatedCost(0)).toBe('$0.0000');
    expect(formatEstimatedCost(0.04)).toBe('$0.0400');
  });
});
