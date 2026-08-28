/**
 * IA3 (TASK-SHOT-INSPECTOR-IA3) — focused unit tests for the deterministic
 * reference-health derivation. These are tab-local health states only; IA2
 * whole-shot readiness is a separate derivation over the same facts.
 */
import { describe, expect, it } from 'vitest';
import {
  deriveReferenceHealth,
  formatHealthReason,
  referenceHealthGlyph,
  referenceHealthLabel,
  REFERENCES_PINS_ANCHOR,
  type ReferenceHealthStatus,
} from '@/components/shot-inspector/referencesUtils';
import type { PinnedReferenceState } from '@/domain/visualControl/types';

const BASE_PATH = '/projects/demo/shots/EP01_SC01_SH001';

function pin(overrides: Partial<PinnedReferenceState>): PinnedReferenceState {
  return {
    kind: 'character',
    refId: 'char_1',
    code: 'CHAR001',
    versionId: 'CHAR001_V1',
    source: 'shot-field',
    resolved: true,
    resolvableReason: null,
    ...overrides,
  };
}

const resolvedCharacter = pin({});

const resolvedLocation = pin({
  kind: 'location',
  refId: 'loc_1',
  code: 'LOC001',
  versionId: 'LOC001_V1',
});

const resolvedProp = pin({
  kind: 'prop',
  refId: 'prop_1',
  code: 'PROP001',
  versionId: 'PROP001_V1',
});

const ALL_STATUSES: ReferenceHealthStatus[] = ['EMPTY', 'BLOCKED', 'NEEDS_ATTENTION', 'COMPLETE'];

describe('referencesUtils — Rule 1: EMPTY', () => {
  it('returns EMPTY when the shot has no pinned references', () => {
    const health = deriveReferenceHealth([], BASE_PATH);
    expect(health.status).toBe('EMPTY');
    expect(health.tone).toBe('info');
    expect(health.reason).toBe('No references pinned to this shot');
    expect(health.actionLabel).toBe('Edit shot');
    expect(health.actionDestination).toBe(`${BASE_PATH}/edit`);
  });
});

describe('referencesUtils — Rule 4: COMPLETE', () => {
  it('returns COMPLETE for one resolved character with a pinned version', () => {
    const health = deriveReferenceHealth([resolvedCharacter], BASE_PATH);
    expect(health.status).toBe('COMPLETE');
    expect(health.tone).toBe('success');
    expect(health.reason).toBe('All references pinned and resolved');
    expect(health.actionLabel).toBeNull();
    expect(health.actionDestination).toBeNull();
  });

  it('returns COMPLETE for multiple resolved characters', () => {
    const second = pin({ refId: 'char_2', code: 'CHAR002', versionId: 'CHAR002_V1' });
    const health = deriveReferenceHealth([resolvedCharacter, second], BASE_PATH);
    expect(health.status).toBe('COMPLETE');
  });

  it('returns COMPLETE for a resolved location with a pinned version', () => {
    const health = deriveReferenceHealth([resolvedLocation], BASE_PATH);
    expect(health.status).toBe('COMPLETE');
  });

  it('returns COMPLETE for resolved props', () => {
    const health = deriveReferenceHealth([resolvedProp], BASE_PATH);
    expect(health.status).toBe('COMPLETE');
  });

  it('returns COMPLETE for a mixed resolved set (character, location, prop, style lockref)', () => {
    const styleLockref = pin({
      kind: 'style',
      refId: 'style_1',
      code: 'STY001',
      versionId: 'STY001_V1',
      source: 'prompt-lockref',
    });
    const health = deriveReferenceHealth([resolvedCharacter, resolvedLocation, resolvedProp, styleLockref], BASE_PATH);
    expect(health.status).toBe('COMPLETE');
  });
});

describe('referencesUtils — Rule 2: BLOCKED', () => {
  it('returns BLOCKED when a character entity is missing (unresolvable snapshot)', () => {
    const missingEntity = pin({ code: '', resolved: false, resolvableReason: 'MISSING_REFERENCE' });
    const health = deriveReferenceHealth([missingEntity], BASE_PATH);
    expect(health.status).toBe('BLOCKED');
    expect(health.tone).toBe('blocked');
    expect(health.actionLabel).toBe('Review unresolved reference');
    expect(health.actionDestination).toBe(REFERENCES_PINS_ANCHOR);
  });

  it('returns BLOCKED when the pinned character version snapshot is missing', () => {
    const missingSnapshot = pin({ versionId: 'CHAR001_V9', resolved: false, resolvableReason: 'MISSING_REFERENCE' });
    const health = deriveReferenceHealth([missingSnapshot], BASE_PATH);
    expect(health.status).toBe('BLOCKED');
  });

  it('returns BLOCKED when the location entity or snapshot is missing', () => {
    const missingLocation = pin({
      kind: 'location',
      refId: 'loc_1',
      code: 'LOC001',
      versionId: 'LOC001_V3',
      resolved: false,
      resolvableReason: 'MISSING_REFERENCE',
    });
    const health = deriveReferenceHealth([missingLocation], BASE_PATH);
    expect(health.status).toBe('BLOCKED');
  });

  it('returns BLOCKED when a prop snapshot is missing', () => {
    const missingProp = pin({
      kind: 'prop',
      refId: 'prop_1',
      code: 'PROP001',
      versionId: 'PROP001_V2',
      resolved: false,
      resolvableReason: 'MISSING_REFERENCE',
    });
    const health = deriveReferenceHealth([missingProp], BASE_PATH);
    expect(health.status).toBe('BLOCKED');
  });
});

describe('referencesUtils — Rule 3: NEEDS_ATTENTION', () => {
  it('returns NEEDS_ATTENTION for a character with an empty version', () => {
    const unpinned = pin({ versionId: null, resolved: false, resolvableReason: 'NO_PIN' });
    const health = deriveReferenceHealth([unpinned], BASE_PATH);
    expect(health.status).toBe('NEEDS_ATTENTION');
    expect(health.tone).toBe('warning');
    expect(health.actionLabel).toBe('Pin a version');
    expect(health.actionDestination).toBe(REFERENCES_PINS_ANCHOR);
  });

  it('returns NEEDS_ATTENTION for a location with an empty version', () => {
    const unpinned = pin({
      kind: 'location',
      refId: 'loc_1',
      code: 'LOC001',
      versionId: null,
      resolved: false,
      resolvableReason: 'NO_PIN',
    });
    const health = deriveReferenceHealth([unpinned], BASE_PATH);
    expect(health.status).toBe('NEEDS_ATTENTION');
  });

  it('returns NEEDS_ATTENTION for a prop with an empty version', () => {
    const unpinned = pin({
      kind: 'prop',
      refId: 'prop_1',
      code: 'PROP001',
      versionId: null,
      resolved: false,
      resolvableReason: 'NO_PIN',
    });
    const health = deriveReferenceHealth([unpinned], BASE_PATH);
    expect(health.status).toBe('NEEDS_ATTENTION');
  });

  it('treats an empty versionId as NO_PIN even without an explicit reason', () => {
    const emptyVersion = pin({ versionId: null, resolved: false, resolvableReason: null });
    const health = deriveReferenceHealth([emptyVersion], BASE_PATH);
    expect(health.status).toBe('NEEDS_ATTENTION');
  });
});

describe('referencesUtils — version semantics', () => {
  it('a valid pinned version that differs from the latest is not BLOCKED (stale is informational)', () => {
    const stale = pin({ versionId: 'CHAR001_V1', resolved: true, resolvableReason: null });
    const health = deriveReferenceHealth([stale], BASE_PATH);
    expect(health.status).not.toBe('BLOCKED');
    expect(health.status).toBe('COMPLETE');
  });
});

describe('referencesUtils — null fallback', () => {
  it('returns NEEDS_ATTENTION for null input', () => {
    const health = deriveReferenceHealth(null, BASE_PATH);
    expect(health.status).toBe('NEEDS_ATTENTION');
    expect(health.reason).toBe('Reference data unavailable');
    expect(health.actionLabel).toBeNull();
    expect(health.actionDestination).toBeNull();
  });

  it('returns NEEDS_ATTENTION for undefined input', () => {
    const health = deriveReferenceHealth(undefined, BASE_PATH);
    expect(health.status).toBe('NEEDS_ATTENTION');
    expect(health.reason).toBe('Reference data unavailable');
  });

  it('returns NEEDS_ATTENTION when the pins array contains a malformed element', () => {
    const health = deriveReferenceHealth([resolvedCharacter, null], BASE_PATH);
    expect(health.status).toBe('NEEDS_ATTENTION');
    expect(health.reason).toBe('Reference data unavailable');
  });
});

describe('referencesUtils — precedence', () => {
  it('BLOCKED wins over NEEDS_ATTENTION when both are present', () => {
    const missing = pin({ versionId: 'CHAR001_V9', resolved: false, resolvableReason: 'MISSING_REFERENCE' });
    const unpinned = pin({
      kind: 'location',
      refId: 'loc_1',
      code: 'LOC001',
      versionId: null,
      resolved: false,
      resolvableReason: 'NO_PIN',
    });
    const health = deriveReferenceHealth([missing, unpinned], BASE_PATH);
    expect(health.status).toBe('BLOCKED');
  });

  it('NEEDS_ATTENTION wins over COMPLETE when one pin is unpinned', () => {
    const unpinned = pin({
      kind: 'prop',
      refId: 'prop_1',
      code: 'PROP001',
      versionId: null,
      resolved: false,
      resolvableReason: 'NO_PIN',
    });
    const health = deriveReferenceHealth([resolvedCharacter, resolvedLocation, unpinned], BASE_PATH);
    expect(health.status).toBe('NEEDS_ATTENTION');
  });

  it('BLOCKED wins over resolved pins', () => {
    const missing = pin({
      kind: 'prop',
      refId: 'prop_1',
      code: 'PROP001',
      versionId: 'PROP001_V2',
      resolved: false,
      resolvableReason: 'MISSING_REFERENCE',
    });
    const health = deriveReferenceHealth([resolvedCharacter, resolvedLocation, missing], BASE_PATH);
    expect(health.status).toBe('BLOCKED');
  });
});

describe('referencesUtils — no false COMPLETE', () => {
  it('never returns COMPLETE for an unrecognized unresolved state', () => {
    const unrecognized = pin({ versionId: 'CHAR001_V1', resolved: false, resolvableReason: null });
    const health = deriveReferenceHealth([unrecognized], BASE_PATH);
    expect(health.status).not.toBe('COMPLETE');
    expect(health.status).toBe('NEEDS_ATTENTION');
  });

  it('never returns COMPLETE for null input', () => {
    expect(deriveReferenceHealth(null, BASE_PATH).status).not.toBe('COMPLETE');
  });

  it('never returns COMPLETE when any pin lacks a versionId', () => {
    const noVersion = pin({ versionId: null, resolved: true, resolvableReason: null });
    const health = deriveReferenceHealth([resolvedCharacter, noVersion], BASE_PATH);
    expect(health.status).not.toBe('COMPLETE');
  });

  it('every derivable status has a label and a glyph (status never conveyed by color alone)', () => {
    for (const status of ALL_STATUSES) {
      expect(referenceHealthLabel(status).length).toBeGreaterThan(0);
      expect(referenceHealthGlyph(status).length).toBeGreaterThan(0);
    }
  });
});

describe('referencesUtils — formatHealthReason', () => {
  it('identifies the missing reference category for BLOCKED', () => {
    const missing = pin({ versionId: 'CHAR001_V9', resolved: false, resolvableReason: 'MISSING_REFERENCE' });
    const health = deriveReferenceHealth([missing], BASE_PATH);
    expect(formatHealthReason(health, [missing])).toBe(
      'A pinned reference cannot be resolved — the snapshot is missing (character)',
    );
  });

  it('identifies the location category for a missing location snapshot', () => {
    const missing = pin({
      kind: 'location',
      refId: 'loc_1',
      code: 'LOC001',
      versionId: 'LOC001_V3',
      resolved: false,
      resolvableReason: 'MISSING_REFERENCE',
    });
    const health = deriveReferenceHealth([missing], BASE_PATH);
    expect(formatHealthReason(health, [missing])).toContain('(location)');
  });

  it('identifies the incomplete pin category for NEEDS_ATTENTION', () => {
    const unpinned = pin({
      kind: 'prop',
      refId: 'prop_1',
      code: 'PROP001',
      versionId: null,
      resolved: false,
      resolvableReason: 'NO_PIN',
    });
    const health = deriveReferenceHealth([unpinned], BASE_PATH);
    expect(formatHealthReason(health, [unpinned])).toBe('A reference has no pinned version (prop)');
  });

  it('passes the EMPTY reason through unchanged', () => {
    const health = deriveReferenceHealth([], BASE_PATH);
    expect(formatHealthReason(health, [])).toBe('No references pinned to this shot');
  });

  it('passes the COMPLETE reason through unchanged', () => {
    const health = deriveReferenceHealth([resolvedCharacter], BASE_PATH);
    expect(formatHealthReason(health, [resolvedCharacter])).toBe('All references pinned and resolved');
  });

  it('passes the null-fallback reason through unchanged', () => {
    const health = deriveReferenceHealth(null, BASE_PATH);
    expect(formatHealthReason(health, null)).toBe('Reference data unavailable');
  });
});
