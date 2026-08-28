import { z } from 'zod';
import { DomainError, notFound } from '@/domain/errors';
import { bindProductionAssetSchema, type BindProductionAssetInput } from '@/domain/schemas';
import { PRODUCTION_STRATEGIES } from '@/domain/enums';
import { formatSnapshotId } from '@/domain/visualControl/approvedVersions';
import { parseSnapshotId } from './bibleService';
import type { Studio } from '../ports';
import type { AssetRecord, ProductionAssetBindingRecord } from '../records';

const RASTER_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const STORYBOARD_MIME_TYPES = new Set([...RASTER_IMAGE_MIME_TYPES, 'video/mp4', 'video/webm', 'video/quicktime']);

export interface HybridAnchorRequirement {
  targetType: 'character' | 'location' | 'prop' | 'style';
  targetId: string;
  snapshotId: string;
  label: string;
  approvedAssetIds: string[];
}

export interface ProductionShotReadiness {
  shotId: string;
  shotCode: string;
  ready: boolean;
  source: 'manual' | 'provider' | 'missing';
  assetId: string | null;
}

export interface ProductionReadiness {
  strategy: 'hybrid' | 'auto';
  anchors: HybridAnchorRequirement[];
  missingAnchorSnapshotIds: string[];
  shots: ProductionShotReadiness[];
  readyForStoryboard: boolean;
  readyForCompose: boolean;
}

function expectedPrefix(targetType: BindProductionAssetInput['targetType']): string {
  return { character: 'CHAR', location: 'LOC', prop: 'PROP', style: 'STY', shot: '' }[targetType];
}

export function createProductionStrategyService(studio: Studio) {
  const { projects, bibles, shots, assets, productionAssetBindings, activity } = studio;

  async function requireProject(idOrSlug: string) {
    const project = (await projects.byId(idOrSlug)) ?? (await projects.bySlug(idOrSlug));
    if (!project) throw notFound('Project', idOrSlug);
    return project;
  }

  async function validateBinding(projectId: string, input: BindProductionAssetInput): Promise<AssetRecord> {
    const asset = await assets.byId(input.assetId);
    if (!asset || asset.projectId !== projectId) throw notFound('Asset', input.assetId);

    if (input.targetType === 'shot') {
      const shot = await shots.byId(input.targetId);
      if (!shot || shot.projectId !== projectId) throw notFound('Shot', input.targetId);
      if (!STORYBOARD_MIME_TYPES.has(asset.mimeType.toLowerCase())) {
        throw new DomainError('UNSUPPORTED_CAPABILITY', 'Storyboard sources must be PNG, JPEG, WEBP, MP4, WEBM or QuickTime.');
      }
      return asset;
    }

    if (!RASTER_IMAGE_MIME_TYPES.has(asset.mimeType.toLowerCase())) {
      throw new DomainError('UNSUPPORTED_CAPABILITY', 'Bible anchors must be approved-safe PNG, JPEG or WEBP images.');
    }

    const entity = input.targetType === 'character'
      ? await bibles.characterById(input.targetId)
      : input.targetType === 'location'
        ? await bibles.locationById(input.targetId)
        : input.targetType === 'prop'
          ? await bibles.propById(input.targetId)
          : await bibles.styleById(input.targetId);
    if (!entity || entity.projectId !== projectId) throw notFound(input.targetType, input.targetId);

    const parsed = parseSnapshotId(input.targetVersionId);
    if (!parsed.code.startsWith(expectedPrefix(input.targetType)) || parsed.code !== entity.code) {
      throw new DomainError('VALIDATION_FAILED', `Snapshot ${input.targetVersionId} does not belong to ${entity.code}.`);
    }
    const snapshot = await bibles.version(input.targetType, input.targetId, parsed.version);
    if (!snapshot) throw notFound('BibleSnapshot', input.targetVersionId);
    return asset;
  }

  return {
    async setStrategy(projectIdOrSlug: string, strategyRaw: unknown) {
      const project = await requireProject(projectIdOrSlug);
      const strategy = z.enum(PRODUCTION_STRATEGIES).parse(strategyRaw);
      const updated = await projects.update(project.id, { productionStrategy: strategy });
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'production.strategy.updated',
        targetType: 'project',
        targetId: project.id,
        details: { strategy },
      });
      return updated;
    },

    async bind(projectIdOrSlug: string, raw: unknown): Promise<ProductionAssetBindingRecord> {
      const project = await requireProject(projectIdOrSlug);
      const input = bindProductionAssetSchema.parse(raw);
      const asset = await validateBinding(project.id, input);
      const binding = await productionAssetBindings.bind({ projectId: project.id, ...input });
      await activity.log({
        projectId: project.id,
        userId: null,
        action: 'production.reference.bound',
        targetType: input.targetType,
        targetId: input.targetId,
        details: { assetId: asset.id, snapshotId: input.targetVersionId, role: input.role },
      });
      return binding;
    },

    async listBindings(projectIdOrSlug: string) {
      const project = await requireProject(projectIdOrSlug);
      return productionAssetBindings.listByProject(project.id);
    },

    async readiness(projectIdOrSlug: string): Promise<ProductionReadiness> {
      const project = await requireProject(projectIdOrSlug);
      const [shotList, bindings] = await Promise.all([
        shots.listByProject(project.id),
        productionAssetBindings.listByProject(project.id),
      ]);
      const assetList = await assets.list(project.id, { limit: 1000 });
      const assetById = new Map(assetList.map((asset) => [asset.id, asset]));
      const requirements = new Map<string, Omit<HybridAnchorRequirement, 'approvedAssetIds'>>();

      for (const shot of shotList) {
        for (const ref of shot.characters) {
          if (ref.versionId) requirements.set(ref.versionId, { targetType: 'character', targetId: ref.characterId, snapshotId: ref.versionId, label: ref.versionId });
        }
        if (shot.locationId && shot.locationVersionId) {
          requirements.set(shot.locationVersionId, { targetType: 'location', targetId: shot.locationId, snapshotId: shot.locationVersionId, label: shot.locationVersionId });
        }
        for (const ref of shot.props) {
          if (ref.versionId) requirements.set(ref.versionId, { targetType: 'prop', targetId: ref.propId, snapshotId: ref.versionId, label: ref.versionId });
        }
      }
      if (project.styleId) {
        const style = await bibles.styleById(project.styleId);
        if (style) {
          const snapshotId = formatSnapshotId(style.code, style.currentVersion);
          requirements.set(snapshotId, { targetType: 'style', targetId: style.id, snapshotId, label: snapshotId });
        }
      }

      const anchors: HybridAnchorRequirement[] = [...requirements.values()].map((requirement) => ({
        ...requirement,
        approvedAssetIds: bindings
          .filter((binding) =>
            binding.targetType === requirement.targetType &&
            binding.targetId === requirement.targetId &&
            binding.targetVersionId === requirement.snapshotId,
          )
          .map((binding) => assetById.get(binding.assetId))
          .filter((asset): asset is AssetRecord => asset?.approvalState === 'approved')
          .map((asset) => asset.id),
      }));
      const missingAnchorSnapshotIds = anchors
        .filter((requirement) => requirement.approvedAssetIds.length === 0)
        .map((requirement) => requirement.snapshotId)
        .sort();

      const shotReadiness: ProductionShotReadiness[] = [];
      for (const shot of shotList) {
        const shotAssets = assetList.filter((asset) => asset.shotId === shot.id && asset.approvalState === 'approved');
        const boundImages = bindings
          .filter((binding) =>
            binding.targetType === 'shot' &&
            binding.targetId === shot.id &&
            binding.role === 'storyboard-keyframe',
          )
          .map((binding) => assetById.get(binding.assetId))
          .filter((asset): asset is AssetRecord =>
            asset?.approvalState === 'approved' &&
            asset.kind === 'image' &&
            RASTER_IMAGE_MIME_TYPES.has(asset.mimeType.toLowerCase()),
          );
        const selected = project.productionStrategy === 'auto'
          ? shotAssets.find((asset) => asset.kind === 'video' && asset.generationId !== null) ?? null
          : shotAssets.find((asset) => asset.kind === 'video') ?? boundImages[0] ?? null;
        shotReadiness.push({
          shotId: shot.id,
          shotCode: shot.code,
          ready: selected !== null,
          source: selected ? (selected.generationId ? 'provider' : 'manual') : 'missing',
          assetId: selected?.id ?? null,
        });
      }

      return {
        strategy: project.productionStrategy,
        anchors,
        missingAnchorSnapshotIds,
        shots: shotReadiness,
        readyForStoryboard: project.productionStrategy === 'auto' || missingAnchorSnapshotIds.length === 0,
        readyForCompose:
          (project.productionStrategy === 'auto' || missingAnchorSnapshotIds.length === 0) &&
          shotReadiness.every((shot) => shot.ready),
      };
    },
  };
}

export type ProductionStrategyService = ReturnType<typeof createProductionStrategyService>;
