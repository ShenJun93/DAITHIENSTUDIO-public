/**
 * Visual Control service (VC1 — TASK-UI-VISUAL-CONTROL-001).
 *
 * The only impure half of the read model: `gatherVisualControlEvidence` calls
 * existing services and repositories and flattens their output into a
 * serializable, Zod-validated `VisualControlEvidence` snapshot (no new
 * repository, no new port method, no writes). `deriveVisualControlState` is a
 * pure domain function; this module supplies the sha256 content hash and the
 * service boundary that validates both halves.
 *
 * Read-only: repeated reads create no rows, no activity, no generation and no
 * approval. Zero provider calls — capability is read from descriptors only.
 */
import { createHash } from 'node:crypto';
import { DomainError, notFound } from '@/domain/errors';
import { formatSnapshotId, parseVersionId } from '@/domain/visualControl/approvedVersions';
import { deriveVisualControlState } from '@/domain/visualControl/derive';
import {
  visualControlEvidenceSchema,
  visualControlStateSchema,
  type BindingEvidence,
  type PinnedReferenceState,
  type PromptEvidence,
  type ShotVisualSpecification,
  type VisualControlEvidence,
  type VisualControlState,
} from '@/domain/visualControl/types';
import type { AssetBindingRole } from '@/domain/enums';
import type { Studio } from '../ports';
import type { AssetRecord, PromptRecord, PromptVersionRecord, ShotRecord } from '../records';
import { createContinuityService } from './continuityService';
import { createProductionStrategyService } from './productionStrategyService';
import { createPromptService } from './promptService';

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

const ROLE_BY_BIBLE_TARGET: Record<'character' | 'location' | 'prop' | 'style', AssetBindingRole> = {
  character: 'identity-anchor',
  location: 'environment-anchor',
  prop: 'prop-anchor',
  style: 'style-anchor',
};

function toShotVisualSpecification(shot: ShotRecord): ShotVisualSpecification {
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
    continuityIn: { characters: shot.continuity.incoming.characters, environment: shot.continuity.incoming.environment },
    continuityOut: { characters: shot.continuity.outgoing.characters, environment: shot.continuity.outgoing.environment },
    intentionalChanges: shot.continuity.intentionalChanges,
  };
}

async function pinState(
  studio: Studio,
  kind: 'character' | 'location' | 'prop' | 'style',
  refId: string,
  code: string,
  versionId: string,
  source: PinnedReferenceState['source'],
): Promise<PinnedReferenceState> {
  if (!versionId) {
    return { kind, refId, code, versionId: null, source, resolved: false, resolvableReason: 'NO_PIN' };
  }
  const parsed = parseVersionId(versionId);
  const snapshot = await studio.bibles.version(kind, refId, parsed.version);
  if (!snapshot) {
    return { kind, refId, code, versionId, source, resolved: false, resolvableReason: 'MISSING_REFERENCE' };
  }
  return { kind, refId, code, versionId, source, resolved: true, resolvableReason: null };
}

async function gatherPins(
  studio: Studio,
  shot: ShotRecord,
  imagePrompt: { prompt: PromptRecord; version: PromptVersionRecord } | null,
): Promise<PinnedReferenceState[]> {
  const pins: PinnedReferenceState[] = [];
  for (const ref of shot.characters) {
    const character = await studio.bibles.characterById(ref.characterId);
    pins.push(await pinState(studio, 'character', ref.characterId, character?.code ?? '', ref.versionId, 'shot-field'));
  }
  if (shot.locationId) {
    const location = await studio.bibles.locationById(shot.locationId);
    pins.push(await pinState(studio, 'location', shot.locationId, location?.code ?? '', shot.locationVersionId ?? '', 'shot-field'));
  }
  for (const ref of shot.props) {
    const prop = await studio.bibles.propById(ref.propId);
    pins.push(await pinState(studio, 'prop', ref.propId, prop?.code ?? '', ref.versionId, 'shot-field'));
  }
  const styleRef = imagePrompt?.version.lockRefs.style ?? null;
  if (styleRef) {
    pins.push(await pinState(studio, 'style', styleRef.id, styleRef.code, formatSnapshotId(styleRef.code, styleRef.version), 'prompt-lockref'));
  }
  return pins;
}

function toPromptEvidence(latest: { prompt: PromptRecord; version: PromptVersionRecord } | null): PromptEvidence | null {
  if (!latest) return null;
  return {
    kind: latest.prompt.kind === 'video' ? 'video' : 'image',
    promptId: latest.prompt.id,
    version: latest.version.version,
    compiled: latest.version.compiled,
    negative: latest.version.negative,
    lint: latest.version.lint,
    lockRefs: latest.version.lockRefs,
  };
}

/** Gathers the read-only evidence for one project-scoped shot. */
export async function gatherVisualControlEvidence(
  studio: Studio,
  projectIdOrSlug: string,
  shotId: string,
): Promise<VisualControlEvidence> {
  const { projects, shots, scenes, assets, productionAssetBindings } = studio;

  const project = (await projects.byId(projectIdOrSlug)) ?? (await projects.bySlug(projectIdOrSlug));
  if (!project) throw notFound('Project', projectIdOrSlug);

  const shot = await shots.byId(shotId);
  if (!shot) throw notFound('Shot', shotId);
  if (shot.projectId !== project.id) {
    throw new DomainError('VALIDATION_FAILED', `Shot ${shot.code} does not belong to project ${project.slug}.`);
  }

  const scene = await scenes.byId(shot.sceneId);
  const sceneShots = await shots.listByScene(shot.sceneId);
  const ordered = [...sceneShots].sort((a, b) => a.shotNumber - b.shotNumber);
  const index = ordered.findIndex((candidate) => candidate.id === shot.id);
  const previousShotCode = index > 0 ? ordered[index - 1]?.code ?? null : null;
  const nextShotCode = index >= 0 && index < ordered.length - 1 ? ordered[index + 1]?.code ?? null : null;

  const continuity = createContinuityService(studio);
  const strategy = createProductionStrategyService(studio);
  const promptService = createPromptService(studio);

  const [continuityReport, readiness, imagePrompt, videoPrompt] = await Promise.all([
    continuity.forShot(shot.id),
    strategy.readiness(project.id),
    promptService.latestForShot(shot.id, 'image'),
    promptService.latestForShot(shot.id, 'video'),
  ]);

  const pinnedReferences = await gatherPins(studio, shot, imagePrompt);
  const pinnedSnapshotIds = new Set(
    pinnedReferences.map((ref) => ref.versionId).filter((value): value is string => Boolean(value)),
  );

  const allBindings = await productionAssetBindings.listByProject(project.id);
  const relevantBindings = allBindings.filter(
    (binding) =>
      (binding.targetType === 'shot' && binding.targetId === shot.id) ||
      (binding.targetType !== 'shot' && pinnedSnapshotIds.has(binding.targetVersionId)),
  );

  const bindingAssetIds = [...new Set(relevantBindings.map((binding) => binding.assetId))];
  const assetRows = await Promise.all(bindingAssetIds.map((id) => assets.byId(id)));
  const approvalByAsset = new Map(
    assetRows.filter((asset): asset is AssetRecord => Boolean(asset)).map((asset) => [asset.id, asset.approvalState]),
  );
  const bindings: BindingEvidence[] = relevantBindings.map((binding) => ({
    assetId: binding.assetId,
    targetType: binding.targetType,
    targetId: binding.targetId,
    targetVersionId: binding.targetVersionId,
    role: binding.role,
    approvalState: approvalByAsset.get(binding.assetId) ?? 'pending',
  }));

  const approvedShotKeyframeAssetIds = bindings
    .filter((binding) => binding.targetType === 'shot' && binding.targetId === shot.id && binding.approvalState === 'approved')
    .map((binding) => binding.assetId)
    .sort();

  const shotAssets = (await assets.list(project.id, { shotId: shot.id, limit: 100 })).map((asset) => ({
    assetId: asset.id,
    kind: asset.kind,
    name: asset.name,
    approvalState: asset.approvalState,
  }));

  const descriptors = studio.providers.descriptors();
  const transitionNote = [shot.continuity.incoming.note, shot.continuity.outgoing.note]
    .map((note) => note.trim())
    .filter(Boolean)
    .join(' → ');

  const evidence: VisualControlEvidence = {
    projectId: project.id,
    projectSlug: project.slug,
    shotId: shot.id,
    shotCode: shot.code,
    shot: toShotVisualSpecification(shot),
    sceneCode: scene?.code ?? '',
    neighbors: { previousShotCode, nextShotCode },
    pinnedReferences,
    approvedAnchors: readiness.anchors.map((anchor) => ({
        kind: anchor.targetType as 'character' | 'location' | 'prop' | 'style',
        refId: anchor.targetId,
        snapshotId: anchor.snapshotId,
        approvedAssetIds: [...anchor.approvedAssetIds].sort(),
        role: ROLE_BY_BIBLE_TARGET[anchor.targetType as 'character' | 'location' | 'prop' | 'style'],
      })),
    approvedShotKeyframeAssetIds,
    prompts: {
      image: toPromptEvidence(imagePrompt),
      video: toPromptEvidence(videoPrompt),
    },
    continuity: { findings: continuityReport.findings, transitionNote },
    shotAssets,
    bindings,
    outputProfile: {
      aspectRatio: project.aspectRatio,
      resolution: project.resolution,
      frameRate: project.frameRate,
    },
    capability: {
      image: descriptors.some((descriptor) => descriptor.capabilities.textToImage),
      video: descriptors.some((descriptor) => descriptor.capabilities.textToVideo),
    },
    computedAt: studio.clock.nowIso(),
  };

  return visualControlEvidenceSchema.parse(evidence);
}

/** Read-only, derived Visual Control projection for one project-scoped shot. */
export function createVisualControlService(studio: Studio) {
  return {
    async evidence(projectIdOrSlug: string, shotId: string): Promise<VisualControlEvidence> {
      return gatherVisualControlEvidence(studio, projectIdOrSlug, shotId);
    },

    async overview(projectIdOrSlug: string, shotId: string): Promise<VisualControlState> {
      const evidence = await gatherVisualControlEvidence(studio, projectIdOrSlug, shotId);
      return visualControlStateSchema.parse(deriveVisualControlState(evidence, sha256Hex));
    },
  };
}

export type VisualControlService = ReturnType<typeof createVisualControlService>;
