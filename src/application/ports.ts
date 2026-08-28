/**
 * Ports — everything the application layer needs from the outside world.
 *
 * Only these interfaces may be implemented by `src/infrastructure`. Domain code
 * imports nothing from here; application services import nothing from
 * infrastructure. That inversion is what lets the provider, the storage driver
 * and the database be swapped without touching production logic.
 */
import type { GenerationKind, ShotStatus } from '@/domain/enums';
import type { AssetDecision } from '@/domain/approval';
import type {
  ApprovalInput,
  CharacterInput,
  LintResult,
  LocationInput,
  LockRefs,
  PromptBlocks,
  PropInput,
  QualityCheck,
  SceneInput,
  ShotInput,
  StyleInput,
  TimelineItem,
  WorkflowStep,
  CreateProjectInput,
  CreateEpisodeInput,
  UpdateProjectInput,
  UpdateEpisodeInput,
  UpdateShotInput,
  AudioMix,
} from '@/domain/schemas';
import type {
  ActivityRecord,
  ApprovalRecord,
  AssetRecord,
  AssetRelationRecord,
  ProductionAssetBindingRecord,
  BibleVersionRecord,
  CharacterRecord,
  EpisodeRecord,
  ExportRecord,
  GenerationRecord,
  LocationRecord,
  ProjectRecord,
  PromptRecord,
  PublishRecord,
  NodeGraphRecord,
  PromptVersionRecord,
  PropRecord,
  QualityReportRecord,
  SceneRecord,
  ScriptRecord,
  ShotRecord,
  StyleRecord,
  TimelineRecord,
  UserRecord,
  VoiceProfileRecord,
  WorkflowRunRecord,
} from './records';

// ---------------------------------------------------------------------------
// Infrastructure services
// ---------------------------------------------------------------------------

export interface Clock {
  nowIso(): string;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface StoredFile {
  key: string;
  sizeBytes: number;
  checksum: string;
  mimeType: string;
  url: string;
}

export interface StorageProvider {
  readonly driver: string;
  put(key: string, data: Buffer | Uint8Array | string, mimeType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  url(key: string): string;
  localPath(key: string): Promise<string>;
}

export interface AudioTrackConfig {
  path: string;
  mimeType: string;
  startTimeSeconds: number;
  durationSeconds: number;
  gainDb: number;
}

export interface VideoTrackConfig {
  path: string;
  mimeType: string;
  sourceKind?: 'video' | 'image';
  durationSeconds?: number;
  motion?: 'subtle-zoom';
}

export interface ConcatenateVideosInput {
  videos: VideoTrackConfig[];
  audioTracks?: AudioTrackConfig[];
  fps?: number;
  resolution?: string;
  signal?: AbortSignal;
}

export interface MediaAdapter {
  concatenateVideos(input: ConcatenateVideosInput): Promise<Buffer>;
  isAvailable(): Promise<boolean>;
}

export interface ProbedMediaMetadata {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

/**
 * Best-effort metadata probing for manually uploaded media. Resolves to
 * `null` for an unsupported type or a probe that could not run — never
 * throws, so an upload is never blocked by this.
 */
export interface MediaMetadataProbe {
  probe(data: Buffer, mimeType: string): Promise<ProbedMediaMetadata | null>;
}

// ---------------------------------------------------------------------------
// AI provider ports (spec §19)
// ---------------------------------------------------------------------------

export interface ProviderCapabilities {
  textToImage: boolean;
  imageToImage: boolean;
  referenceImages: boolean;
  inpainting: boolean;
  upscale: boolean;
  textToVideo: boolean;
  imageToVideo: boolean;
  firstLastFrame: boolean;
  extendVideo: boolean;
  lipSync: boolean;
  voice: boolean;
  music: boolean;
  sound: boolean;
  structuredText: boolean;
  maxVideoSeconds: number;
  supportedAspectRatios: string[];
}

export interface ProviderDescriptor {
  key: string;
  label: string;
  offline: boolean;
  models: Partial<Record<GenerationKind, string[]>>;
  capabilities: ProviderCapabilities;
}

export interface GenerationArtifact {
  filename: string;
  mimeType: string;
  data: Buffer;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface ProviderResult {
  artifacts: GenerationArtifact[];
  raw: Record<string, unknown>;
  actualCostUsd: number;
  modelUsed: string;
}

export interface ImageRequest {
  prompt: string;
  negativePrompt: string;
  model: string;
  aspectRatio: string;
  count: number;
  seed: number | null;
  referenceFiles: { mimeType: string; data: Buffer }[];
  params: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface VideoRequest {
  prompt: string;
  negativePrompt: string;
  model: string;
  aspectRatio: string;
  durationSeconds: number;
  seed: number | null;
  firstFrame: { mimeType: string; data: Buffer } | null;
  lastFrame: { mimeType: string; data: Buffer } | null;
  params: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface VoiceRequest {
  text: string;
  model: string;
  language: string;
  voiceName: string;
  speed: number;
  pitch: number;
  emotion: string;
  params: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface TextRequest {
  instruction: string;
  input: string;
  model: string;
  /** JSON schema the provider must satisfy. Structured output is mandatory. */
  jsonSchemaName: string;
  signal?: AbortSignal;
}

export interface ImageProvider {
  readonly descriptor: ProviderDescriptor;
  generateImage(request: ImageRequest): Promise<ProviderResult>;
}

export interface VideoProvider {
  readonly descriptor: ProviderDescriptor;
  generateVideo(request: VideoRequest): Promise<ProviderResult>;
}

export interface VoiceProvider {
  readonly descriptor: ProviderDescriptor;
  synthesize(request: VoiceRequest): Promise<ProviderResult>;
}

export interface TextProvider {
  readonly descriptor: ProviderDescriptor;
  /** Returns parsed JSON; implementations must reject prose responses. */
  complete<T>(request: TextRequest): Promise<{ value: T; raw: Record<string, unknown>; costUsd: number }>;
}

export interface ProviderRegistry {
  descriptors(): ProviderDescriptor[];
  image(key?: string): ImageProvider;
  video(key?: string): VideoProvider;
  voice(key?: string): VoiceProvider;
  music(key?: string): VoiceProvider;
  sound(key?: string): VoiceProvider;
  text(key?: string): TextProvider;
  defaultKeyFor(kind: GenerationKind): string;
  defaultModelFor(kind: GenerationKind, providerKey?: string): string;
}

// ---------------------------------------------------------------------------
// Repository ports
// ---------------------------------------------------------------------------

export interface ProjectRepository {
  create(input: CreateProjectInput & { workspaceId: string; ownerId: string; slug: string }): Promise<ProjectRecord>;
  update(id: string, patch: UpdateProjectInput): Promise<ProjectRecord>;
  byId(id: string): Promise<ProjectRecord | null>;
  bySlug(slug: string): Promise<ProjectRecord | null>;
  list(options?: { limit?: number; offset?: number; includeDeleted?: boolean }): Promise<ProjectRecord[]>;
  softDelete(id: string): Promise<void>;
  slugExists(slug: string): Promise<boolean>;
}

export interface EpisodeRepository {
  create(projectId: string, input: CreateEpisodeInput & { code: string; number: number }): Promise<EpisodeRecord>;
  update(id: string, patch: UpdateEpisodeInput): Promise<EpisodeRecord>;
  findById(id: string): Promise<EpisodeRecord | null>;
  delete(id: string): Promise<void>;
  upsertFirst(projectId: string, title: string): Promise<EpisodeRecord>;
  listByProject(projectId: string): Promise<EpisodeRecord[]>;
  nextNumber(projectId: string): Promise<number>;
}

export interface AudioMixRepository {
  getForEpisode(episodeId: string): Promise<AudioMix>;
  save(mix: AudioMix): Promise<void>;
}

export interface ScriptRepository {
  save(projectId: string, input: { title: string; scriptType: string; raw: string }): Promise<ScriptRecord>;
  current(projectId: string): Promise<ScriptRecord | null>;
  markParsed(id: string): Promise<void>;
}

export interface SceneRepository {
  create(projectId: string, input: SceneInput & { code: string; number: number; episodeId: string | null }): Promise<SceneRecord>;
  update(id: string, patch: Partial<SceneInput>): Promise<SceneRecord>;
  byId(id: string): Promise<SceneRecord | null>;
  listByProject(projectId: string): Promise<SceneRecord[]>;
  listByEpisode(projectId: string, episodeId: string): Promise<SceneRecord[]>;
  deleteAllForProject(projectId: string): Promise<number>;
  deleteAllForEpisode(projectId: string, episodeId: string): Promise<number>;
  nextNumber(projectId: string): Promise<number>;
}

export interface ShotRepository {
  create(projectId: string, input: ShotInput & { code: string; shotNumber: number; episodeId: string | null }): Promise<ShotRecord>;
  update(id: string, patch: UpdateShotInput): Promise<ShotRecord>;
  byId(id: string): Promise<ShotRecord | null>;
  byCode(projectId: string, code: string): Promise<ShotRecord | null>;
  listByProject(projectId: string): Promise<ShotRecord[]>;
  listByEpisode(projectId: string, episodeId: string): Promise<ShotRecord[]>;
  listByScene(sceneId: string): Promise<ShotRecord[]>;
  nextNumber(sceneId: string): Promise<number>;
  countByStatus(projectId: string): Promise<Record<string, number>>;
  /**
   * Storyboard reorder (TASK-005): `orderedShotIds` must be exactly the shots
   * currently in `sceneId`, in their new display order. Never renames a
   * shot's code — only `sortIndex` changes.
   */
  reorder(sceneId: string, orderedShotIds: string[]): Promise<ShotRecord[]>;
  /**
   * Soft delete (TASK-REFINE-004): sets `deletedAt`, never a hard DELETE, so
   * dependent rows (prompts, generations) that still reference this id never
   * hit a dangling foreign key — they simply stop being reachable through
   * the already-`deletedAt`-filtered read methods above.
   */
  delete(id: string): Promise<void>;
}

export interface BibleRepository {
  createCharacter(projectId: string, input: CharacterInput & { code: string }): Promise<CharacterRecord>;
  updateCharacter(id: string, patch: Partial<Omit<CharacterRecord, 'id' | 'projectId'>>): Promise<CharacterRecord>;
  characterById(id: string): Promise<CharacterRecord | null>;
  listCharacters(projectId: string): Promise<CharacterRecord[]>;
  listCharactersByVoiceProfile(voiceProfileId: string): Promise<CharacterRecord[]>;

  createLocation(projectId: string, input: LocationInput & { code: string }): Promise<LocationRecord>;
  updateLocation(id: string, patch: Partial<LocationInput>): Promise<LocationRecord>;
  locationById(id: string): Promise<LocationRecord | null>;
  listLocations(projectId: string): Promise<LocationRecord[]>;

  createProp(projectId: string, input: PropInput & { code: string }): Promise<PropRecord>;
  updateProp(id: string, patch: Partial<PropInput>): Promise<PropRecord>;
  propById(id: string): Promise<PropRecord | null>;
  listProps(projectId: string): Promise<PropRecord[]>;

  createStyle(projectId: string, input: StyleInput & { code: string }): Promise<StyleRecord>;
  updateStyle(id: string, patch: Partial<StyleInput>): Promise<StyleRecord>;
  styleById(id: string): Promise<StyleRecord | null>;
  listStyles(projectId: string): Promise<StyleRecord[]>;

  nextCode(projectId: string, kind: 'character' | 'location' | 'prop' | 'style'): Promise<string>;

  saveVersion(input: { kind: 'character' | 'location' | 'prop' | 'style'; refId: string; version: number; payload: unknown; note: string }): Promise<BibleVersionRecord>;
  version(kind: string, refId: string, version: number): Promise<BibleVersionRecord | null>;
  latestVersion(kind: string, refId: string): Promise<BibleVersionRecord | null>;
  listVersions(kind: string, refId: string): Promise<BibleVersionRecord[]>;

  listVoiceProfiles(projectId: string): Promise<VoiceProfileRecord[]>;
  createVoiceProfile(projectId: string, input: Omit<VoiceProfileRecord, 'id' | 'projectId'>): Promise<VoiceProfileRecord>;
  updateVoiceProfile(id: string, patch: Partial<Omit<VoiceProfileRecord, 'id' | 'projectId'>>): Promise<VoiceProfileRecord>;
  deleteVoiceProfile(id: string): Promise<void>;
}

export interface PromptRepository {
  createWithVersion(input: {
    projectId: string;
    shotId: string | null;
    kind: string;
    name: string;
    blocks: PromptBlocks;
    compiled: string;
    negative: string;
    lockRefs: LockRefs;
    lint: LintResult;
  }): Promise<{ prompt: PromptRecord; version: PromptVersionRecord }>;
  addVersion(promptId: string, input: {
    blocks: PromptBlocks;
    compiled: string;
    negative: string;
    lockRefs: LockRefs;
    lint: LintResult;
  }): Promise<PromptVersionRecord>;
  byId(id: string): Promise<PromptRecord | null>;
  listByShot(shotId: string): Promise<PromptRecord[]>;
  listByProject(projectId: string): Promise<PromptRecord[]>;
  versions(promptId: string): Promise<PromptVersionRecord[]>;
  version(promptId: string, version: number): Promise<PromptVersionRecord | null>;
  latestVersion(promptId: string): Promise<PromptVersionRecord | null>;
  findForShot(shotId: string, kind: string): Promise<PromptRecord | null>;
  countByLockRef(versionId: string): Promise<number>;
}

export interface GenerationRepository {
  /**
   * Atomically reserves the estimated cost against `ceiling` while inserting
   * the pending job: the ceiling check and the INSERT run inside one
   * transaction, so two concurrent enqueues can never both commit when their
   * combined estimates exceed the ceiling.
   */
  enqueue(
    input: Omit<
      GenerationRecord,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'startedAt'
      | 'finishedAt'
      | 'attempts'
      | 'actualCostUsd'
      | 'errorCode'
      | 'errorMessage'
    > & { idempotencyKey: string | null },
    ceiling: number,
  ): Promise<GenerationRecord>;
  byId(id: string): Promise<GenerationRecord | null>;
  byIdempotencyKey(key: string): Promise<GenerationRecord | null>;
  listByProject(projectId: string, options?: { status?: string; limit?: number }): Promise<GenerationRecord[]>;
  listByShot(shotId: string): Promise<GenerationRecord[]>;
  claimNext(workerId: string, nowIso: string): Promise<GenerationRecord | null>;
  markProcessing(id: string, workerId: string): Promise<void>;
  complete(id: string, input: { actualCostUsd: number; raw: Record<string, unknown> }): Promise<GenerationRecord>;
  fail(id: string, input: { errorCode: string; errorMessage: string; retry: boolean }): Promise<GenerationRecord>;
  cancel(id: string): Promise<GenerationRecord>;
  releaseStale(olderThanIso: string): Promise<number>;
  spentUsd(projectId: string): Promise<number>;
  /**
   * Budget currently spoken for against the ceiling: completed jobs count
   * their actual cost, pending/processing jobs count their reserved estimate,
   * and failed/cancelled jobs count nothing (their reserve is released). This
   * is the figure the enqueue ceiling check must use, not `spentUsd`.
   */
  encumberedUsd(projectId: string): Promise<number>;
  countByStatus(projectId?: string): Promise<Record<string, number>>;
}

export interface AssetRepository {
  register(
    input: Omit<
      AssetRecord,
      'id' | 'createdAt' | 'updatedAt' | 'version' | 'favorite' | 'rating' | 'approvalState'
    > & { version?: number },
  ): Promise<AssetRecord>;
  byId(id: string): Promise<AssetRecord | null>;
  byChecksum(projectId: string, checksum: string): Promise<AssetRecord | null>;
  list(projectId: string, filter?: { kind?: string; shotId?: string; approvalState?: string; search?: string; limit?: number; offset?: number }): Promise<AssetRecord[]>;
  listByGeneration(generationId: string): Promise<AssetRecord[]>;
  setApproval(id: string, state: 'pending' | 'approved' | 'rejected'): Promise<AssetRecord>;
  setFavorite(id: string, favorite: boolean): Promise<AssetRecord>;
  softDelete(id: string): Promise<void>;
  /**
   * Unassigns an asset from its shot without touching approval state, the
   * file, or any other field (TASK-REFINE-004). Used when a shot is deleted
   * but one of its assets is already approved and therefore immutable —
   * `softDelete` refuses that asset, so it is detached and preserved in the
   * project's asset library instead.
   */
  detachFromShot(id: string): Promise<void>;
  link(parentId: string, childId: string, relation: string): Promise<AssetRelationRecord>;
  parents(assetId: string): Promise<AssetRelationRecord[]>;
  children(assetId: string): Promise<AssetRelationRecord[]>;
  countByKind(projectId: string): Promise<Record<string, number>>;
}

export interface ProductionAssetBindingRepository {
  bind(input: Omit<ProductionAssetBindingRecord, 'id' | 'createdAt'>): Promise<ProductionAssetBindingRecord>;
  listByProject(projectId: string): Promise<ProductionAssetBindingRecord[]>;
  listByTarget(projectId: string, targetType: string, targetId: string): Promise<ProductionAssetBindingRecord[]>;
}

export interface ApprovalRepository {
  record(projectId: string, input: ApprovalInput & { decidedBy: string | null }): Promise<ApprovalRecord>;
  decideAsset(input: {
    assetId: string;
    decision: AssetDecision;
    note: string;
    decidedBy: string | null;
  }): Promise<{ asset: AssetRecord; approval: ApprovalRecord | null; shotStatus: ShotStatus | null; idempotent: boolean }>;
  listForTarget(projectId: string, targetType: string, targetId: string): Promise<ApprovalRecord[]>;
  listRecent(projectId: string, limit: number): Promise<ApprovalRecord[]>;
}

export interface QualityRepository {
  save(input: { projectId: string; targetType: string; shotId: string | null; assetId: string | null; score: number; passed: boolean; checks: QualityCheck[] }): Promise<QualityReportRecord>;
  latestForAsset(assetId: string): Promise<QualityReportRecord | null>;
  listByProject(projectId: string, limit?: number): Promise<QualityReportRecord[]>;
}

export interface WorkflowRepository {
  start(projectId: string, workflowKey: string, input: Record<string, unknown>, steps: WorkflowStep[]): Promise<WorkflowRunRecord>;
  updateSteps(id: string, steps: WorkflowStep[]): Promise<WorkflowRunRecord>;
  finish(id: string, status: string, output: Record<string, unknown>, steps: WorkflowStep[]): Promise<WorkflowRunRecord>;
  byId(id: string): Promise<WorkflowRunRecord | null>;
  listByProject(projectId: string): Promise<WorkflowRunRecord[]>;
}

export interface TimelineRepository {
  save(projectId: string, items: TimelineItem[], name?: string, episodeId?: string): Promise<TimelineRecord>;
  current(projectId: string, episodeId?: string): Promise<TimelineRecord | null>;
  listByEpisode(projectId: string, episodeId: string): Promise<TimelineRecord[]>;
}

export interface ExportRepository {
  record(input: { projectId: string; kind: string; storageKey: string; frozenVersions: Record<string, unknown>; summary: Record<string, unknown> }): Promise<ExportRecord>;
  listByProject(projectId: string): Promise<ExportRecord[]>;
  byId(id: string): Promise<ExportRecord | null>;
}

export type ClaimPublishResult =
  | { kind: 'CLAIMED'; record: PublishRecord }
  | { kind: 'ALREADY_IN_PROGRESS'; record: PublishRecord }
  | { kind: 'ALREADY_DELIVERED'; record: PublishRecord }
  | { kind: 'RETRYABLE_EXISTING'; record: PublishRecord };

export interface PublishRepository {
  create(input: { projectId: string; exportId: string; endpoint: string; idempotencyKey: string }): Promise<PublishRecord>;
  claimPublishAttempt(input: { projectId: string; exportId: string; endpoint: string; idempotencyKey: string }): Promise<ClaimPublishResult>;
  updateStatus(id: string, status: PublishRecord['status'], error?: string): Promise<PublishRecord>;
  incrementAttempt(id: string): Promise<PublishRecord>;
  byId(id: string): Promise<PublishRecord | null>;
  findLatestByExportEndpoint(projectId: string, exportId: string, endpoint: string): Promise<PublishRecord | null>;
  listByProject(projectId: string): Promise<PublishRecord[]>;
}

export interface DeliveryAdapter {
  deliver(endpoint: string, payload: unknown, idempotencyKey: string): Promise<void>;
}

export interface NodeGraphRepository {
  create(input: { projectId: string; name: string; graph: NodeGraphRecord['graph'] }): Promise<NodeGraphRecord>;
  update(id: string, input: { name?: string; graph?: NodeGraphRecord['graph'] }): Promise<NodeGraphRecord>;
  updateStatus(id: string, status: NodeGraphRecord['status']): Promise<NodeGraphRecord>;
  byId(id: string): Promise<NodeGraphRecord | null>;
  listByProject(projectId: string): Promise<NodeGraphRecord[]>;
  remove(id: string): Promise<void>;
}

export interface ActivityRepository {
  log(input: { projectId: string | null; userId: string | null; action: string; targetType: string; targetId: string; details: Record<string, unknown> }): Promise<void>;
  recent(projectId: string | null, limit: number): Promise<ActivityRecord[]>;
}

export interface WorkspaceRepository {
  ensureDefault(): Promise<{ workspaceId: string; ownerId: string }>;
}

export interface UserRepository {
  byEmail(email: string): Promise<UserRecord | null>;
  byId(id: string): Promise<UserRecord | null>;
}

// ---------------------------------------------------------------------------
// The container the services receive
// ---------------------------------------------------------------------------

export interface Studio {
  clock: Clock;
  logger: Logger;
  storage: StorageProvider;
  providers: ProviderRegistry;
  workspaces: WorkspaceRepository;
  users: UserRepository;
  projects: ProjectRepository;
  episodes: EpisodeRepository;
  audioMixes: AudioMixRepository;
  scripts: ScriptRepository;
  scenes: SceneRepository;
  shots: ShotRepository;
  bibles: BibleRepository;
  prompts: PromptRepository;
  generations: GenerationRepository;
  assets: AssetRepository;
  productionAssetBindings: ProductionAssetBindingRepository;
  approvals: ApprovalRepository;
  quality: QualityRepository;
  workflows: WorkflowRepository;
  timelines: TimelineRepository;
  exports: ExportRepository;
  publishes: PublishRepository;
  nodeGraphs: NodeGraphRepository;
  activity: ActivityRepository;
  media: MediaAdapter;
  mediaMetadataProbe: MediaMetadataProbe;
  delivery: DeliveryAdapter;
  config: StudioConfig;
}

export interface StudioConfig {
  maxConcurrentJobs: number;
  jobTimeoutMs: number;
  costLimitUsdPerProject: number;
  publicBaseUrl: string;
  apiKey: string | null;
}
