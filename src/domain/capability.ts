export const CAPABILITY_STATES = ['AVAILABLE', 'BLOCKED', 'PLANNED', 'UNSUPPORTED'] as const;
export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export const CAPABILITY_KEYS = [
  'generation.image.submit',
  'generation.video.submit',
  'continuity.check',
  'asset.approve',
  'composer.compose',
  'export.create',
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export const CAPABILITY_REASON_CODES = [
  'PRODUCTION_TYPE_REQUIRED',
  'NOT_APPLICABLE_TO_PRODUCTION_TYPE',
  'BACKEND_NOT_IMPLEMENTED',
  'PROJECT_ARCHIVED',
  'NO_CAPABLE_PROVIDER',
] as const;
export type CapabilityReasonCode = (typeof CAPABILITY_REASON_CODES)[number];

export interface CapabilityResolution {
  key: CapabilityKey;
  state: CapabilityState;
  reasonCode: CapabilityReasonCode | null;
}
