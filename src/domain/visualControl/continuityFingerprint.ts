/**
 * Stable continuity-content fingerprint (VC1 — TASK-UI-VISUAL-CONTROL-001).
 *
 * The fingerprint covers every decision-relevant field the continuity checker
 * produces: `rule`, `classification`, `severity`, `field`, `expected`,
 * `actual`, `shotCodes` and the normalized `transitionNote`. It never includes
 * the raw `message` (derived from the structural fields) or `sceneCode`
 * (derived from shot membership) — a change in either of those must not
 * invalidate an approval.
 *
 * `classification` is included deliberately: a change from `missing-transition`
 * to `intentional-change` (via a transition note or an `intentionalChanges`
 * entry) inverts an approval decision even when `severity` alone does not
 * change.
 *
 * Content uses a total deterministic order across every canonical member, and
 * `shotCodes` is sorted within each entry, so any two semantically equivalent
 * finding sets produce the same digest even when multiple findings share a
 * rule and field. The digest itself is computed by the caller-supplied
 * `ContentHash` (sha256 lives in the application layer — domain must stay free
 * of node builtins).
 */
import type { ContinuityClass } from '@/domain/enums';
import type { ContinuityFinding } from '@/domain/schemas';
import { canonical, type ContentHash } from './canonical';

export interface ContinuityFingerprintContent {
  rule: string;
  classification: ContinuityClass;
  severity: 'error' | 'warning' | 'info';
  field: string;
  expected: string;
  actual: string;
  /** Affected shot codes, sorted. */
  shotCodes: string[];
  /** Normalized transition-note evidence; "" when no note exists. */
  transitionNote: string;
}

function compareContinuityFingerprintContent(
  a: ContinuityFingerprintContent,
  b: ContinuityFingerprintContent,
): number {
  return (
    a.rule.localeCompare(b.rule) ||
    a.field.localeCompare(b.field) ||
    a.classification.localeCompare(b.classification) ||
    a.severity.localeCompare(b.severity) ||
    a.expected.localeCompare(b.expected) ||
    a.actual.localeCompare(b.actual) ||
    a.shotCodes.join('\u0000').localeCompare(b.shotCodes.join('\u0000')) ||
    a.transitionNote.localeCompare(b.transitionNote)
  );
}

/** Normalizes findings into stable content with a total deterministic order. */
export function continuityFingerprintContent(
  findings: readonly ContinuityFinding[],
  transitionNote: string,
): ContinuityFingerprintContent[] {
  return findings
    .map((finding) => ({
      rule: finding.rule,
      classification: finding.classification,
      severity: finding.severity,
      field: finding.field,
      expected: finding.expected,
      actual: finding.actual,
      shotCodes: [...finding.shotCodes].sort(),
      transitionNote,
    }))
    .sort(compareContinuityFingerprintContent);
}

export function sortContinuityFingerprintContent(
  content: readonly ContinuityFingerprintContent[],
): ContinuityFingerprintContent[] {
  return [...content].sort(compareContinuityFingerprintContent);
}

/** Canonical serialization of stable content (the continuity fingerprint member). */
export function continuityFingerprintCanonical(content: readonly ContinuityFingerprintContent[]): string {
  return canonical(sortContinuityFingerprintContent(content), { sortObjectArrays: false });
}

/** Stable content hash of the continuity state for one shot. */
export function fingerprintContinuity(
  findings: readonly ContinuityFinding[],
  transitionNote: string,
  hash: ContentHash,
): string {
  return hash(continuityFingerprintCanonical(continuityFingerprintContent(findings, transitionNote)));
}
