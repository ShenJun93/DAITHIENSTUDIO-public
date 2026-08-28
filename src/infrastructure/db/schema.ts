/**
 * Đại Thiên Tài AI Visual Studio — database schema (SQLite / Drizzle).
 *
 * Conventions
 * -----------
 * - Timestamps are ISO-8601 strings (sortable, human readable in a DB browser).
 * - `*Json` columns hold a JSON *string*; the application layer parses them
 *   through Zod schemas so the same shape works on PostgreSQL later.
 * - Enum-like columns are `text` validated by Zod at the boundary.
 * - Soft delete: `deletedAt` on user-visible production entities.
 * - Bible versioning: `bibleVersions` stores immutable snapshots. Prompts
 *   always reference a concrete snapshot, never "the latest".
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const nowSql = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

const timestamps = {
  createdAt: text('created_at').notNull().default(nowSql),
  updatedAt: text('updated_at').notNull().default(nowSql),
};

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ...timestamps,
});

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull().default('owner'),
    ...timestamps,
  },
  (t) => [index('users_workspace_idx').on(t.workspaceId)],
);

// ---------------------------------------------------------------------------
// Project tree
// ---------------------------------------------------------------------------

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    genre: text('genre').notNull().default(''),
    format: text('format').notNull().default('short-film'),
    targetAudience: text('target_audience').notNull().default(''),
    platform: text('platform').notNull().default('youtube'),
    language: text('language').notNull().default('vi-VN'),
    durationTargetSeconds: integer('duration_target_seconds').notNull().default(300),
    aspectRatio: text('aspect_ratio').notNull().default('16:9'),
    secondaryAspectRatiosJson: text('secondary_aspect_ratios_json').notNull().default('["9:16"]'),
    frameRate: integer('frame_rate').notNull().default(24),
    resolution: text('resolution').notNull().default('1920x1080'),
    styleId: text('style_id'),
    status: text('status').notNull().default('development'),
    ownerId: text('owner_id').notNull(),
    creativeBriefJson: text('creative_brief_json').notNull().default('{}'),
    costLimitUsd: real('cost_limit_usd').notNull().default(25),
    productionStrategy: text('production_strategy').notNull().default('hybrid'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [index('projects_workspace_idx').on(t.workspaceId, t.deletedAt)],
);

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    synopsis: text('synopsis').notNull().default(''),
    status: text('status').notNull().default('draft'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('episodes_project_code_uq').on(t.projectId, t.code)],
);

export const scriptDocuments = sqliteTable(
  'script_documents',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    episodeId: text('episode_id'),
    title: text('title').notNull().default('Main script'),
    scriptType: text('script_type').notNull().default('motion-comic'),
    raw: text('raw').notNull().default(''),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    parsedAt: text('parsed_at'),
    ...timestamps,
  },
  (t) => [index('script_documents_project_idx').on(t.projectId)],
);

export const scenes = sqliteTable(
  'scenes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    episodeId: text('episode_id'),
    code: text('code').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    locationId: text('location_id'),
    timeOfDay: text('time_of_day').notNull().default('day'),
    summary: text('summary').notNull().default(''),
    action: text('action').notNull().default(''),
    dialogueJson: text('dialogue_json').notNull().default('[]'),
    emotion: text('emotion').notNull().default(''),
    visualGoal: text('visual_goal').notNull().default(''),
    audioGoal: text('audio_goal').notNull().default(''),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    charactersJson: text('characters_json').notNull().default('[]'),
    status: text('status').notNull().default('draft'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('scenes_project_code_uq').on(t.projectId, t.code),
    index('scenes_project_number_idx').on(t.projectId, t.number),
  ],
);

export const shots = sqliteTable(
  'shots',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    episodeId: text('episode_id'),
    sceneId: text('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    shotNumber: integer('shot_number').notNull(),
    /**
     * Storyboard display order within the scene — decoupled from `code`/
     * `shotNumber` on purpose (TASK-005). Reordering must never rename a
     * shot's code, because the code is baked into its storage path and
     * renaming would orphan any asset already generated for it. Existing
     * rows default to 0, and every consumer breaks ties by `shotNumber`, so
     * an un-reordered scene sorts exactly as it did before this column
     * existed.
     */
    sortIndex: integer('sort_index').notNull().default(0),
    title: text('title').notNull().default(''),
    description: text('description').notNull().default(''),
    shotSize: text('shot_size').notNull().default('medium'),
    cameraAngle: text('camera_angle').notNull().default('eye-level'),
    /** { type, speed } — see cameraMovementSchema. */
    cameraMovementJson: text('camera_movement_json').notNull().default('{"type":"static","speed":"static"}'),
    lens: text('lens').notNull().default('50mm'),
    durationSeconds: integer('duration_seconds').notNull().default(5),
    /** ShotCharacterRef[] — each entry pins a bible snapshot versionId. */
    charactersJson: text('characters_json').notNull().default('[]'),
    /** Denormalised for indexed lookups; the pinned version lives in locationVersionId. */
    locationId: text('location_id'),
    locationVersionId: text('location_version_id'),
    /** ShotPropRef[] — propId + versionId + heldBy + state. */
    propsJson: text('props_json').notNull().default('[]'),
    dialogue: text('dialogue').notNull().default(''),
    emotion: text('emotion').notNull().default(''),
    lighting: text('lighting').notNull().default(''),
    visualEffectsJson: text('visual_effects_json').notNull().default('[]'),
    soundEffectsJson: text('sound_effects_json').notNull().default('[]'),
    /** ContinuityState entering the shot. */
    continuityInJson: text('continuity_in_json').notNull().default('{}'),
    /** ContinuityState leaving the shot. */
    continuityOutJson: text('continuity_out_json').notNull().default('{}'),
    /** Fields deliberately changed at this cut ("CHAR001.costume", "environment.time"). */
    intentionalChangesJson: text('intentional_changes_json').notNull().default('[]'),
    aspectRatio: text('aspect_ratio').notNull().default('16:9'),
    importance: text('importance').notNull().default('normal'),
    status: text('status').notNull().default('planned'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('shots_project_code_uq').on(t.projectId, t.code),
    index('shots_scene_number_idx').on(t.sceneId, t.shotNumber),
    index('shots_project_status_idx').on(t.projectId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Visual bibles
// ---------------------------------------------------------------------------

export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull().default('supporting'),
    identityJson: text('identity_json').notNull().default('{}'),
    variableJson: text('variable_json').notNull().default('{}'),
    promptToken: text('prompt_token').notNull().default(''),
    negativePrompt: text('negative_prompt').notNull().default(''),
    forbiddenChangesJson: text('forbidden_changes_json').notNull().default('[]'),
    colorPaletteJson: text('color_palette_json').notNull().default('[]'),
    voiceProfileId: text('voice_profile_id'),
    currentVersion: integer('current_version').notNull().default(1),
    lockEnabled: integer('lock_enabled', { mode: 'boolean' }).notNull().default(true),
    status: text('status').notNull().default('draft'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('characters_project_code_uq').on(t.projectId, t.code)],
);

export const locations = sqliteTable(
  'locations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull().default('interior'),
    era: text('era').notNull().default(''),
    detailsJson: text('details_json').notNull().default('{}'),
    promptBlock: text('prompt_block').notNull().default(''),
    negativePrompt: text('negative_prompt').notNull().default(''),
    colorPaletteJson: text('color_palette_json').notNull().default('[]'),
    continuityNotes: text('continuity_notes').notNull().default(''),
    currentVersion: integer('current_version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('locations_project_code_uq').on(t.projectId, t.code)],
);

export const props = sqliteTable(
  'props',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    ownerCharacterId: text('owner_character_id'),
    detailsJson: text('details_json').notNull().default('{}'),
    promptToken: text('prompt_token').notNull().default(''),
    continuityConstraintsJson: text('continuity_constraints_json').notNull().default('[]'),
    currentVersion: integer('current_version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('props_project_code_uq').on(t.projectId, t.code)],
);

export const styles = sqliteTable(
  'styles',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default('stylized-3d'),
    detailsJson: text('details_json').notNull().default('{}'),
    promptBlock: text('prompt_block').notNull().default(''),
    negativeStyleRules: text('negative_style_rules').notNull().default(''),
    currentVersion: integer('current_version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('styles_project_code_uq').on(t.projectId, t.code)],
);

/** Immutable snapshot of a bible entity (character | location | prop | style). */
export const bibleVersions = sqliteTable(
  'bible_versions',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    refId: text('ref_id').notNull(),
    version: integer('version').notNull(),
    payloadJson: text('payload_json').notNull(),
    note: text('note').notNull().default(''),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [
    uniqueIndex('bible_versions_uq').on(t.kind, t.refId, t.version),
    index('bible_versions_ref_idx').on(t.refId),
  ],
);

export const voiceProfiles = sqliteTable(
  'voice_profiles',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    provider: text('provider').notNull().default('mock'),
    language: text('language').notNull().default('vi-VN'),
    voiceName: text('voice_name').notNull().default(''),
    speed: real('speed').notNull().default(1),
    pitch: real('pitch').notNull().default(0),
    emotion: text('emotion').notNull().default('neutral'),
    style: text('style').notNull().default(''),
    pronunciationJson: text('pronunciation_json').notNull().default('{}'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [index('voice_profiles_project_idx').on(t.projectId)],
);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const prompts = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    shotId: text('shot_id'),
    kind: text('kind').notNull().default('image'),
    name: text('name').notNull().default(''),
    currentVersion: integer('current_version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    ...timestamps,
  },
  (t) => [index('prompts_project_kind_idx').on(t.projectId, t.kind), index('prompts_shot_idx').on(t.shotId)],
);

export const promptVersions = sqliteTable(
  'prompt_versions',
  {
    id: text('id').primaryKey(),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    blocksJson: text('blocks_json').notNull().default('{}'),
    compiled: text('compiled').notNull().default(''),
    negative: text('negative').notNull().default(''),
    lockRefsJson: text('lock_refs_json').notNull().default('{}'),
    lintJson: text('lint_json').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [uniqueIndex('prompt_versions_uq').on(t.promptId, t.version)],
);

// ---------------------------------------------------------------------------
// Generations (request + queue row + result — see ADR 0003)
// ---------------------------------------------------------------------------

export const generations = sqliteTable(
  'generations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    shotId: text('shot_id'),
    promptId: text('prompt_id'),
    promptVersion: integer('prompt_version'),
    kind: text('kind').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull().default(''),
    negativePrompt: text('negative_prompt').notNull().default(''),
    paramsJson: text('params_json').notNull().default('{}'),
    referenceAssetsJson: text('reference_assets_json').notNull().default('[]'),
    seed: integer('seed'),
    status: text('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(100),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lockedAt: text('locked_at'),
    lockedBy: text('locked_by'),
    scheduledAt: text('scheduled_at').notNull().default(nowSql),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    estimatedCostUsd: real('estimated_cost_usd').notNull().default(0),
    actualCostUsd: real('actual_cost_usd').notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    rawResponseJson: text('raw_response_json').notNull().default('{}'),
    idempotencyKey: text('idempotency_key').unique(),
    ...timestamps,
  },
  (t) => [
    index('generations_queue_idx').on(t.status, t.priority, t.scheduledAt),
    index('generations_project_status_idx').on(t.projectId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Assets + lineage
// ---------------------------------------------------------------------------

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    shotId: text('shot_id'),
    generationId: text('generation_id'),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull().default(''),
    mimeType: text('mime_type').notNull().default('application/octet-stream'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    checksum: text('checksum').notNull().default(''),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: real('duration_seconds'),
    tagsJson: text('tags_json').notNull().default('[]'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    version: integer('version').notNull().default(1),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
    rating: integer('rating'),
    approvalState: text('approval_state').notNull().default('pending'),
    ...timestamps,
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('assets_project_kind_idx').on(t.projectId, t.kind, t.deletedAt),
    index('assets_checksum_idx').on(t.checksum),
    index('assets_shot_idx').on(t.shotId),
  ],
);

export const assetRelations = sqliteTable(
  'asset_relations',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    childId: text('child_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    relation: text('relation').notNull().default('derivedFrom'),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [uniqueIndex('asset_relations_uq').on(t.parentId, t.childId, t.relation)],
);

export const productionAssetBindings = sqliteTable(
  'production_asset_bindings',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    targetVersionId: text('target_version_id').notNull().default(''),
    role: text('role').notNull(),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [
    uniqueIndex('production_asset_bindings_uq').on(
      t.assetId,
      t.targetType,
      t.targetId,
      t.targetVersionId,
      t.role,
    ),
    index('production_asset_bindings_project_target_idx').on(t.projectId, t.targetType, t.targetId),
  ],
);

// ---------------------------------------------------------------------------
// Approvals, quality, workflow, timeline, export, audit
// ---------------------------------------------------------------------------

export const approvals = sqliteTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    decision: text('decision').notNull(),
    note: text('note').notNull().default(''),
    decidedBy: text('decided_by'),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [index('approvals_target_idx').on(t.projectId, t.targetType, t.targetId)],
);

export const qualityReports = sqliteTable(
  'quality_reports',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    shotId: text('shot_id'),
    assetId: text('asset_id'),
    score: integer('score').notNull().default(0),
    passed: integer('passed', { mode: 'boolean' }).notNull().default(false),
    checksJson: text('checks_json').notNull().default('[]'),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [index('quality_reports_project_idx').on(t.projectId, t.targetType)],
);

export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workflowKey: text('workflow_key').notNull(),
    status: text('status').notNull().default('running'),
    stepsJson: text('steps_json').notNull().default('[]'),
    inputJson: text('input_json').notNull().default('{}'),
    outputJson: text('output_json').notNull().default('{}'),
    startedAt: text('started_at').notNull().default(nowSql),
    finishedAt: text('finished_at'),
  },
  (t) => [index('workflow_runs_project_idx').on(t.projectId, t.status)],
);

export const timelines = sqliteTable(
  'timelines',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    episodeId: text('episode_id'),
    name: text('name').notNull().default('Master timeline'),
    itemsJson: text('items_json').notNull().default('[]'),
    ...timestamps,
  },
  (t) => [index('timelines_project_idx').on(t.projectId)],
);

export const exports = sqliteTable(
  'exports',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('project-package'),
    status: text('status').notNull().default('completed'),
    storageKey: text('storage_key').notNull().default(''),
    frozenVersionsJson: text('frozen_versions_json').notNull().default('{}'),
    summaryJson: text('summary_json').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [index('exports_project_kind_idx').on(t.projectId, t.kind)],
);

export const publishes = sqliteTable(
  'publishes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    exportId: text('export_id')
      .notNull()
      .references(() => exports.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    ...timestamps,
  },
  (t) => [index('publishes_project_idx').on(t.projectId), index('publishes_export_idx').on(t.exportId)],
);

export const nodeGraphs = sqliteTable(
  'node_graphs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('Untitled workflow'),
    graphJson: text('graph_json').notNull().default('{"nodes":[],"edges":[]}'),
    status: text('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('node_graphs_project_idx').on(t.projectId)],
);

export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id'),
    userId: text('user_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull().default(''),
    targetId: text('target_id').notNull().default(''),
    detailsJson: text('details_json').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [index('activity_logs_project_idx').on(t.projectId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Sound Studio
// ---------------------------------------------------------------------------

export const audioMixes = sqliteTable('audio_mixes', {
  id: text('id').primaryKey(),
  episodeId: text('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' })
    .unique(),
  ...timestamps,
});

export const audioTracks = sqliteTable(
  'audio_tracks',
  {
    id: text('id').primaryKey(),
    mixId: text('mix_id')
      .notNull()
      .references(() => audioMixes.id, { onDelete: 'cascade' }),
    layer: text('layer').notNull(),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    shotId: text('shot_id').references(() => shots.id, { onDelete: 'set null' }),
    generationId: text('generation_id').references(() => generations.id, { onDelete: 'set null' }),
    startTimeSeconds: real('start_time_seconds').notNull().default(0),
    durationSeconds: real('duration_seconds').notNull(),
    gainDb: real('gain_db').notNull().default(0),
    muted: integer('muted').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('audio_tracks_mix_idx').on(t.mixId)],
);

export const schema = {
  workspaces,
  users,
  projects,
  episodes,
  scriptDocuments,
  scenes,
  shots,
  characters,
  locations,
  props,
  styles,
  bibleVersions,
  voiceProfiles,
  prompts,
  promptVersions,
  generations,
  assets,
  assetRelations,
  productionAssetBindings,
  approvals,
  qualityReports,
  workflowRuns,
  timelines,
  exports,
  publishes,
  nodeGraphs,
  activityLogs,
  audioMixes,
  audioTracks,
};
