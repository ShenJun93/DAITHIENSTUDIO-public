import type { VisualControlState } from './types';

export interface VisualPackageApprovalEligibility {
  eligible: boolean;
  reasons: string[];
}

/**
 * VC8 approval eligibility is derived only from already-authoritative Visual
 * Control evidence. It is intentionally not a second readiness authority and
 * does not imply provider execution authorization.
 */
export function deriveVisualPackageApprovalEligibility(
  state: VisualControlState,
): VisualPackageApprovalEligibility {
  const reasons: string[] = [];

  for (const pin of state.pinnedReferences) {
    if (!pin.resolved || !pin.versionId) {
      reasons.push(`Reference ${pin.code || pin.refId} is not pinned to a resolvable snapshot.`);
      continue;
    }
    const approved = state.approvedReferences.some(
      (reference) => reference.refId === pin.refId && reference.versionId === pin.versionId,
    );
    if (!approved) {
      reasons.push(`Reference ${pin.code || pin.refId} snapshot ${pin.versionId} is not approved.`);
    }
  }

  for (const asset of state.assets) {
    if (asset.isRequiredReference && asset.approvalState !== 'approved') {
      reasons.push(`Required reference asset ${asset.assetId} is not approved.`);
    }
  }

  for (const blocker of state.continuity.blockers) {
    reasons.push(`Continuity blocker ${blocker.rule}: ${blocker.message}`);
  }

  return { eligible: reasons.length === 0, reasons };
}
