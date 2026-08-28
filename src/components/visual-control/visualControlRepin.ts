/**
 * VC3 (TASK-UI-VISUAL-CONTROL-001) — pure UI helpers and data types for
 * reference review and controlled repinning. No React here, so the option
 * building, idempotency detection and feedback text are unit-testable without
 * a DOM. The server boundary assembles `RepinData` from the accepted VC1 read
 * model plus the existing bible-version authorities; the client repin control
 * consumes it.
 */
import { formatSnapshotId, parseSnapshotId } from '@/domain/visualControl/approvedVersions';

export interface RepinActionResult {
  ok: boolean;
  message: string;
  code?: string;
}

/** One selectable bible snapshot for an entity, labelled with its snapshot id. */
export interface RepinVersionOption {
  versionId: string;
  label: string;
}

/** Read-only project-level Style review state (VC3 Style is not repinnable). */
export interface ProjectStyleReviewState {
  isProjectLevel: true;
  styleId: string | null;
  code: string;
  name: string;
  currentVersion: number | null;
  /** The version a compiled prompt locked via `lockRefs.style`, when present. */
  lockedVersionId: string | null;
  resolved: boolean;
}

/** Everything the VC3 repin controls need, assembled server-side. */
export interface RepinData {
  action: (formData: FormData) => Promise<RepinActionResult>;
  versionsByRef: Record<string, RepinVersionOption[]>;
  names: Record<string, string>;
  projectStyle: ProjectStyleReviewState;
}

/**
 * Builds the exact snapshot ids (`CHAR001_V1`, …) for a bible entity's saved
 * versions, ascending by version number. Only versions that belong to this
 * entity are ever offered, so the selector can never present another entity's
 * snapshot.
 */
export function buildVersionOptions(code: string, versions: readonly number[]): RepinVersionOption[] {
  return [...versions]
    .filter((version) => Number.isInteger(version) && version > 0)
    .sort((a, b) => a - b)
    .map((version) => {
      // formatSnapshotId requires a non-empty code; an empty code falls back
      // to the bare "V<n>" form it has always used, unrelated to the
      // domain's grammar (which never has an empty-code case).
      const versionId = code ? formatSnapshotId(code, version) : `V${version}`;
      return { versionId, label: versionId };
    });
}

/** A pending repin only exists when the selection differs from the current pin. */
export function isRepinChange(currentVersionId: string | null, selectedVersionId: string): boolean {
  return Boolean(selectedVersionId) && selectedVersionId !== currentVersionId;
}

/**
 * Confirmation is required when an existing valid pin is being replaced. An
 * empty/missing pin needs no confirmation (there is nothing to overwrite);
 * an invalid pin (unresolved snapshot) is a correction, not a replacement of
 * a working pin.
 */
export function shouldConfirmRepin(currentVersionId: string | null, resolved: boolean): boolean {
  return Boolean(currentVersionId) && resolved;
}

/** Human text describing the pending change, shown before persistence. */
export function pendingRepinText(
  kind: 'character' | 'location' | 'prop',
  code: string,
  currentVersionId: string | null,
  selectedVersionId: string,
): string {
  if (currentVersionId && currentVersionId !== selectedVersionId) {
    return `Will repin ${kind} ${code} from ${currentVersionId} to ${selectedVersionId}.`;
  }
  if (!currentVersionId) {
    return `Will pin ${kind} ${code} to ${selectedVersionId}.`;
  }
  return `No change to ${kind} ${code}; already pinned to ${currentVersionId}.`;
}

/** True when a snapshot id parses as a well-formed bible snapshot id. */
export function isWellFormedVersionId(versionId: string): boolean {
  try {
    parseSnapshotId(versionId);
    return true;
  } catch {
    return false;
  }
}
