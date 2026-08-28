/**
 * VC2 — Readiness strip presentation (TASK-UI-VISUAL-CONTROL-001).
 *
 * A pure, deterministic derivation of the Readiness strip and NOT_READY reasons
 * from the accepted VC1 read model (`VisualControlState`). Nothing here calls a
 * provider, writes, or computes an approval — `VisualControlState` is a read-only
 * snapshot, and VC8 is the future authority for render approvals. The wording
 * therefore distinguishes three distinct facts (docs/architecture/RENDER-READINESS-CONTRACT.md):
 * evidence complete ≠ operator package approved ≠ provider execution authorized.
 * Until VC8 ships, `execution` is always `not-authorized` and that absence is
 * stated explicitly rather than hidden.
 */
import type { VisualControlState } from '@/domain/visualControl/types';

export type CompletionState = 'complete' | 'partial' | 'empty';
export type PinState = 'unresolved' | 'all-pinned';
export type ApprovalState = 'missing-approval' | 'approved';
export type ContinuityState = 'blocked' | 'finding' | 'clean';
export type ExecutionState = 'authorized' | 'not-authorized';
export type EvidenceTone = 'success' | 'warning' | 'blocked' | 'info';

export interface ReadinessBlocker {
  code: string;
  message: string;
}

export interface ReadinessPresentation {
  tone: EvidenceTone;
  label: string;
  detail: string;
}

export interface ReadinessEvidence {
  hasContent: boolean;
  completion: CompletionState;
  pins: PinState | null;
  approvals: ApprovalState | null;
  continuity: ContinuityState | null;
  execution: ExecutionState;
  blockers: readonly ReadinessBlocker[];
  presentation: ReadinessPresentation;
}

export const BLOCKER_CODES = {
  BLOCKED_PIN: 'BLOCKED_PIN',
  PROMPT_MISSING: 'PROMPT_MISSING',
  APPROVAL_PENDING: 'APPROVAL_PENDING',
  CONTINUITY_BLOCKED: 'CONTINUITY_BLOCKED',
  EXECUTION_NOT_AUTHORIZED: 'EXECUTION_NOT_AUTHORIZED',
} as const;

export function deriveReadinessEvidence(state: VisualControlState): ReadinessEvidence {
  const { pinnedReferences, prompt, assets, continuity } = state;

  const hasImagePrompt = prompt.image.promptId !== null;
  const hasVideoPrompt = prompt.video.promptId !== null;
  const hasPrompt = hasImagePrompt || hasVideoPrompt;
  const hasContent = pinnedReferences.length > 0 || hasPrompt || assets.length > 0;

  const unresolvedPins = pinnedReferences.filter((pin) => !pin.resolved);
  const properlyPinned = pinnedReferences.filter((pin) => pin.resolved && pin.resolvableReason === null);
  const requiredAssets = assets.filter((asset) => asset.isRequiredReference);
  const unapprovedRequired = requiredAssets.filter((asset) => asset.approvalState !== 'approved');

  const completion: CompletionState = !hasContent
    ? 'empty'
    : hasPrompt && unresolvedPins.length === 0 && requiredAssets.length > 0 && unapprovedRequired.length === 0
      ? 'complete'
      : 'partial';

  const pins: PinState | null = pinnedReferences.length > 0
    ? unresolvedPins.length > 0
      ? 'unresolved'
      : 'all-pinned'
    : null;

  const approvals: ApprovalState | null = properlyPinned.length > 0
    ? requiredAssets.length > 0 && unapprovedRequired.length === 0
      ? 'approved'
      : 'missing-approval'
    : null;

  const continuityState: ContinuityState = continuity.blockers.length > 0
    ? 'blocked'
    : continuity.findings.length > 0
      ? 'finding'
      : 'clean';

  const execution: ExecutionState = 'not-authorized';

  const blockers: ReadinessBlocker[] = [];
  if (hasContent) {
    if (unresolvedPins[0]) {
      const first = unresolvedPins[0];
      blockers.push({
        code: BLOCKER_CODES.BLOCKED_PIN,
        message: `${first.kind} pin ${first.refId} cannot be resolved (${first.resolvableReason ?? 'unknown'})`,
      });
    }
    if (!hasPrompt) {
      blockers.push({ code: BLOCKER_CODES.PROMPT_MISSING, message: 'No compiled prompt is recorded for this shot yet' });
    }
    if (approvals === 'missing-approval') {
      blockers.push({ code: BLOCKER_CODES.APPROVAL_PENDING, message: 'A required reference asset is not yet approved' });
    }
    if (continuity.blockers[0]) {
      blockers.push({ code: BLOCKER_CODES.CONTINUITY_BLOCKED, message: continuity.blockers[0].message });
    }
    if (blockers.length === 0) {
      blockers.push({
        code: BLOCKER_CODES.EXECUTION_NOT_AUTHORIZED,
        message: 'The shot package is not authorized for provider execution (no VC8 render approval is recorded)',
      });
    }
  }

  return {
    hasContent,
    completion,
    pins,
    approvals,
    continuity: continuityState,
    execution,
    blockers,
    presentation: buildPresentation(hasContent, blockers),
  };
}

function buildPresentation(hasContent: boolean, blockers: readonly ReadinessBlocker[]): ReadinessPresentation {
  if (!hasContent) {
    return {
      tone: 'info',
      label: 'No visual control evidence',
      detail: 'Pin characters, locations, props and a style snapshot, then compile a prompt to build the shot package.',
    };
  }
  const first = blockers[0];
  if (!first) {
    return {
      tone: 'success',
      label: 'Execution authorized',
      detail: 'The shot package is complete and approved; provider execution is authorized.',
    };
  }
  switch (first.code) {
    case BLOCKER_CODES.BLOCKED_PIN:
      return {
        tone: 'blocked',
        label: 'Unresolved reference pin',
        detail: 'Fix the pinned bible snapshot before building the package.',
      };
    case BLOCKER_CODES.CONTINUITY_BLOCKED:
      return { tone: 'blocked', label: 'Continuity blocker', detail: first.message };
    case BLOCKER_CODES.PROMPT_MISSING:
      return {
        tone: 'warning',
        label: 'Prompt not compiled',
        detail: 'Compile the image or video prompt to record its pinned versions and lint.',
      };
    case BLOCKER_CODES.APPROVAL_PENDING:
      return {
        tone: 'warning',
        label: 'Reference approval pending',
        detail: 'Approve the required reference assets to gate package readiness.',
      };
    case BLOCKER_CODES.EXECUTION_NOT_AUTHORIZED:
    default:
      return {
        tone: 'warning',
        label: 'Execution not authorized',
        detail: 'The shot package evidence is in place, but no render approval (VC8) is recorded yet.',
      };
  }
}
