/**
 * Asset service — storage, lineage and approval.
 *
 * Lineage is the point. Every stored artefact records:
 *   generation → prompt version → shot → bible snapshots → parent assets
 * so `lineage(assetId)` can walk backwards from a finished clip to the script
 * line that caused it. That trail is also what makes rollback and cost audit
 * possible (governance spec §3.3).
 */
import { DomainError, notFound } from '@/domain/errors';
import { registerAssetSchema, type RegisterAssetInput } from '@/domain/schemas';
import type { AssetKind } from '@/domain/enums';
import { validateFileArtifact } from '@/domain/fileValidation';
import { assertAssetDecisionAllowed } from '@/domain/approval';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import type { GenerationArtifact, Studio } from '../ports';
import type { AssetRecord, GenerationRecord, ProjectRecord } from '../records';

export interface LineageNode {
  asset: AssetRecord;
  relation: string;
  generation: GenerationRecord | null;
  promptVersion: { promptId: string; version: number; compiled: string } | null;
  shotCode: string | null;
  bibleVersions: { kind: string; code: string; versionId: string }[];
  parents: LineageNode[];
}

const KIND_BY_MIME: { test: RegExp; kind: AssetKind }[] = [
  { test: /^image\//, kind: 'image' },
  { test: /^video\//, kind: 'video' },
  { test: /^audio\//, kind: 'voice' },
];

function inferKind(mimeType: string, generationKind: string): AssetKind {
  if (generationKind === 'music') return 'music';
  if (generationKind === 'sound') return 'sound';
  if (generationKind === 'voice') return 'voice';
  const match = KIND_BY_MIME.find((entry) => entry.test.test(mimeType));
  return match?.kind ?? 'document';
}

export function createAssetService(studio: Studio) {
  const { assets, generations, prompts, shots, scenes, projects, approvals, productionAssetBindings, storage, activity, logger, clock, mediaMetadataProbe } = studio;

  /** Deterministic, human-navigable storage key (spec §27). */
  function keyFor(input: {
    projectSlug: string;
    shotCode: string | null;
    bucket: string;
    fileName: string;
  }): string {
    const safe = input.fileName
      .replace(/\\/g, '/')
      .split('/')
      .pop()!
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .slice(0, 120);
    const parts = ['projects', input.projectSlug];
    if (input.shotCode) parts.push('shots', input.shotCode.toLowerCase());
    parts.push(input.bucket, safe);
    return parts.join('/');
  }

  return {
    /** Writes provider artefacts to storage and records them with full lineage. */
    async storeGenerationArtifacts(input: {
      generation: GenerationRecord;
      project: ProjectRecord;
      shotCode: string | null;
      sceneId: string | null;
      artifacts: GenerationArtifact[];
    }): Promise<string[]> {
      const bucket =
        input.generation.kind === 'video'
          ? 'videos'
          : input.generation.kind === 'image'
            ? 'images'
            : 'audio';

      const ids: string[] = [];

      for (const [index, artifact] of input.artifacts.entries()) {
        validateFileArtifact(artifact.data, artifact.mimeType, artifact.filename);

        const stored = await storage.put(
          keyFor({
            projectSlug: input.project.slug,
            shotCode: input.shotCode,
            bucket,
            fileName: artifact.filename,
          }),
          artifact.data,
          artifact.mimeType,
        );

        // Duplicate detection: identical bytes are not stored twice as separate
        // logical assets, they are linked instead.
        const duplicate = await assets.byChecksum(input.project.id, stored.checksum);
        if (duplicate) {
          logger.info(`[asset] identical bytes already registered as ${duplicate.id}; linking instead of duplicating`);
          ids.push(duplicate.id);
          continue;
        }

        const asset = await assets.register({
          projectId: input.project.id,
          shotId: input.generation.shotId,
          generationId: input.generation.id,
          kind: inferKind(artifact.mimeType, input.generation.kind),
          name: `${input.shotCode ?? input.project.slug} · ${input.generation.kind} ${index + 1}`,
          storageKey: stored.key,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
          width: artifact.width ?? null,
          height: artifact.height ?? null,
          durationSeconds: artifact.durationSeconds ?? null,
          tags: [input.generation.kind, input.generation.provider, input.generation.model].filter(Boolean),
          metadata: {
            provider: input.generation.provider,
            model: input.generation.model,
            seed: input.generation.seed,
            promptId: input.generation.promptId,
            promptVersion: input.generation.promptVersion,
            params: input.generation.params,
            generatedAt: clock.nowIso(),
          },
        });

        // Lineage edges from every reference asset to this new artefact.
        for (const parentId of input.generation.referenceAssetIds) {
          const parent = await assets.byId(parentId);
          if (parent) await assets.link(parentId, asset.id, 'derivedFrom');
        }

        ids.push(asset.id);
      }

      return ids;
    },

    /** Registers a file the operator uploaded by hand (reference art, plates). */
    async upload(
      projectIdOrSlug: string,
      raw: unknown,
      file: { fileName: string; mimeType: string; data: Buffer },
    ): Promise<AssetRecord> {
      const project = (await projects.byId(projectIdOrSlug)) ?? (await projects.bySlug(projectIdOrSlug));
      if (!project) throw notFound('Project', projectIdOrSlug);

      const input: RegisterAssetInput = registerAssetSchema.parse({ ...(raw as object), projectId: project.id });

      validateFileArtifact(file.data, file.mimeType, file.fileName);

      const shot = input.shotId ? await shots.byId(input.shotId) : null;
      if (input.shotId && !shot) throw notFound('Shot', input.shotId);
      if (shot && shot.projectId !== project.id) {
        throw new DomainError(
          'CONFLICT',
          `Shot ${shot.id} does not belong to project ${project.id}.`,
          { projectId: project.id, shotId: shot.id },
        );
      }
      const stored = await storage.put(
        keyFor({
          projectSlug: project.slug,
          shotCode: shot?.code ?? null,
          bucket: 'references',
          fileName: file.fileName,
        }),
        file.data,
        file.mimeType,
      );

      const duplicate = await assets.byChecksum(project.id, stored.checksum);
      if (duplicate) return duplicate;

      // Provider-generated assets already carry width/height/durationSeconds
      // from the provider's own artifact metadata; a manual upload has no
      // such source, so probe the file directly. Best-effort: a probe
      // failure (unsupported type, missing ffprobe, corrupt stream) leaves
      // the field null rather than blocking the upload or fabricating 0.
      const probed =
        input.width === undefined && input.height === undefined && input.durationSeconds === undefined
          ? await mediaMetadataProbe.probe(file.data, stored.mimeType).catch(() => null)
          : null;

      const asset = await assets.register({
        projectId: project.id,
        shotId: input.shotId,
        generationId: null,
        kind: input.kind,
        name: input.name,
        storageKey: stored.key,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        width: input.width ?? probed?.width ?? null,
        height: input.height ?? probed?.height ?? null,
        durationSeconds: input.durationSeconds ?? probed?.durationSeconds ?? null,
        tags: input.tags,
        metadata: { ...input.metadata, uploadedAt: clock.nowIso(), originalFileName: file.fileName },
      });

      for (const parentId of input.parentAssetIds) {
        if (await assets.byId(parentId)) await assets.link(parentId, asset.id, 'derivedFrom');
      }

      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'asset.uploaded',
        targetType: 'asset',
        targetId: asset.id,
        details: { kind: asset.kind, sizeBytes: asset.sizeBytes },
      });

      return asset;
    },

    async list(projectIdOrSlug: string, filter?: Parameters<typeof assets.list>[1]) {
      const project = (await projects.byId(projectIdOrSlug)) ?? (await projects.bySlug(projectIdOrSlug));
      if (!project) throw notFound('Project', projectIdOrSlug);
      return assets.list(project.id, filter);
    },

    async byId(id: string) {
      const asset = await assets.byId(id);
      if (!asset) throw notFound('Asset', id);
      return asset;
    },

    async setFavorite(id: string, favorite: boolean) {
      return assets.setFavorite(id, favorite);
    },

    /**
     * Approval is a recorded decision, not a boolean flip, and an approved
     * asset can never be rejected afterwards — corrections make a new version.
     */
    async decide(id: string, decision: 'approved' | 'rejected' | 'changes-requested', note: string, userId: string | null) {
      const asset = await assets.byId(id);
      if (!asset) throw notFound('Asset', id);

      if (asset.approvalState === 'approved' && decision === 'approved') return asset;

      const qualityReport = decision === 'approved' ? await studio.quality.latestForAsset(id) : null;
      const generation = asset.generationId ? await generations.byId(asset.generationId) : null;
      const promptVersion = generation?.promptId && generation.promptVersion
        ? await prompts.version(generation.promptId, generation.promptVersion)
        : null;
      assertAssetDecisionAllowed({
        assetId: asset.id,
        currentState: asset.approvalState,
        decision,
        quality: qualityReport ? { assetId: qualityReport.assetId, passed: qualityReport.passed } : null,
        generationId: asset.generationId,
        promptVersion: promptVersion
          ? { promptId: promptVersion.promptId, version: promptVersion.version, lint: promptVersion.lint }
          : null,
      });

      const committed = await approvals.decideAsset({ assetId: id, decision, note, decidedBy: userId });

      return committed.asset;
    },

    async softDelete(id: string) {
      await assets.softDelete(id);
    },

    /**
     * Walks the lineage graph backwards from an asset.
     * Depth is bounded because a cyclic link, however unlikely, must not hang.
     */
    async lineage(id: string, depth = 6): Promise<LineageNode> {
      const build = async (assetId: string, relation: string, remaining: number): Promise<LineageNode> => {
        const asset = await assets.byId(assetId);
        if (!asset) throw notFound('Asset', assetId);

        const generation = asset.generationId ? await generations.byId(asset.generationId) : null;

        let promptVersion: LineageNode['promptVersion'] = null;
        const bibleVersions: LineageNode['bibleVersions'] = [];
        if (generation?.promptId && generation.promptVersion) {
          const version = await prompts.version(generation.promptId, generation.promptVersion);
          if (version) {
            promptVersion = {
              promptId: generation.promptId,
              version: version.version,
              compiled: version.compiled,
            };
            for (const ref of version.lockRefs.characters) {
              bibleVersions.push({ kind: 'character', code: ref.code, versionId: formatSnapshotId(ref.code, ref.version) });
            }
            if (version.lockRefs.style) {
              bibleVersions.push({
                kind: 'style',
                code: version.lockRefs.style.code,
                versionId: formatSnapshotId(version.lockRefs.style.code, version.lockRefs.style.version),
              });
            }
            if (version.lockRefs.location) {
              bibleVersions.push({
                kind: 'location',
                code: version.lockRefs.location.code,
                versionId: formatSnapshotId(version.lockRefs.location.code, version.lockRefs.location.version),
              });
            }
            for (const ref of version.lockRefs.props) {
              bibleVersions.push({ kind: 'prop', code: ref.code, versionId: formatSnapshotId(ref.code, ref.version) });
            }
          }
        }

        const bindings = (await productionAssetBindings.listByProject(asset.projectId))
          .filter((binding) => binding.assetId === asset.id);
        for (const binding of bindings) {
          if (binding.targetType === 'shot' || !binding.targetVersionId) continue;
          const code = binding.targetVersionId.replace(/_V\d+$/, '');
          if (!bibleVersions.some((entry) => entry.kind === binding.targetType && entry.versionId === binding.targetVersionId)) {
            bibleVersions.push({
              kind: binding.targetType,
              code,
              versionId: binding.targetVersionId,
            });
          }
        }

        const shotBinding = bindings.find((binding) => binding.targetType === 'shot');
        const shot = asset.shotId
          ? await shots.byId(asset.shotId)
          : shotBinding
            ? await shots.byId(shotBinding.targetId)
            : null;

        const parentEdges = remaining > 0 ? await assets.parents(assetId) : [];
        const parents: LineageNode[] = [];
        for (const edge of parentEdges) {
          parents.push(await build(edge.parentId, edge.relation, remaining - 1));
        }

        return { asset, relation, generation, promptVersion, shotCode: shot?.code ?? null, bibleVersions, parents };
      };

      return build(id, 'self', depth);
    },

    /** Flat, printable version of the lineage chain for the UI and exports. */
    async lineageTrail(id: string): Promise<string[]> {
      const root = await this.lineage(id);
      const trail: string[] = [];
      const walk = (node: LineageNode, indent: number): void => {
        const prefix = indent === 0 ? '' : `${'  '.repeat(indent)}← `;
        const detail = [
          node.asset.kind,
          node.shotCode ?? '',
          node.generation ? `${node.generation.provider}/${node.generation.model}` : '',
          node.promptVersion ? `prompt v${node.promptVersion.version}` : '',
          node.bibleVersions.map((entry) => entry.versionId).join(' '),
        ]
          .filter(Boolean)
          .join(' · ');
        trail.push(`${prefix}${node.asset.name} [${detail}]`);
        for (const parent of node.parents) walk(parent, indent + 1);
      };
      walk(root, 0);

      const asset = await assets.byId(id);
      if (asset?.shotId) {
        const shot = await shots.byId(asset.shotId);
        if (shot) {
          const scene = await scenes.byId(shot.sceneId);
          if (scene) trail.push(`  ← scene ${scene.code} "${scene.title}"`);
        }
      }
      return trail;
    },
  };
}

export type AssetService = ReturnType<typeof createAssetService>;
