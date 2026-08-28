/**
 * Canonical approved-version reference (VISUAL-APPROVAL-CONTRACT.md §4).
 *
 * One structure is used everywhere a dependency version must be named exactly
 * — the package fingerprint, the persisted approval package, audit display
 * and staleness comparison. Compact display strings such as `CHAR001_V2` or
 * `<promptId>@<version>` are derived for display only and are never the
 * authoritative canonical format; the full tuple is.
 */
import { DomainError } from '@/domain/errors';

export const APPROVED_VERSION_KINDS = ['character', 'location', 'prompt', 'prop', 'style'] as const;
export type ApprovedVersionRefKind = (typeof APPROVED_VERSION_KINDS)[number];

export interface ApprovedVersionRef {
  kind: ApprovedVersionRefKind;
  /** The entity row id (promptId for the prompt kind). */
  entityId: string;
  /** CHAR001, LOC002, PROP003, STY001 — or the promptId for the prompt kind. */
  code: string;
  /** Canonical snapshot id: "CHAR001_V2" for bibles, "<promptId>@<version>" for prompts. */
  versionId: string;
  /** Integer version number (for prompts: the version; for bibles: from the snapshot id). */
  versionNumber: number;
}

const SNAPSHOT_VERSION_ID = /^((?:CHAR|LOC|PROP|STY)\d{3})_V(\d+)$/;

/**
 * Formats a bible code and version into the canonical `CODE_VN` snapshot id
 * (`CHAR001` + 2 -> `CHAR001_V2`). The single owning construction path for
 * this grammar — every other layer that needs a bible snapshot id string
 * calls this instead of re-deriving the template.
 */
export function formatSnapshotId(code: string, version: number): string {
  return `${code}_V${version}`;
}

/** Parses a bible snapshot id (`CHAR001_V2`) or a prompt id (`<promptId>@<version>`). */
export function parseVersionId(versionId: string): { code: string; version: number } {
  const snapshot = SNAPSHOT_VERSION_ID.exec(versionId);
  if (snapshot) return { code: snapshot[1] as string, version: Number.parseInt(snapshot[2] as string, 10) };
  const at = versionId.lastIndexOf('@');
  if (at > 0) {
    const version = Number(versionId.slice(at + 1));
    if (Number.isInteger(version) && version > 0) return { code: versionId.slice(0, at), version };
  }
  throw new DomainError('VALIDATION_FAILED', `Not a supported version id: "${versionId}"`);
}

/**
 * Parses a bible snapshot id (`CHAR001_V2`) only — rejects prompt-style
 * `<promptId>@<version>` ids, unlike `parseVersionId`. Callers that only
 * ever operate on bible snapshots (never prompts) use this so an
 * unexpected prompt-shaped id fails closed instead of being silently
 * accepted as if it were a bible code.
 */
export function parseSnapshotId(versionId: string): { code: string; version: number } {
  const snapshot = SNAPSHOT_VERSION_ID.exec(versionId);
  if (!snapshot) {
    throw new DomainError('VALIDATION_FAILED', `Not a bible snapshot id: "${versionId}"`);
  }
  return { code: snapshot[1] as string, version: Number.parseInt(snapshot[2] as string, 10) };
}

/** Alphabetical group order: character, location, prompt, prop, style (§4.2). */
const KIND_ORDER: Record<ApprovedVersionRefKind, number> = {
  character: 0,
  location: 1,
  prompt: 2,
  prop: 3,
  style: 4,
};

/**
 * Canonical sort order (§4.2): group by kind alphabetically, then by `code`,
 * then by `versionNumber` ascending. Deterministic for any input order.
 */
export function sortApprovedVersionRefs(refs: readonly ApprovedVersionRef[]): ApprovedVersionRef[] {
  return [...refs].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.code.localeCompare(b.code) ||
      a.versionNumber - b.versionNumber ||
      a.entityId.localeCompare(b.entityId) ||
      a.versionId.localeCompare(b.versionId),
  );
}

/** Display-only derivation — never an authoritative fingerprint input. */
export function approvedVersionRefCompact(ref: ApprovedVersionRef): string {
  return ref.kind === 'prompt' ? `${ref.code}@${ref.versionNumber}` : `${ref.code}_V${ref.versionNumber}`;
}
