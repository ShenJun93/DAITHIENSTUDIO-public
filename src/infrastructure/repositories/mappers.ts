/**
 * Row → record mappers.
 *
 * This is the layer where stored JSON is validated. Anything that fails its
 * schema falls back to a safe default and logs, rather than propagating a
 * half-parsed object into the domain.
 */
import { z } from 'zod';
import { parseJson } from '@/domain/json';
import {
  approvalStateSchema,
  cameraMovementSchema,
  characterIdentitySchema,
  characterVariableSchema,
  continuitySchema,
  creativeBriefSchema,
  dialogueLineSchema,
  environmentStateSchema,
  lintResultSchema,
  locationDetailsSchema,
  lockRefsSchema,
  promptBlocksSchema,
  propDetailsSchema,
  qualityCheckSchema,
  shotCharacterRefSchema,
  shotPropRefSchema,
  styleDetailsSchema,
  timelineItemSchema,
  workflowStepSchema,
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
} from '@/application/records';
import type {
  activityLogs,
  approvals,
  assetRelations,
  assets,
  productionAssetBindings,
  bibleVersions,
  characters,
  episodes,
  exports as exportsTable,
  generations,
  locations,
  projects,
  promptVersions,
  prompts,
  props,
  qualityReports,
  scenes,
  scriptDocuments,
  shots,
  styles,
  timelines,
  users,
  voiceProfiles,
  workflowRuns,
} from '../db/schema';
import type {
  ApprovalDecisionLike,
  AssetKindLike,
  ExportKindLike,
  GenerationKindLike,
  GenerationStatusLike,
  ShotStatusLike,
  WorkflowKeyLike,
} from './castHelpers';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

const stringArray = z.array(z.string());
const unknownRecord = z.record(z.unknown());
const stringRecord = z.record(z.string());

export function toProject(row: Row<typeof projects>): ProjectRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    slug: row.slug,
    title: row.title,
    description: row.description,
    genre: row.genre,
    format: row.format,
    targetAudience: row.targetAudience,
    platform: row.platform,
    language: row.language,
    durationTargetSeconds: row.durationTargetSeconds,
    aspectRatio: row.aspectRatio,
    secondaryAspectRatios: parseJson(row.secondaryAspectRatiosJson, stringArray, [], 'projects.secondaryAspectRatios'),
    frameRate: row.frameRate,
    resolution: row.resolution,
    styleId: row.styleId,
    status: row.status,
    ownerId: row.ownerId,
    creativeBrief: parseJson(row.creativeBriefJson, creativeBriefSchema, creativeBriefSchema.parse({}), 'projects.creativeBrief'),
    costLimitUsd: row.costLimitUsd,
    productionStrategy: row.productionStrategy as ProjectRecord['productionStrategy'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toEpisode(row: Row<typeof episodes>): EpisodeRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    number: row.number,
    title: row.title,
    synopsis: row.synopsis,
    status: row.status,
  };
}

export function toScript(row: Row<typeof scriptDocuments>): ScriptRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    episodeId: row.episodeId,
    title: row.title,
    scriptType: row.scriptType,
    raw: row.raw,
    version: row.version,
    status: row.status,
    parsedAt: row.parsedAt,
    updatedAt: row.updatedAt,
  };
}

export function toScene(row: Row<typeof scenes>): SceneRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    episodeId: row.episodeId,
    code: row.code,
    number: row.number,
    title: row.title,
    locationId: row.locationId,
    timeOfDay: row.timeOfDay,
    summary: row.summary,
    action: row.action,
    dialogue: parseJson(row.dialogueJson, z.array(dialogueLineSchema), [], 'scenes.dialogue'),
    emotion: row.emotion,
    visualGoal: row.visualGoal,
    audioGoal: row.audioGoal,
    durationSeconds: row.durationSeconds,
    characters: parseJson(row.charactersJson, stringArray, [], 'scenes.characters'),
    status: row.status,
  };
}

export function toShot(row: Row<typeof shots>): ShotRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    episodeId: row.episodeId,
    sceneId: row.sceneId,
    code: row.code,
    shotNumber: row.shotNumber,
    sortIndex: row.sortIndex,
    title: row.title,
    description: row.description,
    shotSize: row.shotSize,
    cameraAngle: row.cameraAngle,
    cameraMovement: parseJson(
      row.cameraMovementJson,
      cameraMovementSchema,
      cameraMovementSchema.parse({}),
      'shots.cameraMovement',
    ),
    lens: row.lens,
    durationSeconds: row.durationSeconds,
    characters: parseJson(row.charactersJson, z.array(shotCharacterRefSchema), [], 'shots.characters'),
    locationId: row.locationId,
    locationVersionId: row.locationVersionId,
    props: parseJson(row.propsJson, z.array(shotPropRefSchema), [], 'shots.props'),
    dialogue: row.dialogue,
    emotion: row.emotion,
    lighting: row.lighting,
    visualEffects: parseJson(row.visualEffectsJson, stringArray, [], 'shots.visualEffects'),
    soundEffects: parseJson(row.soundEffectsJson, stringArray, [], 'shots.soundEffects'),
    continuity: continuitySchema.parse({
      incoming: parseJson(row.continuityInJson, z.unknown(), {}, 'shots.continuityIn'),
      outgoing: parseJson(row.continuityOutJson, z.unknown(), {}, 'shots.continuityOut'),
      intentionalChanges: parseJson(row.intentionalChangesJson, stringArray, [], 'shots.intentionalChanges'),
    }),
    aspectRatio: row.aspectRatio,
    importance: row.importance === 'key' ? 'key' : 'normal',
    status: row.status as ShotStatusLike,
    updatedAt: row.updatedAt,
  };
}

export function toCharacter(row: Row<typeof characters>): CharacterRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    name: row.name,
    role: row.role,
    identity: parseJson(row.identityJson, characterIdentitySchema.partial(), {}, 'characters.identity'),
    variable: parseJson(row.variableJson, characterVariableSchema.partial(), {}, 'characters.variable'),
    promptToken: row.promptToken,
    negativePrompt: row.negativePrompt,
    forbiddenChanges: parseJson(row.forbiddenChangesJson, stringArray, [], 'characters.forbiddenChanges'),
    colorPalette: parseJson(row.colorPaletteJson, stringArray, [], 'characters.colorPalette'),
    voiceProfileId: row.voiceProfileId,
    lockEnabled: row.lockEnabled,
    status: row.status === 'approved' || row.status === 'locked' ? row.status : 'draft',
    currentVersion: row.currentVersion,
    updatedAt: row.updatedAt,
  };
}

export function toLocation(row: Row<typeof locations>): LocationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    name: row.name,
    type: row.type,
    era: row.era,
    details: parseJson(row.detailsJson, locationDetailsSchema.partial(), {}, 'locations.details'),
    promptBlock: row.promptBlock,
    negativePrompt: row.negativePrompt,
    colorPalette: parseJson(row.colorPaletteJson, stringArray, [], 'locations.colorPalette'),
    continuityNotes: row.continuityNotes,
    status: row.status === 'approved' || row.status === 'locked' ? row.status : 'draft',
    currentVersion: row.currentVersion,
    updatedAt: row.updatedAt,
  };
}

export function toProp(row: Row<typeof props>): PropRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    name: row.name,
    description: row.description,
    ownerCharacterId: row.ownerCharacterId,
    details: parseJson(row.detailsJson, propDetailsSchema.partial(), {}, 'props.details'),
    promptToken: row.promptToken,
    continuityConstraints: parseJson(row.continuityConstraintsJson, stringArray, [], 'props.continuityConstraints'),
    status: row.status === 'approved' || row.status === 'locked' ? row.status : 'draft',
    currentVersion: row.currentVersion,
    updatedAt: row.updatedAt,
  };
}

export function toStyle(row: Row<typeof styles>): StyleRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    name: row.name,
    category: row.category as StyleRecord['category'],
    details: parseJson(row.detailsJson, styleDetailsSchema.partial(), {}, 'styles.details'),
    promptBlock: row.promptBlock,
    negativeStyleRules: row.negativeStyleRules,
    status: row.status === 'approved' || row.status === 'locked' ? row.status : 'draft',
    currentVersion: row.currentVersion,
    updatedAt: row.updatedAt,
  };
}

export function toBibleVersion(row: Row<typeof bibleVersions>): BibleVersionRecord {
  return {
    id: row.id,
    kind: row.kind as BibleVersionRecord['kind'],
    refId: row.refId,
    version: row.version,
    payload: parseJson(row.payloadJson, z.unknown(), {}, 'bibleVersions.payload'),
    note: row.note,
    createdAt: row.createdAt,
  };
}

export function toVoiceProfile(row: Row<typeof voiceProfiles>): VoiceProfileRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    provider: row.provider,
    language: row.language,
    voiceName: row.voiceName,
    speed: row.speed,
    pitch: row.pitch,
    emotion: row.emotion,
    style: row.style,
    pronunciation: parseJson(row.pronunciationJson, stringRecord, {}, 'voiceProfiles.pronunciation'),
  };
}

export function toPrompt(row: Row<typeof prompts>): PromptRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    shotId: row.shotId,
    kind: row.kind,
    name: row.name,
    currentVersion: row.currentVersion,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

export function toPromptVersion(row: Row<typeof promptVersions>): PromptVersionRecord {
  return {
    id: row.id,
    promptId: row.promptId,
    version: row.version,
    blocks: parseJson(row.blocksJson, promptBlocksSchema, promptBlocksSchema.parse({}), 'promptVersions.blocks'),
    compiled: row.compiled,
    negative: row.negative,
    lockRefs: parseJson(row.lockRefsJson, lockRefsSchema, lockRefsSchema.parse({}), 'promptVersions.lockRefs'),
    lint: parseJson(row.lintJson, lintResultSchema.nullable(), null, 'promptVersions.lint'),
    createdAt: row.createdAt,
  };
}

export function toGeneration(row: Row<typeof generations>): GenerationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    shotId: row.shotId,
    promptId: row.promptId,
    promptVersion: row.promptVersion,
    kind: row.kind as GenerationKindLike,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    negativePrompt: row.negativePrompt,
    params: parseJson(row.paramsJson, unknownRecord, {}, 'generations.params'),
    referenceAssetIds: parseJson(row.referenceAssetsJson, stringArray, [], 'generations.referenceAssets'),
    seed: row.seed,
    status: row.status as GenerationStatusLike,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    estimatedCostUsd: row.estimatedCostUsd,
    actualCostUsd: row.actualCostUsd,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toAsset(row: Row<typeof assets>): AssetRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    shotId: row.shotId,
    generationId: row.generationId,
    kind: row.kind as AssetKindLike,
    name: row.name,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    width: row.width,
    height: row.height,
    durationSeconds: row.durationSeconds,
    tags: parseJson(row.tagsJson, stringArray, [], 'assets.tags'),
    metadata: parseJson(row.metadataJson, unknownRecord, {}, 'assets.metadata'),
    version: row.version,
    favorite: row.favorite,
    rating: row.rating,
    approvalState: approvalStateSchema.catch('pending').parse(row.approvalState),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toAssetRelation(row: Row<typeof assetRelations>): AssetRelationRecord {
  return { id: row.id, parentId: row.parentId, childId: row.childId, relation: row.relation };
}

export function toProductionAssetBinding(
  row: Row<typeof productionAssetBindings>,
): ProductionAssetBindingRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    assetId: row.assetId,
    targetType: row.targetType as ProductionAssetBindingRecord['targetType'],
    targetId: row.targetId,
    targetVersionId: row.targetVersionId,
    role: row.role as ProductionAssetBindingRecord['role'],
    createdAt: row.createdAt,
  };
}

export function toUser(row: Row<typeof users>): UserRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toApproval(row: Row<typeof approvals>): ApprovalRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    targetType: row.targetType as ApprovalRecord['targetType'],
    targetId: row.targetId,
    decision: row.decision as ApprovalDecisionLike,
    note: row.note,
    decidedBy: row.decidedBy,
    createdAt: row.createdAt,
  };
}

export function toQualityReport(row: Row<typeof qualityReports>): QualityReportRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    targetType: row.targetType,
    shotId: row.shotId,
    assetId: row.assetId,
    score: row.score,
    passed: row.passed,
    checks: parseJson(row.checksJson, z.array(qualityCheckSchema), [], 'qualityReports.checks'),
    createdAt: row.createdAt,
  };
}

export function toWorkflowRun(row: Row<typeof workflowRuns>): WorkflowRunRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    workflowKey: row.workflowKey as WorkflowKeyLike,
    status: row.status,
    steps: parseJson(row.stepsJson, z.array(workflowStepSchema), [], 'workflowRuns.steps'),
    input: parseJson(row.inputJson, unknownRecord, {}, 'workflowRuns.input'),
    output: parseJson(row.outputJson, unknownRecord, {}, 'workflowRuns.output'),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export function toTimeline(row: Row<typeof timelines>): TimelineRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    episodeId: row.episodeId,
    name: row.name,
    items: parseJson(row.itemsJson, z.array(timelineItemSchema), [], 'timelines.items'),
    updatedAt: row.updatedAt,
  };
}

export function toExport(row: Row<typeof exportsTable>): ExportRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind as ExportKindLike,
    status: row.status,
    storageKey: row.storageKey,
    frozenVersions: parseJson(row.frozenVersionsJson, unknownRecord, {}, 'exports.frozenVersions'),
    summary: parseJson(row.summaryJson, unknownRecord, {}, 'exports.summary'),
    createdAt: row.createdAt,
  };
}

export function toActivity(row: Row<typeof activityLogs>): ActivityRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    details: parseJson(row.detailsJson, unknownRecord, {}, 'activityLogs.details'),
    createdAt: row.createdAt,
  };
}

export { environmentStateSchema };
