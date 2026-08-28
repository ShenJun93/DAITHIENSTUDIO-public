import type { ProductionType } from '@/domain/enums';
import { createProductionStrategyService } from './productionStrategyService';
import { createProjectService } from './projectService';
import type { Studio } from '../ports';
import type {
  AssetRecord,
  CharacterRecord,
  GenerationRecord,
  LocationRecord,
  PromptRecord,
  SceneRecord,
  ShotRecord,
} from '../records';

export type WorkspaceStageState = 'complete' | 'in-progress' | 'attention' | 'not-started';

export interface WorkspaceJourneyStage {
  key: string;
  label: string;
  state: WorkspaceStageState;
  detail: string;
  href: string;
}

export interface WorkspaceWarning {
  key: string;
  label: string;
  detail: string;
  href: string;
}

export interface CreativeEntitySummary {
  kind: 'character' | 'location';
  id: string;
  code: string;
  name: string;
  subtitle: string;
  status: string;
  lockEnabled: boolean | null;
  version: number;
  updatedAt: string;
  sceneUsage: number;
  shotUsage: number;
  metadata: { label: string; value: string }[];
  warnings: string[];
}

export interface CreativeEntityBrowserResult {
  activeEpisodeId: string | null;
  entries: CreativeEntitySummary[];
}

export interface CreativeSceneSummary {
  id: string;
  code: string;
  number: number;
  title: string;
  synopsis: string;
  locationName: string | null;
  timeOfDay: string;
  status: string;
  durationSeconds: number;
  shotCount: number;
  characterCount: number;
  warnings: string[];
}

export interface CreativeSceneBoardResult {
  activeEpisodeId: string | null;
  scriptStatus: string | null;
  scriptVersion: number | null;
  scenes: CreativeSceneSummary[];
}

export interface CreativeAssetCoverage {
  total: number;
  approved: number;
}

export interface CreativeMediaKindEvidence {
  promptCount: number;
  generationCount: number;
  failedGenerationCount: number;
  assetTotal: number;
  approvedAssets: number;
}

export interface CreativeShotMediaEvidence {
  image: CreativeMediaKindEvidence;
  video: CreativeMediaKindEvidence;
}

export interface CreativeShotSummary {
  id: string;
  code: string;
  sceneCode: string;
  shotNumber: number;
  title: string;
  description: string;
  shotSize: string;
  cameraAngle: string;
  durationSeconds: number;
  status: string;
  promptCount: number;
  generationStatus: string | null;
  assetCoverage: CreativeAssetCoverage;
  /** Always populated by the real read projection; optional only for legacy typed fixtures. */
  mediaEvidence?: CreativeShotMediaEvidence;
  updatedAt: string;
  warnings: string[];
}

export interface CreativeShotStoryboardResult {
  activeEpisodeId: string | null;
  sceneFilter: string | null;
  sceneFilterValid: boolean;
  shots: CreativeShotSummary[];
}

export interface CreativeWorkspaceOverview {
  project: Awaited<ReturnType<ReturnType<typeof createProjectService>['get']>>;
  activeEpisodeId: string | null;
  productionType: ProductionType | null;
  productionStrategy: 'hybrid' | 'auto';
  counts: { scenes: number; shots: number; bibles: number; assets: number; approvedAssets: number; pendingAssets: number };
  readiness: { readyForStoryboard: boolean; readyForCompose: boolean; readyShots: number; totalShots: number; missingAnchors: number };
  journey: WorkspaceJourneyStage[];
  warnings: WorkspaceWarning[];
  hasProductionData: boolean;
  /** Always populated by the real read projection; optional only for legacy typed fixtures. */
  hasTimeline?: boolean;
}

function stage(key: string, label: string, state: WorkspaceStageState, detail: string, href: string): WorkspaceJourneyStage {
  return { key, label, state, detail, href };
}

function metadataField(label: string, value: string | null | undefined): { label: string; value: string } | null {
  return value && value.trim() ? { label, value } : null;
}

function characterSummary(character: CharacterRecord, scenes: SceneRecord[], shots: ShotRecord[]): CreativeEntitySummary {
  const metadata = [
    metadataField('Age range', character.identity?.ageRange),
    metadataField('Species', character.identity?.species),
    metadataField('Voice profile', character.voiceProfileId ? 'Assigned' : 'Not set'),
  ].filter((entry): entry is { label: string; value: string } => entry !== null);

  return {
    kind: 'character',
    id: character.id,
    code: character.code,
    name: character.name,
    subtitle: character.role,
    status: character.status,
    lockEnabled: character.lockEnabled,
    version: character.currentVersion,
    updatedAt: character.updatedAt,
    sceneUsage: scenes.filter((scene) => scene.characters.includes(character.id)).length,
    shotUsage: shots.filter((shot) => shot.characters.some((ref) => ref.characterId === character.id)).length,
    metadata,
    warnings: character.lockEnabled ? [] : ['Lock disabled — this entry is not protected from further edits before generation.'],
  };
}

function locationSummary(location: LocationRecord, scenes: SceneRecord[], shots: ShotRecord[]): CreativeEntitySummary {
  const metadata = [
    metadataField('Era', location.era),
    metadataField('Continuity notes', location.continuityNotes ? 'Recorded' : null),
  ].filter((entry): entry is { label: string; value: string } => entry !== null);

  return {
    kind: 'location',
    id: location.id,
    code: location.code,
    name: location.name,
    subtitle: location.type,
    status: location.status,
    lockEnabled: null,
    version: location.currentVersion,
    updatedAt: location.updatedAt,
    sceneUsage: scenes.filter((scene) => scene.locationId === location.id).length,
    shotUsage: shots.filter((shot) => shot.locationId === location.id).length,
    metadata,
    warnings: [],
  };
}

function sceneSummary(scene: SceneRecord, shots: ShotRecord[], locationById: Map<string, string>): CreativeSceneSummary {
  const shotCount = shots.filter((shot) => shot.sceneId === scene.id).length;
  const warnings: string[] = [];
  if (!scene.locationId) warnings.push('No location assigned.');
  if (shotCount === 0) warnings.push('No shots built yet.');

  return {
    id: scene.id,
    code: scene.code,
    number: scene.number,
    title: scene.title,
    synopsis: scene.summary,
    locationName: scene.locationId ? (locationById.get(scene.locationId) ?? null) : null,
    timeOfDay: scene.timeOfDay,
    status: scene.status,
    durationSeconds: scene.durationSeconds,
    shotCount,
    characterCount: scene.characters.length,
    warnings,
  };
}

/**
 * Pure read adapter over records that shotStoryboard() has already fetched.
 * It deliberately ignores non-image/video kinds instead of collapsing them
 * into one generic media counter.
 */
export function summarizeShotMediaEvidence(
  prompts: readonly Pick<PromptRecord, 'kind'>[],
  generations: readonly Pick<GenerationRecord, 'kind' | 'status'>[],
  assets: readonly Pick<AssetRecord, 'kind' | 'approvalState'>[],
): CreativeShotMediaEvidence {
  const summarize = (kind: 'image' | 'video'): CreativeMediaKindEvidence => {
    const kindPrompts = prompts.filter((prompt) => prompt.kind === kind);
    const kindGenerations = generations.filter((generation) => generation.kind === kind);
    const kindAssets = assets.filter((asset) => asset.kind === kind);
    return {
      promptCount: kindPrompts.length,
      generationCount: kindGenerations.length,
      failedGenerationCount: kindGenerations.filter((generation) => generation.status === 'failed').length,
      assetTotal: kindAssets.length,
      approvedAssets: kindAssets.filter((asset) => asset.approvalState === 'approved').length,
    };
  };

  return { image: summarize('image'), video: summarize('video') };
}

/** Read-only persisted projection for the project workspace. */
export function createCreativeWorkspaceService(studio: Studio) {
  return {
    async overview(projectIdOrSlug: string, episodeId?: string): Promise<CreativeWorkspaceOverview> {
      const overview = await createProjectService(studio).overview(projectIdOrSlug, episodeId);
      const project = overview.project;
      const [production, assets, timeline, exports] = await Promise.all([
        createProductionStrategyService(studio).readiness(project.id),
        studio.assets.list(project.id, { limit: 1000 }),
        studio.timelines.current(project.id, overview.activeEpisodeId ?? undefined),
        studio.exports.listByProject(project.id),
      ]);
      const slug = project.slug;
      const approvedAssets = assets.filter((asset) => asset.approvalState === 'approved').length;
      const pendingAssets = assets.filter((asset) => asset.approvalState === 'pending').length;
      const bibleCount = overview.characters.length + overview.locations.length + overview.props.length + overview.styles.length;
      const readyShots = production.shots.filter((shot) => shot.ready).length;
      const hasScriptContent = Boolean(overview.script?.raw.trim());
      const scriptState: WorkspaceStageState = overview.script?.parsedAt ? 'complete' : hasScriptContent ? 'in-progress' : 'not-started';

      const journey = [
        stage('project', 'Project', project.creativeBrief.logline || project.description ? 'complete' : 'in-progress', project.status, `/projects/${slug}`),
        stage('bibles', 'Bibles', bibleCount > 0 ? 'complete' : 'not-started', `${bibleCount} entries`, `/projects/${slug}/bibles`),
        stage('script', 'Script', scriptState, overview.script ? `${overview.script.status} · v${overview.script.version}` : 'No script', `/projects/${slug}/script`),
        stage('scenes', 'Scenes', overview.scenes.length > 0 ? 'complete' : 'not-started', `${overview.scenes.length} scenes`, `/projects/${slug}/script`),
        stage('shots', 'Shots', overview.shots.length > 0 ? 'complete' : 'not-started', `${overview.shots.length} shots`, `/projects/${slug}/shots`),
        stage('media', 'Media', approvedAssets > 0 ? (readyShots === overview.shots.length && overview.shots.length > 0 ? 'complete' : 'in-progress') : 'not-started', `${approvedAssets} approved`, `/projects/${slug}/assets`),
        stage('timeline', 'Timeline', timeline ? 'complete' : 'not-started', timeline ? timeline.name : 'No timeline', `/projects/${slug}/export`),
        stage('export', 'Export', exports.length > 0 ? 'complete' : 'not-started', `${exports.length} exports`, `/projects/${slug}/export`),
      ];

      const warnings: WorkspaceWarning[] = [];
      if (!overview.script || !hasScriptContent) warnings.push({ key: 'script-empty', label: 'Script empty', detail: 'No script content is available for the selected episode.', href: `/projects/${slug}/script` });
      else if (!overview.script.parsedAt) warnings.push({ key: 'script-unparsed', label: 'Script not parsed', detail: `Script v${overview.script.version} has no parsed scene state.`, href: `/projects/${slug}/script` });
      if (overview.scenes.length === 0) warnings.push({ key: 'scenes', label: 'Scenes missing', detail: 'No persisted scenes are available for the selected episode.', href: `/projects/${slug}/script` });
      if (overview.shots.length === 0) warnings.push({ key: 'shots', label: 'Shots missing', detail: 'No persisted shots are available for the selected episode.', href: `/projects/${slug}/shots` });
      if (production.missingAnchorSnapshotIds.length > 0) warnings.push({ key: 'anchors', label: 'Production references incomplete', detail: `${production.missingAnchorSnapshotIds.length} pinned Bible snapshots have no approved anchor.`, href: `/projects/${slug}/production` });
      const missingShotMedia = production.shots.length - readyShots;
      if (missingShotMedia > 0) warnings.push({ key: 'shot-media', label: 'Shot media incomplete', detail: `${missingShotMedia} of ${production.shots.length} shots have no ready production source.`, href: `/projects/${slug}/production` });
      if (pendingAssets > 0) warnings.push({ key: 'asset-review', label: 'Asset review pending', detail: `${pendingAssets} assets are pending approval.`, href: `/projects/${slug}/assets` });
      const failedGenerations = overview.generationCounts.failed ?? 0;
      if (failedGenerations > 0) warnings.push({ key: 'generation-failures', label: 'Generation failures', detail: `${failedGenerations} generation jobs failed.`, href: `/projects/${slug}/queue` });

      return {
        project,
        activeEpisodeId: overview.activeEpisodeId,
        productionType: project.productionType ?? null,
        productionStrategy: project.productionStrategy,
        counts: { scenes: overview.scenes.length, shots: overview.shots.length, bibles: bibleCount, assets: assets.length, approvedAssets, pendingAssets },
        readiness: { readyForStoryboard: production.readyForStoryboard, readyForCompose: overview.shots.length > 0 && production.readyForCompose, readyShots, totalShots: production.shots.length, missingAnchors: production.missingAnchorSnapshotIds.length },
        journey,
        warnings,
        hasProductionData: Boolean(hasScriptContent || overview.script?.parsedAt || overview.scenes.length || overview.shots.length || assets.length),
        hasTimeline: Boolean(timeline),
      };
    },

    async characterBrowser(projectIdOrSlug: string, episodeId?: string): Promise<CreativeEntityBrowserResult> {
      const overview = await createProjectService(studio).overview(projectIdOrSlug, episodeId);
      return {
        activeEpisodeId: overview.activeEpisodeId,
        entries: overview.characters.map((character) => characterSummary(character, overview.scenes, overview.shots)),
      };
    },

    async locationBrowser(projectIdOrSlug: string, episodeId?: string): Promise<CreativeEntityBrowserResult> {
      const overview = await createProjectService(studio).overview(projectIdOrSlug, episodeId);
      return {
        activeEpisodeId: overview.activeEpisodeId,
        entries: overview.locations.map((location) => locationSummary(location, overview.scenes, overview.shots)),
      };
    },

    async sceneBoard(projectIdOrSlug: string, episodeId?: string): Promise<CreativeSceneBoardResult> {
      const overview = await createProjectService(studio).overview(projectIdOrSlug, episodeId);
      const locationById = new Map(overview.locations.map((location) => [location.id, location.name]));
      const scenes = [...overview.scenes]
        .sort((a, b) => a.number - b.number)
        .map((scene) => sceneSummary(scene, overview.shots, locationById));

      return {
        activeEpisodeId: overview.activeEpisodeId,
        scriptStatus: overview.script?.status ?? null,
        scriptVersion: overview.script?.version ?? null,
        scenes,
      };
    },

    async shotStoryboard(projectIdOrSlug: string, episodeId?: string, sceneCode?: string): Promise<CreativeShotStoryboardResult> {
      const overview = await createProjectService(studio).overview(projectIdOrSlug, episodeId);
      const sceneCodeById = new Map(overview.scenes.map((scene) => [scene.id, scene.code]));
      const filterScene = sceneCode ? overview.scenes.find((scene) => scene.code === sceneCode) : undefined;
      const shotList = (sceneCode ? overview.shots.filter((shot) => shot.sceneId === filterScene?.id) : overview.shots)
        .slice()
        .sort((a, b) => a.sortIndex - b.sortIndex);

      const shots = await Promise.all(
        shotList.map(async (shot): Promise<CreativeShotSummary> => {
          const [prompts, generations, assets] = await Promise.all([
            studio.prompts.listByShot(shot.id),
            studio.generations.listByShot(shot.id),
            studio.assets.list(shot.projectId, { shotId: shot.id, limit: 500 }),
          ]);
          const latestGeneration = [...generations].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )[0];
          const warnings: string[] = [];
          if (prompts.length === 0) warnings.push('No prompt compiled yet.');

          return {
            id: shot.id,
            code: shot.code,
            sceneCode: sceneCodeById.get(shot.sceneId) ?? '—',
            shotNumber: shot.shotNumber,
            title: shot.title,
            description: shot.description,
            shotSize: shot.shotSize,
            cameraAngle: shot.cameraAngle,
            durationSeconds: shot.durationSeconds,
            status: shot.status,
            promptCount: prompts.length,
            generationStatus: latestGeneration?.status ?? null,
            assetCoverage: {
              total: assets.length,
              approved: assets.filter((asset) => asset.approvalState === 'approved').length,
            },
            mediaEvidence: summarizeShotMediaEvidence(prompts, generations, assets),
            updatedAt: shot.updatedAt,
            warnings,
          };
        }),
      );

      return {
        activeEpisodeId: overview.activeEpisodeId,
        sceneFilter: sceneCode ?? null,
        sceneFilterValid: !sceneCode || Boolean(filterScene),
        shots,
      };
    },
  };
}

export type CreativeWorkspaceService = ReturnType<typeof createCreativeWorkspaceService>;
