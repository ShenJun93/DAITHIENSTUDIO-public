import type { ShotStatus } from './enums';
import { DomainError } from './errors';
import type { LintResult } from './schemas';
import { blockingIssues } from './prompt/lint';

export type AssetApprovalState = 'pending' | 'approved' | 'rejected';
export type AssetDecision = 'approved' | 'rejected' | 'changes-requested';

export interface AssetApprovalEvidence {
  currentState: AssetApprovalState;
  decision: AssetDecision;
  quality: { assetId: string | null; passed: boolean } | null;
  assetId: string;
  generationId: string | null;
  promptVersion: { promptId: string; version: number; lint: LintResult | null } | null;
}

export function approvalStateForDecision(decision: AssetDecision): AssetApprovalState {
  return decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'pending';
}

export function assertAssetDecisionAllowed(evidence: AssetApprovalEvidence): { idempotent: boolean } {
  const targetState = approvalStateForDecision(evidence.decision);
  if (evidence.currentState === 'approved' && evidence.decision === 'approved') return { idempotent: true };

  if (evidence.currentState === 'approved') {
    throw new DomainError(
      'IMMUTABLE_APPROVED_ASSET',
      `Asset ${evidence.assetId} is approved. Create a new version instead of changing the approved one.`,
    );
  }

  if (evidence.decision !== 'approved') return { idempotent: false };

  if (!evidence.quality || evidence.quality.assetId !== evidence.assetId) {
    throw new DomainError('CONFLICT', `Asset ${evidence.assetId} must have an exact-asset quality report before approval.`);
  }
  if (evidence.generationId) {
    if (!evidence.promptVersion) {
      throw new DomainError('MISSING_REFERENCE', `Asset ${evidence.assetId} has no exact generation-pinned prompt version.`);
    }
    const blocking = evidence.promptVersion.lint ? blockingIssues(evidence.promptVersion.lint) : [];
    if (!evidence.promptVersion.lint || blocking.length > 0) {
      throw new DomainError(
        'PROMPT_LINT_BLOCKED',
        `Prompt v${evidence.promptVersion.version} has ${blocking.length || 'unknown'} blocking lint finding(s).`,
        { promptId: evidence.promptVersion.promptId, version: evidence.promptVersion.version, issues: blocking },
      );
    }
  }

  return { idempotent: false };
}

export function deriveShotStatusAfterAssetDecision(
  currentStatus: ShotStatus,
  candidateStates: AssetApprovalState[],
): ShotStatus {
  if (candidateStates.some((state) => state === 'approved')) return 'approved';
  if (candidateStates.length > 0 && candidateStates.every((state) => state === 'rejected')) return 'rejected';
  if (currentStatus === 'approved' || currentStatus === 'rejected') return 'review';
  return currentStatus;
}
