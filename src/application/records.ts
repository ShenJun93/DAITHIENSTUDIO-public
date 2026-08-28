/**
 * Application-level records.
 *
 * These are what repositories return: database rows with every JSON column
 * already parsed and validated. The application and UI layers only ever see
 * these shapes, never Drizzle row types — that is what keeps the persistence
 * choice replaceable.
 */
import type {
  ApprovalInput,
  CameraMovement,
  CharacterInput,
  Continuity,
  ContinuityFinding,
  CreativeBrief,
  DialogueLine,
  LintResult,
  LocationInput,
  LockRefs,
  PromptBlocks,
  PropInput,
  QualityCheck,
  ShotCharacterRef,
  ShotPropRef,
  StyleInput,
  TimelineItem,
  WorkflowStep,
  PublishStatus,
  NodeGraph,
  NodeGraphStatus,
} from '@/domain/schemas';
import type {
  AssetKind,
  BibleKind,
  ExportKind,
  GenerationKind,
  GenerationStatus,
  ProductionType,
  ShotStatus,
  WorkflowKey,
} from '@/domain/enums';

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  description: string;
  genre: string;
  format: string;
  /** Present on the composed Studio project repository; absent only on the legacy base repository used internally by its decorator. */
  productionType?: ProductionType | null;
  targetAudience: string;
  platform: string;
  language: string;
  durationTargetSeconds: number;
  aspectRatio: string;
  secondaryAspectRatios: string[];
  frameRate: number;
  resolution: string;
  styleId: string | null;
  status: string;
  ownerId: string;
  creativeBrief: CreativeBrief;
  costLimitUsd: number;
  productionStrategy: 'hybrid' | 'auto';
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeRecord {
  id: string;
  projectId: string;
  code: string;
  number: number;
  title: string;
  synopsis: string;
  status: string;
}

export interface ScriptRecord {
  id: string;
  projectId: string;
  episodeId: string | null;
  title: string;
  scriptType: string;
  raw: string;
  version: number;
  status: string;
  parsedAt: string | null;
  updatedAt: string;
}

export interface SceneRecord {
  id: string;
  projectId: string;
  episodeId: string | null;
  code: string;
  number: number;
  title: string;
  locationId: string | null;
  timeOfDay: string;
  summary: string;
  action: string;
  dialogue: DialogueLine[];
  emotion: string;
  visualGoal: string;
  audioGoal: string;
  durationSeconds: number;
  characters: string[];
  status: string;
}

export interface ShotRecord {
  id: string;
  projectId: string;
  episodeId: string | null;
  sceneId: string;
  code: string;
  shotNumber: number;
  sortIndex: number;
  title: string;
  description: string;
  shotSize: string;
  cameraAngle: string;
  cameraMovement: CameraMovement;
  lens: string;
  durationSeconds: number;
  characters: ShotCharacterRef[];
  locationId: string | null;
  locationVersionId: string | null;
  props: ShotPropRef[];
  dialogue: string;
  emotion: string;
  lighting: string;
  visualEffects: string[];
  soundEffects: string[];
  continuity: Continuity;
  aspectRatio: string;
  importance: 'normal' | 'key';
  status: ShotStatus;
  updatedAt: string;
}

export interface CharacterRecord extends CharacterInput {
  id: string;
  projectId: string;
  code: string;
  currentVersion: number;
  updatedAt: string;
}

export interface LocationRecord extends LocationInput {
  id: string;
  projectId: string;
  code: string;
  currentVersion: number;
  updatedAt: string;
}

export interface PropRecord extends PropInput {
  id: string;
  projectId: string;
  code: string;
  currentVersion: number;
  updatedAt: string;
}

export interface StyleRecord extends StyleInput {
  id: string;
  projectId: string;
  code: string;
  currentVersion: number;
  updatedAt: string;
}

export interface BibleVersionRecord {
  id: string;
  kind: BibleKind;
  refId: string;
  version: number;
  payload: unknown;
  note: string;
  createdAt: string;
}

export interface VoiceProfileRecord {
  id: string;
  projectId: string;
  name: string;
  provider: string;
  language: string;
  voiceName: string;
  speed: number;
  pitch: number;
  emotion: string;
  style: string;
  pronunciation: Record<string, string>;
}

export interface PromptRecord {
  id: string;
  projectId: string;
  shotId: string | null;
  kind: string;
  name: string;
  currentVersion: number;
  status: string;
  updatedAt: string;
}

export interface PromptVersionRecord {
  id: string;
  promptId: string;
  version: number;
  blocks: PromptBlocks;
  compiled: string;
  negative: string;
  lockRefs: LockRefs;
  lint: LintResult | null;
  createdAt: string;
}

export interface GenerationRecord {
  id: string;
  projectId: string;
  shotId: string | null;
  promptId: string | null;
  promptVersion: number | null;
  kind: GenerationKind;
  provider: string;
  model: string;
  prompt: string;
  negativePrompt: string;
  params: Record<string, unknown>;
  referenceAssetIds: string[];
  seed: number | null;
  status: GenerationStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  estimatedCostUsd: number;
  actualCostUsd: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRecord {
  id: string;
  projectId: string;
  shotId: string | null;
  generationId: string | null;
  kind: AssetKind;
  name: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  favorite: boolean;
  rating: number | null;
  approvalState: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface AssetRelationRecord {
  id: string;
  parentId: string;
  childId: string;
  relation: string;
}

export interface ProductionAssetBindingRecord {
  id: string;
  projectId: string;
  assetId: string;
  targetType: 'character' | 'location' | 'prop' | 'style' | 'shot';
  targetId: string;
  targetVersionId: string;
  role: 'identity-anchor' | 'environment-anchor' | 'prop-anchor' | 'style-anchor' | 'storyboard-keyframe';
  createdAt: string;
}

export interface UserRecord {
  id: string;
  workspaceId: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord extends ApprovalInput {
  id: string;
  projectId: string;
  decidedBy: string | null;
  createdAt: string;
}

export interface QualityReportRecord {
  id: string;
  projectId: string;
  targetType: string;
  shotId: string | null;
  assetId: string | null;
  score: number;
  passed: boolean;
  checks: QualityCheck[];
  createdAt: string;
}

export interface WorkflowRunRecord {
  id: string;
  projectId: string;
  workflowKey: WorkflowKey;
  status: string;
  steps: WorkflowStep[];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
}

export interface TimelineRecord {
  id: string;
  projectId: string;
  episodeId: string | null;
  name: string;
  items: TimelineItem[];
  updatedAt: string;
}

export interface PublishRecord {
  id: string;
  projectId: string;
  exportId: string;
  endpoint: string;
  idempotencyKey: string;
  status: PublishStatus;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NodeGraphRecord {
  id: string;
  projectId: string;
  name: string;
  graph: NodeGraph;
  status: NodeGraphStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExportRecord {
  id: string;
  projectId: string;
  kind: ExportKind;
  status: string;
  storageKey: string;
  frozenVersions: Record<string, unknown>;
  summary: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityRecord {
  id: string;
  projectId: string | null;
  userId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ContinuityReport {
  findings: ContinuityFinding[];
  /** Count per classification (intentional-change, missing-transition, …). */
  byClass: Record<string, number>;
  errors: number;
  warnings: number;
  infos: number;
  blocked: boolean;
}
