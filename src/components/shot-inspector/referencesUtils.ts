/**
 * IA3 (TASK-SHOT-INSPECTOR-IA3) — deterministic, tab-local reference-health
 * derivation for the References tab. Pure helpers: no React, no
 * infrastructure imports.
 *
 * This is NOT whole-shot readiness (that is IA2 Overview). It answers one
 * question: "are the references themselves in a good state?" The derivation
 * consumes the same accepted `PinnedReferenceState` facts as IA2 but serves a
 * different scope.
 *
 * First-match precedence (highest first):
 *   1. EMPTY            — no pins at all
 *   2. BLOCKED          — any pin unresolved because its snapshot is missing
 *   3. NEEDS_ATTENTION  — any pin without a pinned version
 *   4. COMPLETE         — every pin resolved with a non-empty version
 *
 * Null / malformed / unrecognized input falls back to NEEDS_ATTENTION — never
 * a false COMPLETE.
 */
import type { PinnedReferenceState } from '@/domain/visualControl/types';

export type ReferenceHealthStatus = 'EMPTY' | 'BLOCKED' | 'NEEDS_ATTENTION' | 'COMPLETE';

export type ReferenceHealthTone = 'info' | 'blocked' | 'warning' | 'success';

export interface ReferenceHealth {
  status: ReferenceHealthStatus;
  tone: ReferenceHealthTone;
  reason: string;
  actionLabel: string | null;
  actionDestination: string | null;
}

/** Input tolerates null/undefined arrays and null/undefined elements. */
export type ReferencePinsInput = readonly (PinnedReferenceState | null | undefined)[] | null | undefined;

/** In-tab anchor of the pinned-references section (primary action target). */
export const REFERENCES_PINS_ANCHOR = '#references-pins';

const KIND_NOUN: Record<PinnedReferenceState['kind'], string> = {
  character: 'character',
  location: 'location',
  prop: 'prop',
  style: 'style',
};

function isUsablePin(pin: PinnedReferenceState | null | undefined): pin is PinnedReferenceState {
  return pin !== null && pin !== undefined && typeof pin.resolved === 'boolean';
}

function isMissingReference(pin: PinnedReferenceState): boolean {
  return !pin.resolved && pin.resolvableReason === 'MISSING_REFERENCE';
}

function hasNoPin(pin: PinnedReferenceState): boolean {
  return !pin.versionId || pin.resolvableReason === 'NO_PIN';
}

export function deriveReferenceHealth(pins: ReferencePinsInput, basePath: string): ReferenceHealth {
  if (!pins) {
    return {
      status: 'NEEDS_ATTENTION',
      tone: 'warning',
      reason: 'Reference data unavailable',
      actionLabel: null,
      actionDestination: null,
    };
  }

  if (pins.length === 0) {
    return {
      status: 'EMPTY',
      tone: 'info',
      reason: 'No references pinned to this shot',
      actionLabel: 'Edit shot',
      actionDestination: `${basePath}/edit`,
    };
  }

  if (!pins.every(isUsablePin)) {
    return {
      status: 'NEEDS_ATTENTION',
      tone: 'warning',
      reason: 'Reference data unavailable',
      actionLabel: null,
      actionDestination: null,
    };
  }

  if (pins.some(isMissingReference)) {
    return {
      status: 'BLOCKED',
      tone: 'blocked',
      reason: 'A pinned reference cannot be resolved — the snapshot is missing',
      actionLabel: 'Review unresolved reference',
      actionDestination: REFERENCES_PINS_ANCHOR,
    };
  }

  if (pins.some(hasNoPin)) {
    return {
      status: 'NEEDS_ATTENTION',
      tone: 'warning',
      reason: 'A reference has no pinned version',
      actionLabel: 'Pin a version',
      actionDestination: REFERENCES_PINS_ANCHOR,
    };
  }

  if (pins.every((pin) => pin.resolved && Boolean(pin.versionId))) {
    return {
      status: 'COMPLETE',
      tone: 'success',
      reason: 'All references pinned and resolved',
      actionLabel: null,
      actionDestination: null,
    };
  }

  return {
    status: 'NEEDS_ATTENTION',
    tone: 'warning',
    reason: 'A reference needs review',
    actionLabel: 'Review references',
    actionDestination: REFERENCES_PINS_ANCHOR,
  };
}

/**
 * Creator-facing reason text. For BLOCKED and NEEDS_ATTENTION the reason
 * identifies the reference category (character / location / prop / style) of
 * the first offending pin; other states pass through unchanged.
 */
export function formatHealthReason(health: ReferenceHealth, pins: ReferencePinsInput): string {
  if (!pins) return health.reason;

  if (health.status === 'BLOCKED') {
    const offender = pins.find((pin): pin is PinnedReferenceState => isUsablePin(pin) && isMissingReference(pin));
    if (offender) return `${health.reason} (${KIND_NOUN[offender.kind]})`;
  }

  if (health.status === 'NEEDS_ATTENTION') {
    const offender = pins.find((pin): pin is PinnedReferenceState => isUsablePin(pin) && hasNoPin(pin));
    if (offender) return `${health.reason} (${KIND_NOUN[offender.kind]})`;
  }

  return health.reason;
}

export function referenceHealthLabel(status: ReferenceHealthStatus): string {
  switch (status) {
    case 'EMPTY':
      return 'No references';
    case 'BLOCKED':
      return 'Blocked';
    case 'NEEDS_ATTENTION':
      return 'Needs attention';
    case 'COMPLETE':
      return 'Complete';
  }
}

export function referenceHealthGlyph(status: ReferenceHealthStatus): string {
  switch (status) {
    case 'EMPTY':
      return '○';
    case 'BLOCKED':
      return '✕';
    case 'NEEDS_ATTENTION':
      return '⚠';
    case 'COMPLETE':
      return '✓';
  }
}
