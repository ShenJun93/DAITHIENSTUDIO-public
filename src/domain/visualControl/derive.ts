/**
 * Pure Visual Control derivation (VC1 — TASK-UI-VISUAL-CONTROL-001).
 *
 * `deriveVisualControlState` is a pure function of a serializable
 * `VisualControlEvidence` snapshot plus a caller-supplied content hash (the
 * productionJourneyService two-half pattern). Every field is a function of the
 * evidence alone — no I/O, no randomness, no wall-clock reads beyond the
 * `computedAt` the evidence already carries.
 *
 * The readiness decision (R1–R12) and the persisted approval/stale state are
 * intentionally NOT produced here: they belong to VC2 / VC8. This module ships
 * the read model plus the stable package fingerprint that VC8 will compare
 * stored approvals against.
 */
import type { ContentHash } from './canonical';
import { parseVersionId, sortApprovedVersionRefs, type ApprovedVersionRef } from './approvedVersions';
import { fingerprintContinuity, continuityFingerprintCanonical, continuityFingerprintContent } from './continuityFingerprint';
import { fingerprintVisualPackage } from './fingerprint';
import type {
  ApprovedReferenceState,
  AssetReviewState,
  PinnedReferenceState,
  PromptEvidence,
  PromptReviewState,
  ShotVisualSpecification,
  VisualControlEvidence,
  VisualControlState,
  VisualContinuityState,
  VisualPackageFingerprintInput,
} from './types';

function toApprovedVersionRefs(pinned: readonly PinnedReferenceState[]): ApprovedVersionRef[] {
  const refs: ApprovedVersionRef[] = [];
  for (const ref of pinned) {
    if (!ref.versionId) continue;
    const parsed = parseVersionId(ref.versionId);
    refs.push({
      kind: ref.kind,
      entityId: ref.refId,
      code: ref.code || parsed.code,
      versionId: ref.versionId,
      versionNumber: parsed.version,
    });
  }
  return sortApprovedVersionRefs(refs);
}

function toPromptReview(evidence: PromptEvidence | null, kind: 'image' | 'video'): PromptReviewState {
  if (!evidence) {
    return { kind, promptId: null, version: null, compiled: null, negative: null, lintOk: null, lintScore: null, lockRefs: null };
  }
  return {
    kind: evidence.kind,
    promptId: evidence.promptId,
    version: evidence.version,
    compiled: evidence.compiled,
    negative: evidence.negative,
    lintOk: evidence.lint?.ok ?? null,
    lintScore: evidence.lint?.score ?? null,
    lockRefs: evidence.lockRefs,
  };
}

function deriveApprovedReferences(evidence: VisualControlEvidence): ApprovedReferenceState[] {
  const references: ApprovedReferenceState[] = evidence.approvedAnchors.map((anchor) => ({
    kind: anchor.kind,
    refId: anchor.refId,
    versionId: anchor.snapshotId,
    approvedAssetIds: [...anchor.approvedAssetIds].sort(),
    role: anchor.role,
  }));
  if (evidence.approvedShotKeyframeAssetIds.length > 0) {
    references.push({
      kind: 'shot',
      refId: evidence.shotId,
      versionId: '',
      approvedAssetIds: [...evidence.approvedShotKeyframeAssetIds].sort(),
      role: 'storyboard-keyframe',
    });
  }
  return references;
}

function deriveAssets(evidence: VisualControlEvidence): AssetReviewState[] {
  const boundAssetIds = new Set(evidence.bindings.map((binding) => binding.assetId));
  return evidence.shotAssets.map((asset) => {
    const binding = evidence.bindings.find((candidate) => candidate.assetId === asset.assetId);
    const isRequiredReference = boundAssetIds.has(asset.assetId);
    return {
      assetId: asset.assetId,
      kind: asset.kind,
      name: asset.name,
      approvalState: asset.approvalState,
      boundRole: binding?.role ?? null,
      isRequiredReference,
      contributesToReadiness: isRequiredReference && asset.approvalState === 'approved',
    };
  });
}

function deriveContinuity(evidence: VisualControlEvidence, hash: ContentHash): VisualContinuityState {
  const content = continuityFingerprintContent(evidence.continuity.findings, evidence.continuity.transitionNote);
  return {
    previousShotCode: evidence.neighbors.previousShotCode,
    nextShotCode: evidence.neighbors.nextShotCode,
    findings: evidence.continuity.findings,
    blockers: evidence.continuity.findings.filter((finding) => finding.severity === 'error'),
    content,
    fingerprint: fingerprintContinuity(evidence.continuity.findings, evidence.continuity.transitionNote, hash),
  };
}

function toShotVisualFields(shot: ShotVisualSpecification): VisualPackageFingerprintInput['shotVisualFields'] {
  return {
    shotSize: shot.shotSize,
    cameraAngle: shot.cameraAngle,
    cameraMovement: shot.cameraMovement,
    lens: shot.lens,
    durationSeconds: shot.durationSeconds,
    lighting: shot.lighting,
    importance: shot.importance,
    dialogue: shot.dialogue,
    emotion: shot.emotion,
    continuityIn: shot.continuityIn,
    continuityOut: shot.continuityOut,
    intentionalChanges: shot.intentionalChanges,
  };
}

function packageAssets(evidence: VisualControlEvidence) {
  return evidence.bindings
    .map((binding) => ({
      assetId: binding.assetId,
      role: binding.role,
      targetType: binding.targetType,
      targetId: binding.targetId,
      approvalState: binding.approvalState,
    }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId) || a.targetId.localeCompare(b.targetId) || a.targetType.localeCompare(b.targetType));
}

/** Pure derivation: the read model plus the current package fingerprint. */
export function deriveVisualControlState(evidence: VisualControlEvidence, hash: ContentHash): VisualControlState {
  const continuity = deriveContinuity(evidence, hash);
  const packageFingerprint = fingerprintVisualPackage(
    {
      shotVisualFields: toShotVisualFields(evidence.shot),
      pinnedReferences: toApprovedVersionRefs(evidence.pinnedReferences),
      prompt: {
        image: evidence.prompts.image
          ? { promptId: evidence.prompts.image.promptId, version: evidence.prompts.image.version }
          : null,
        video: evidence.prompts.video
          ? { promptId: evidence.prompts.video.promptId, version: evidence.prompts.video.version }
          : null,
      },
      assets: packageAssets(evidence),
      continuityFingerprint: continuity.content,
      outputProfile: evidence.outputProfile,
    },
    hash,
  );

  return {
    projectId: evidence.projectId,
    projectSlug: evidence.projectSlug,
    shotId: evidence.shotId,
    shotCode: evidence.shotCode,
    visualSpec: evidence.shot,
    pinnedReferences: evidence.pinnedReferences,
    approvedReferences: deriveApprovedReferences(evidence),
    prompt: {
      image: toPromptReview(evidence.prompts.image, 'image'),
      video: toPromptReview(evidence.prompts.video, 'video'),
    },
    assets: deriveAssets(evidence),
    continuity,
    packageFingerprint,
  };
}
