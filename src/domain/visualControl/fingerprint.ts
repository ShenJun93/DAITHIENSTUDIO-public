/**
 * Shot visual package fingerprint (VISUAL-APPROVAL-CONTRACT.md §3).
 *
 * A stable-content digest of everything a visual package approval depends on.
 * The member arrays are normalized to their documented deterministic order —
 * pinned references by kind/code/versionNumber, bound assets by assetId,
 * continuity content by rule/field — so any two semantically equivalent
 * packages hash identically regardless of input order.
 *
 * Pure domain function; the sha256 digest is supplied by the caller
 * (domain must stay free of node builtins).
 */
import { canonical, type ContentHash } from './canonical';
import { sortApprovedVersionRefs } from './approvedVersions';
import { sortContinuityFingerprintContent } from './continuityFingerprint';
import type { VisualPackageFingerprintInput } from './types';

export function fingerprintVisualPackage(input: VisualPackageFingerprintInput, hash: ContentHash): string {
  const normalized: VisualPackageFingerprintInput = {
    ...input,
    pinnedReferences: sortApprovedVersionRefs(input.pinnedReferences),
    assets: [...input.assets].sort(
      (a, b) => a.assetId.localeCompare(b.assetId) || a.targetId.localeCompare(b.targetId) || a.targetType.localeCompare(b.targetType),
    ),
    continuityFingerprint: sortContinuityFingerprintContent(input.continuityFingerprint),
  };
  return hash(canonical(normalized, { sortObjectArrays: false }));
}
