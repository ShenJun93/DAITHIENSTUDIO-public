/**
 * Visual Control read-model types (VC1 — TASK-UI-VISUAL-CONTROL-001).
 *
 * A derived, read-only surface over Shot, Bible, Prompt, Asset and Continuity
 * data that already exists. Nothing here is a second persistence authority:
 * `VisualControlEvidence` is a serializable snapshot gathered fresh from
 * existing services, and `VisualControlState` is the pure derivation of it.
 * No readiness decision (`READY_FOR_RENDER`), approval record or stale flag
 * is produced or stored by VC1 — the evidence object is the completeness /
 * readiness input that VC2 and VC8 derive from later.
 *
 * Zod contracts cover the gather→derive boundary and the service output so
 * every boundary is validated (AGENTS.md rule 10).
 */
import { z } from 'zod';
import {
  APPROVAL_STATES,
  ASSET_BINDING_ROLES,
  ASSET_KINDS,
  CONTINUITY_CLASSES,
} from '@/domain/enums';
import type { AssetBindingRole, AssetKind } from '@/domain/enums';
import {
  cameraMovementSchema,
  characterStateSchema,
  continuityFindingSchema,
  environmentStateSchema,
  lintResultSchema,
  lockRefsSchema,
} from '@/domain/schemas';
import type { CameraMovement, ContinuityFinding, LockRefs, LintResult } from '@/domain/schemas';
import type { ApprovedVersionRef } from './approvedVersions';
import type { ContinuityFingerprintContent } from './continuityFingerprint';

// ---------------------------------------------------------------------------
// Shot visual specification (docs/product/SHOT-VISUAL-SPECIFICATION.md)
// ---------------------------------------------------------------------------

/** Character + environment state at one boundary side, without the note. */
export interface ShotBoundaryState {
  characters: Record<string, z.infer<typeof characterStateSchema>>;
  environment: z.infer<typeof environmentStateSchema>;
}

/**
 * The provider-neutral visual package fields for one shot.
 *
 * The output profile (aspectRatio/resolution/frameRate) is a PROJECT field and
 * is carried at assembly time via `VisualControlEvidence.outputProfile` — it is
 * deliberately not an authored field here (TASK-UI-VISUAL-CONTROL-001).
 */
export interface ShotVisualSpecification {
  shotSize: string;
  cameraAngle: string;
  cameraMovement: CameraMovement;
  lens: string;
  durationSeconds: number;
  lighting: string;
  importance: 'normal' | 'key';
  dialogue: string;
  emotion: string;
  continuityIn: ShotBoundaryState;
  continuityOut: ShotBoundaryState;
  intentionalChanges: string[];
}

// ---------------------------------------------------------------------------
// Pinned / approved references (VISUAL-CONTROL-ARCHITECTURE.md §3.1)
// ---------------------------------------------------------------------------

/**
 * Concept 1 — a Shot (or its compiled prompt) points at an immutable snapshot.
 * `versionId: null` means UNPINNED; `resolved` reports whether the pinned
 * snapshot still exists (LOCK_REQUIRED / MISSING_REFERENCE => false).
 */
export interface PinnedReferenceState {
  kind: 'character' | 'location' | 'prop' | 'style';
  refId: string;
  code: string;
  versionId: string | null;
  source: 'shot-field' | 'prompt-lockref';
  resolved: boolean;
  resolvableReason: 'NO_PIN' | 'MISSING_REFERENCE' | null;
}

/** Concept 2 — an operator approved a reference asset/snapshot for use. */
export interface ApprovedReferenceState {
  kind: 'character' | 'location' | 'prompt' | 'prop' | 'style' | 'shot';
  refId: string;
  versionId: string;
  approvedAssetIds: string[];
  role: AssetBindingRole;
}

/** Raw anchor evidence from productionStrategyService.readiness().anchors. */
export interface ApprovedAnchorEvidence {
  kind: 'character' | 'location' | 'prop' | 'style';
  refId: string;
  snapshotId: string;
  approvedAssetIds: string[];
  role: AssetBindingRole;
}

// ---------------------------------------------------------------------------
// Prompt review state (architecture §3.2)
// ---------------------------------------------------------------------------

export interface PromptEvidence {
  kind: 'image' | 'video';
  promptId: string;
  version: number;
  compiled: string;
  negative: string;
  lint: LintResult | null;
  lockRefs: LockRefs;
}

export interface PromptReviewState {
  kind: 'image' | 'video';
  promptId: string | null;
  version: number | null;
  compiled: string | null;
  negative: string | null;
  lintOk: boolean | null;
  lintScore: number | null;
  lockRefs: LockRefs | null;
}

// ---------------------------------------------------------------------------
// Asset review state (architecture §3.3)
// ---------------------------------------------------------------------------

export interface AssetEvidence {
  assetId: string;
  kind: AssetKind;
  name: string;
  approvalState: 'pending' | 'approved' | 'rejected';
}

export interface AssetReviewState {
  assetId: string;
  kind: AssetKind;
  name: string;
  approvalState: 'pending' | 'approved' | 'rejected';
  boundRole: AssetBindingRole | null;
  isRequiredReference: boolean;
  contributesToReadiness: boolean;
}

export interface BindingEvidence {
  assetId: string;
  targetType: string;
  targetId: string;
  targetVersionId: string;
  role: AssetBindingRole;
  approvalState: string;
}

// ---------------------------------------------------------------------------
// Continuity state (architecture §3.4)
// ---------------------------------------------------------------------------

export interface VisualContinuityState {
  previousShotCode: string | null;
  nextShotCode: string | null;
  findings: ContinuityFinding[];
  blockers: ContinuityFinding[];
  /** Stable decision-relevant content, sorted by rule then field. */
  content: ContinuityFingerprintContent[];
  fingerprint: string;
}

// ---------------------------------------------------------------------------
// Evidence + derived state
// ---------------------------------------------------------------------------

/** Serializable evidence snapshot — the completeness/readiness inputs (VC1). */
export interface VisualControlEvidence {
  projectId: string;
  projectSlug: string;
  shotId: string;
  shotCode: string;
  shot: ShotVisualSpecification;
  sceneCode: string;
  neighbors: { previousShotCode: string | null; nextShotCode: string | null };
  pinnedReferences: PinnedReferenceState[];
  approvedAnchors: ApprovedAnchorEvidence[];
  approvedShotKeyframeAssetIds: string[];
  prompts: { image: PromptEvidence | null; video: PromptEvidence | null };
  continuity: { findings: ContinuityFinding[]; transitionNote: string };
  shotAssets: AssetEvidence[];
  bindings: BindingEvidence[];
  outputProfile: { aspectRatio: string; resolution: string; frameRate: number };
  capability: { image: boolean; video: boolean };
  computedAt: string;
}

/** Pure derivation of the evidence (read-only, computed fresh on every read). */
export interface VisualControlState {
  projectId: string;
  projectSlug: string;
  shotId: string;
  shotCode: string;
  visualSpec: ShotVisualSpecification;
  pinnedReferences: PinnedReferenceState[];
  approvedReferences: ApprovedReferenceState[];
  prompt: { image: PromptReviewState; video: PromptReviewState };
  assets: AssetReviewState[];
  continuity: VisualContinuityState;
  /** Current derived package fingerprint — VC8 compares stored approvals against this. */
  packageFingerprint: string;
}

/** The stable-content input of the Shot visual package fingerprint (§3). */
export interface VisualPackageFingerprintInput {
  shotVisualFields: {
    shotSize: string;
    cameraAngle: string;
    cameraMovement: CameraMovement;
    lens: string;
    durationSeconds: number;
    lighting: string;
    importance: string;
    dialogue: string;
    emotion: string;
    continuityIn: ShotBoundaryState;
    continuityOut: ShotBoundaryState;
    intentionalChanges: string[];
  };
  pinnedReferences: ApprovedVersionRef[];
  prompt: {
    image: { promptId: string; version: number } | null;
    video: { promptId: string; version: number } | null;
  };
  /** Bound reference assets with their approval states, sorted by assetId. */
  assets: { assetId: string; role: string; targetType: string; targetId: string; approvalState: string }[];
  continuityFingerprint: ContinuityFingerprintContent[];
  outputProfile: { aspectRatio: string; resolution: string; frameRate: number };
}

// ---------------------------------------------------------------------------
// Zod contracts (validated at every boundary)
// ---------------------------------------------------------------------------

export const shotBoundaryStateSchema = z.object({
  characters: z.record(characterStateSchema),
  environment: environmentStateSchema,
});

export const shotVisualSpecificationSchema = z.object({
  shotSize: z.string(),
  cameraAngle: z.string(),
  cameraMovement: cameraMovementSchema,
  lens: z.string(),
  durationSeconds: z.number().int(),
  lighting: z.string(),
  importance: z.enum(['normal', 'key']),
  dialogue: z.string(),
  emotion: z.string(),
  continuityIn: shotBoundaryStateSchema,
  continuityOut: shotBoundaryStateSchema,
  intentionalChanges: z.array(z.string()),
});

export const pinnedReferenceStateSchema = z.object({
  kind: z.enum(['character', 'location', 'prop', 'style']),
  refId: z.string(),
  code: z.string(),
  versionId: z.string().nullable(),
  source: z.enum(['shot-field', 'prompt-lockref']),
  resolved: z.boolean(),
  resolvableReason: z.enum(['NO_PIN', 'MISSING_REFERENCE']).nullable(),
});

export const approvedAnchorEvidenceSchema = z.object({
  kind: z.enum(['character', 'location', 'prop', 'style']),
  refId: z.string(),
  snapshotId: z.string(),
  approvedAssetIds: z.array(z.string()),
  role: z.enum(ASSET_BINDING_ROLES),
});

export const approvedReferenceStateSchema = z.object({
  kind: z.enum(['character', 'location', 'prompt', 'prop', 'style', 'shot']),
  refId: z.string(),
  versionId: z.string(),
  approvedAssetIds: z.array(z.string()),
  role: z.enum(ASSET_BINDING_ROLES),
});

export const promptEvidenceSchema = z.object({
  kind: z.enum(['image', 'video']),
  promptId: z.string(),
  version: z.number().int().min(1),
  compiled: z.string(),
  negative: z.string(),
  lint: lintResultSchema.nullable(),
  lockRefs: lockRefsSchema,
});

export const promptReviewStateSchema = z.object({
  kind: z.enum(['image', 'video']),
  promptId: z.string().nullable(),
  version: z.number().int().min(1).nullable(),
  compiled: z.string().nullable(),
  negative: z.string().nullable(),
  lintOk: z.boolean().nullable(),
  lintScore: z.number().int().nullable(),
  lockRefs: lockRefsSchema.nullable(),
});

export const assetEvidenceSchema = z.object({
  assetId: z.string(),
  kind: z.enum(ASSET_KINDS),
  name: z.string(),
  approvalState: z.enum(APPROVAL_STATES),
});

export const assetReviewStateSchema = z.object({
  assetId: z.string(),
  kind: z.enum(ASSET_KINDS),
  name: z.string(),
  approvalState: z.enum(APPROVAL_STATES),
  boundRole: z.enum(ASSET_BINDING_ROLES).nullable(),
  isRequiredReference: z.boolean(),
  contributesToReadiness: z.boolean(),
});

export const bindingEvidenceSchema = z.object({
  assetId: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  targetVersionId: z.string(),
  role: z.enum(ASSET_BINDING_ROLES),
  approvalState: z.string(),
});

export const continuityFingerprintContentSchema = z.object({
  rule: z.string(),
  classification: z.enum(CONTINUITY_CLASSES),
  severity: z.enum(['error', 'warning', 'info']),
  field: z.string(),
  expected: z.string(),
  actual: z.string(),
  shotCodes: z.array(z.string()),
  transitionNote: z.string(),
});

export const visualContinuityStateSchema = z.object({
  previousShotCode: z.string().nullable(),
  nextShotCode: z.string().nullable(),
  findings: z.array(continuityFindingSchema),
  blockers: z.array(continuityFindingSchema),
  content: z.array(continuityFingerprintContentSchema),
  fingerprint: z.string(),
});

export const visualControlEvidenceSchema = z.object({
  projectId: z.string(),
  projectSlug: z.string(),
  shotId: z.string(),
  shotCode: z.string(),
  shot: shotVisualSpecificationSchema,
  sceneCode: z.string(),
  neighbors: z.object({
    previousShotCode: z.string().nullable(),
    nextShotCode: z.string().nullable(),
  }),
  pinnedReferences: z.array(pinnedReferenceStateSchema),
  approvedAnchors: z.array(approvedAnchorEvidenceSchema),
  approvedShotKeyframeAssetIds: z.array(z.string()),
  prompts: z.object({
    image: promptEvidenceSchema.nullable(),
    video: promptEvidenceSchema.nullable(),
  }),
  continuity: z.object({
    findings: z.array(continuityFindingSchema),
    transitionNote: z.string(),
  }),
  shotAssets: z.array(assetEvidenceSchema),
  bindings: z.array(bindingEvidenceSchema),
  outputProfile: z.object({
    aspectRatio: z.string(),
    resolution: z.string(),
    frameRate: z.number(),
  }),
  capability: z.object({ image: z.boolean(), video: z.boolean() }),
  computedAt: z.string(),
});

export const visualControlStateSchema = z.object({
  projectId: z.string(),
  projectSlug: z.string(),
  shotId: z.string(),
  shotCode: z.string(),
  visualSpec: shotVisualSpecificationSchema,
  pinnedReferences: z.array(pinnedReferenceStateSchema),
  approvedReferences: z.array(approvedReferenceStateSchema),
  prompt: z.object({
    image: promptReviewStateSchema,
    video: promptReviewStateSchema,
  }),
  assets: z.array(assetReviewStateSchema),
  continuity: visualContinuityStateSchema,
  packageFingerprint: z.string(),
});
