import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_KEYS,
  CAPABILITY_REASON_CODES,
  CAPABILITY_STATES,
} from '@/domain/capability';

describe('capability domain contract', () => {
  it('defines exactly the four accepted capability states', () => {
    expect(CAPABILITY_STATES).toEqual(['AVAILABLE', 'BLOCKED', 'PLANNED', 'UNSUPPORTED']);
  });

  it('defines exactly the six bounded resolver keys', () => {
    expect(CAPABILITY_KEYS).toEqual([
      'generation.image.submit',
      'generation.video.submit',
      'continuity.check',
      'asset.approve',
      'composer.compose',
      'export.create',
    ]);
  });

  it('defines stable machine-readable reason codes without UI copy', () => {
    expect(CAPABILITY_REASON_CODES).toEqual([
      'PRODUCTION_TYPE_REQUIRED',
      'NOT_APPLICABLE_TO_PRODUCTION_TYPE',
      'BACKEND_NOT_IMPLEMENTED',
      'PROJECT_ARCHIVED',
      'NO_CAPABLE_PROVIDER',
    ]);
  });
});
