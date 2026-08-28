/**
 * VC4 (TASK-UI-VISUAL-CONTROL-001) — pure presentation helpers for the visual
 * continuity panel. No React here, following the visualControlRepin.ts
 * precedent: character-identity resolution, boundary-state normalisation and
 * finding ordering are unit-testable without a DOM. Every input comes from the
 * accepted VC1 read model (`VisualControlState`) — no new continuity
 * calculation, no provider, no mutation. The accepted VC1 continuity-content
 * fingerprint (`state.continuity.fingerprint`) is displayed by the panel as-is.
 */
import type { CharacterState, ContinuityFinding } from '@/domain/schemas';
import type { PinnedReferenceState, ShotBoundaryState, VisualControlState } from '@/domain/visualControl/types';

/** One character's recorded state at a shot boundary, plus display metadata. */
export interface CharacterBoundaryView {
  id: string;
  /** Display identity: the bible code when the shot pins the character, else the raw id. */
  label: string;
  state: CharacterState;
  /** True when no costume is recorded for this boundary side. */
  missingCostume: boolean;
  /** True when no look (hair or injuries) is recorded for this boundary side. */
  missingLook: boolean;
  /** True when the boundary records at least one non-empty visual field. */
  hasState: boolean;
}

export const SEVERITY_ORDER: Record<ContinuityFinding['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** characterId → bible code for every pinned character reference in the shot. */
export function characterCodeLookup(pins: readonly PinnedReferenceState[]): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const pin of pins) {
    if (pin.kind === 'character' && pin.code) lookup[pin.refId] = pin.code;
  }
  return lookup;
}

function toBoundaryView(id: string, state: CharacterState, lookup: Record<string, string>): CharacterBoundaryView {
  const missingCostume = state.costume.trim().length === 0;
  const missingLook = state.hair.trim().length === 0 && state.injuries.length === 0;
  const hasState = !missingCostume || !missingLook || state.position.trim().length > 0;
  return { id, label: lookup[id] ?? id, state, missingCostume, missingLook, hasState };
}

/**
 * Sorted (by display label) list of character states recorded at one shot
 * boundary (the VC1 read model's `visualSpec.continuityIn/Out.characters`).
 */
export function boundaryCharacterViews(
  boundary: ShotBoundaryState,
  lookup: Record<string, string>,
): CharacterBoundaryView[] {
  return Object.entries(boundary.characters)
    .map(([id, state]) => toBoundaryView(id, state, lookup))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The previous/current/next comparison surface. `entering` is the state
 * carried into this shot from the previous one (`continuityIn`); `leaving` is
 * the state handed to the next shot (`continuityOut`). Neighbour codes come
 * from the accepted read model; null means the neighbour does not exist.
 */
export interface ContinuityComparisonView {
  previousShotCode: string | null;
  nextShotCode: string | null;
  entering: CharacterBoundaryView[];
  leaving: CharacterBoundaryView[];
}

export function deriveContinuityComparison(state: VisualControlState): ContinuityComparisonView {
  const lookup = characterCodeLookup(state.pinnedReferences);
  return {
    previousShotCode: state.continuity.previousShotCode,
    nextShotCode: state.continuity.nextShotCode,
    entering: boundaryCharacterViews(state.visualSpec.continuityIn, lookup),
    leaving: boundaryCharacterViews(state.visualSpec.continuityOut, lookup),
  };
}

export interface FindingSeverityCounts {
  error: number;
  warning: number;
  info: number;
}

export function countFindingsBySeverity(findings: readonly ContinuityFinding[]): FindingSeverityCounts {
  const counts: FindingSeverityCounts = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

/** Deterministic presentation order: severity, then rule, then field. */
export function sortFindings(findings: readonly ContinuityFinding[]): ContinuityFinding[] {
  return [...findings].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      a.rule.localeCompare(b.rule) ||
      a.field.localeCompare(b.field),
  );
}
