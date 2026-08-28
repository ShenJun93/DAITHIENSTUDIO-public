/**
 * Zod schemas — the single source of truth for every system boundary
 * (HTTP request/response, JSON columns, provider payloads, exports).
 */
import { z } from 'zod';
import {
  APPROVAL_DECISIONS,
  APPROVAL_STATES,
  APPROVAL_TARGETS,
  ASPECT_RATIOS,
  ASSET_KINDS,
  BIBLE_KINDS,
  BIBLE_STATUSES,
  AUDIO_TRACK_LAYERS,
  CAMERA_ANGLES,
  CAMERA_MOVEMENT_TYPES,
  CONTINUITY_CLASSES,
  EXPORT_KINDS,
  FACINGS,
  LIGHT_DIRECTIONS,
  MOVEMENT_SPEEDS,
  SCREEN_POSITIONS,
  SHOT_SIZES,
  WEATHER,
  FRAME_RATES,
  GENERATION_KINDS,
  GENERATION_STATUSES,
  PLATFORMS,
  PROJECT_FORMATS,
  PROJECT_STATUSES,
  PRODUCTION_STRATEGIES,
  ASSET_BINDING_TARGETS,
  ASSET_BINDING_ROLES,
  SCENE_STATUSES,
  SCRIPT_TYPES,
  SHOT_STATUSES,
  STYLE_CATEGORIES,
  TIME_OF_DAY,
  WORKFLOW_KEYS,
} from './enums';
import { BIBLE_CODE_PATTERN, SHOT_CODE_PATTERN } from './ids';

export const nonEmpty = z.string().trim().min(1);

// ---------------------------------------------------------------------------
// Episode
// ---------------------------------------------------------------------------

export const createEpisodeSchema = z.object({
  title: nonEmpty.max(160),
  synopsis: z.string().max(4000).default(''),
});
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;

export const updateEpisodeSchema = createEpisodeSchema
  .partial()
  .extend({ status: z.enum(['draft', 'in-production', 'completed']).optional() });
export type UpdateEpisodeInput = z.infer<typeof updateEpisodeSchema>;

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const STORY_PARTS = ['logline', 'synopsis', 'theme', 'tone', 'hook', 'cliffhanger', 'beats'] as const;
export const storyPartSchema = z.enum(STORY_PARTS);
export type StoryPart = z.infer<typeof storyPartSchema>;

export const storyBeatSchema = z.object({
  act: z.number().int(),
  title: z.string().default(''),
  description: z.string().default(''),
});
export type StoryBeat = z.infer<typeof storyBeatSchema>;

export const creativeBriefSchema = z.object({
  logline: z.string().default(''),
  synopsis: z.string().default(''),
  theme: z.string().default(''),
  tone: z.string().default(''),
  references: z.array(z.string()).default([]),
  hook: z.string().default(''),
  cliffhanger: z.string().default(''),
  beats: z.array(storyBeatSchema).default([]),
  // Story Development module (TASK-004): the premise the operator typed, kept
  // so "regenerate one part" still has context after a reload, and the set of
  // parts the operator has explicitly locked against regeneration/overwrite.
  premise: z.string().max(4000).default(''),
  approvedParts: z.array(storyPartSchema).default([]),
});
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;

/** Provider output contract for the `story-development` structured-output schema. */
export const storyDevelopmentSchema = z.object({
  logline: z.string().default(''),
  synopsis: z.string().default(''),
  theme: z.string().default(''),
  tone: z.string().default(''),
  hook: z.string().default(''),
  cliffhanger: z.string().default(''),
  beats: z.array(storyBeatSchema).default([]),
});
export type StoryDevelopment = z.infer<typeof storyDevelopmentSchema>;

/**
 * Provider output contract for the `production-advisory` structured-output
 * schema (M9 initial slice — read/analyze/propose only, never persisted).
 */
export const productionAdvisorySuggestionSchema = z.object({
  kind: z.enum(['continuity', 'risk-cost', 'next-action', 'script-scene-shot', 'prompt']),
  message: z.string(),
  rationale: z.string(),
});
export type ProductionAdvisorySuggestion = z.infer<typeof productionAdvisorySuggestionSchema>;

export const productionAdvisorySchema = z.object({
  suggestions: z.array(productionAdvisorySuggestionSchema).default([]),
});
export type ProductionAdvisory = z.infer<typeof productionAdvisorySchema>;

export const generateStorySchema = z.object({
  premise: nonEmpty.max(4000),
});
export type GenerateStoryInput = z.infer<typeof generateStorySchema>;

export const regenerateStoryPartSchema = z.object({
  part: storyPartSchema,
  premise: z.string().max(4000).optional(),
});
export type RegenerateStoryPartInput = z.infer<typeof regenerateStoryPartSchema>;

export const saveStorySchema = creativeBriefSchema
  .omit({ approvedParts: true })
  .partial();
export type SaveStoryInput = z.infer<typeof saveStorySchema>;

export const acceptStoryPartsSchema = z.object({
  parts: z.array(storyPartSchema).min(1),
  values: saveStorySchema.optional(),
});
export type AcceptStoryPartsInput = z.infer<typeof acceptStoryPartsSchema>;

export const unlockStoryPartsSchema = z.object({
  parts: z.array(storyPartSchema).min(1),
});
export type UnlockStoryPartsInput = z.infer<typeof unlockStoryPartsSchema>;

export const createProjectSchema = z.object({
  title: nonEmpty.max(160),
  description: z.string().max(4000).default(''),
  genre: z.string().max(120).default(''),
  format: z.enum(PROJECT_FORMATS).default('short-film'),
  targetAudience: z.string().max(200).default(''),
  platform: z.enum(PLATFORMS).default('youtube'),
  language: z.string().min(2).max(12).default('vi-VN'),
  durationTargetSeconds: z.number().int().min(5).max(36_000).default(300),
  aspectRatio: z.enum(ASPECT_RATIOS).default('16:9'),
  secondaryAspectRatios: z.array(z.enum(ASPECT_RATIOS)).default(['9:16']),
  frameRate: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(24),
  resolution: z.string().regex(/^\d{3,5}x\d{3,5}$/).default('1920x1080'),
  stylePresetKey: z.string().optional(),
  costLimitUsd: z.number().min(0).max(100_000).default(25),
  productionStrategy: z.enum(PRODUCTION_STRATEGIES).optional(),
  creativeBrief: creativeBriefSchema.partial().default({}),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .partial()
  .extend({ status: z.enum(PROJECT_STATUSES).optional(), styleId: z.string().nullable().optional() });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

const bindingRoleByTarget = {
  character: 'identity-anchor',
  location: 'environment-anchor',
  prop: 'prop-anchor',
  style: 'style-anchor',
  shot: 'storyboard-keyframe',
} as const;

export const bindProductionAssetSchema = z.object({
  assetId: nonEmpty,
  targetType: z.enum(ASSET_BINDING_TARGETS),
  targetId: nonEmpty,
  targetVersionId: z.string().max(80).default(''),
  role: z.enum(ASSET_BINDING_ROLES),
}).superRefine((input, context) => {
  if (bindingRoleByTarget[input.targetType] !== input.role) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: `Role ${input.role} is invalid for ${input.targetType}.` });
  }
  if (input.targetType !== 'shot' && !/^(CHAR|LOC|PROP|STY)\d{3}_V\d+$/.test(input.targetVersionId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetVersionId'], message: 'Bible bindings require a concrete snapshot id.' });
  }
  if (input.targetType === 'shot' && input.targetVersionId !== '') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetVersionId'], message: 'Shot bindings do not use a Bible snapshot id.' });
  }
});
export type BindProductionAssetInput = z.infer<typeof bindProductionAssetSchema>;

// ---------------------------------------------------------------------------
// Script / scene / shot
// ---------------------------------------------------------------------------

export const dialogueLineSchema = z.object({
  characterId: z.string().default(''),
  characterName: z.string().default(''),
  text: z.string().default(''),
  emotion: z.string().default(''),
  delivery: z.string().default(''),
  voiceId: z.string().default(''),
  durationEstimate: z.number().min(0).default(0),
});
export type DialogueLine = z.infer<typeof dialogueLineSchema>;

export const saveScriptSchema = z.object({
  title: z.string().max(160).default('Main script'),
  scriptType: z.enum(SCRIPT_TYPES).default('motion-comic'),
  raw: z.string().max(400_000),
});
export type SaveScriptInput = z.infer<typeof saveScriptSchema>;

export const sceneInputSchema = z.object({
  title: nonEmpty.max(200),
  number: z.number().int().min(1).max(999).optional(),
  locationId: z.string().nullable().default(null),
  timeOfDay: z.enum(TIME_OF_DAY).default('day'),
  summary: z.string().max(4000).default(''),
  action: z.string().max(20_000).default(''),
  dialogue: z.array(dialogueLineSchema).default([]),
  emotion: z.string().max(200).default(''),
  visualGoal: z.string().max(1000).default(''),
  audioGoal: z.string().max(1000).default(''),
  durationSeconds: z.number().int().min(0).max(7200).default(0),
  characters: z.array(z.string()).default([]),
  status: z.enum(SCENE_STATUSES).default('draft'),
});
export type SceneInput = z.infer<typeof sceneInputSchema>;

// --- Shot data contract (nested form, governance spec §2.6 / §3.2) ---------
//
// Every reference into a bible carries the *snapshot version* it was written
// against (`versionId` like "CHAR001_V2"). That is what makes continuity and
// asset lineage auditable instead of aspirational.

export const versionIdSchema = z
  .string()
  .regex(/^(CHAR|LOC|PROP|STY)\d{3}_V\d+$/, 'Expected a snapshot id like CHAR001_V1');

export const cameraMovementSchema = z.object({
  type: z.enum(CAMERA_MOVEMENT_TYPES).default('static'),
  speed: z.enum(MOVEMENT_SPEEDS).default('static'),
});
export type CameraMovement = z.infer<typeof cameraMovementSchema>;

export const shotCharacterRefSchema = z.object({
  characterId: nonEmpty,
  versionId: z.string().default(''),
  screenPosition: z.enum(SCREEN_POSITIONS).default('center'),
  facing: z.enum(FACINGS).default('to-camera'),
  action: z.string().max(600).default(''),
  emotion: z.string().max(120).default(''),
});
export type ShotCharacterRef = z.infer<typeof shotCharacterRefSchema>;

export const locationRefSchema = z.object({
  locationId: nonEmpty,
  versionId: z.string().default(''),
});
export type LocationRef = z.infer<typeof locationRefSchema>;

export const shotPropRefSchema = z.object({
  propId: nonEmpty,
  versionId: z.string().default(''),
  heldBy: z.string().nullable().default(null),
  state: z.string().max(200).default('intact'),
});
export type ShotPropRef = z.infer<typeof shotPropRefSchema>;

/** Per-character physical state at a shot boundary. */
export const characterStateSchema = z.object({
  costume: z.string().default(''),
  hair: z.string().default(''),
  injuries: z.array(z.string()).default([]),
  heldProps: z.array(z.string()).default([]),
  position: z.string().default(''),
  facing: z.enum(FACINGS).default('to-camera'),
});
export type CharacterState = z.infer<typeof characterStateSchema>;

export const environmentStateSchema = z.object({
  time: z.enum(TIME_OF_DAY).default('unspecified'),
  weather: z.enum(WEATHER).default('unspecified'),
  lightDirection: z.enum(LIGHT_DIRECTIONS).default('unspecified'),
  damagedObjects: z.array(z.string()).default([]),
});
export type EnvironmentState = z.infer<typeof environmentStateSchema>;

/** One side of a shot boundary: what is true entering, or leaving, the shot. */
export const continuityStateSchema = z.object({
  note: z.string().max(1000).default(''),
  characters: z.record(characterStateSchema).default({}),
  environment: environmentStateSchema.default({}),
});
export type ContinuityState = z.infer<typeof continuityStateSchema>;

export const continuitySchema = z.object({
  incoming: continuityStateSchema.default({}),
  outgoing: continuityStateSchema.default({}),
  /**
   * Fields the director deliberately changed at this cut, written as
   * "characterId.field" or "environment.field". Anything listed here is
   * reported as `intentional-change` instead of a violation.
   */
  intentionalChanges: z.array(z.string()).default([]),
});
export type Continuity = z.infer<typeof continuitySchema>;

export const shotInputSchema = z.object({
  sceneId: nonEmpty,
  shotNumber: z.number().int().min(1).max(999).optional(),
  title: z.string().max(200).default(''),
  description: z.string().max(4000).default(''),
  shotSize: z.enum(SHOT_SIZES).default('medium'),
  cameraAngle: z.enum(CAMERA_ANGLES).default('eye-level'),
  cameraMovement: cameraMovementSchema.default({}),
  lens: z.string().max(40).default('50mm'),
  durationSeconds: z.number().int().min(1).max(600).default(5),
  characters: z.array(shotCharacterRefSchema).default([]),
  location: locationRefSchema.nullable().default(null),
  props: z.array(shotPropRefSchema).default([]),
  dialogue: z.string().max(4000).default(''),
  emotion: z.string().max(200).default(''),
  lighting: z.string().max(400).default(''),
  visualEffects: z.array(z.string()).default([]),
  soundEffects: z.array(z.string()).default([]),
  continuity: continuitySchema.default({}),
  aspectRatio: z.enum(ASPECT_RATIOS).default('16:9'),
  importance: z.enum(['normal', 'key']).default('normal'),
});
export type ShotInput = z.infer<typeof shotInputSchema>;

export const updateShotSchema = shotInputSchema
  .partial()
  .omit({ sceneId: true })
  .extend({
    status: z.enum(SHOT_STATUSES).optional(),
    // Re-declared so a partial patch still produces a fully-defaulted ref,
    // which is what ShotRepository.update expects.
    location: locationRefSchema.nullable().optional(),
    characters: z.array(shotCharacterRefSchema).optional(),
    props: z.array(shotPropRefSchema).optional(),
    cameraMovement: cameraMovementSchema.optional(),
    continuity: continuitySchema.optional(),
  });
export type UpdateShotInput = z.infer<typeof updateShotSchema>;

/**
 * VC3 (TASK-UI-VISUAL-CONTROL-001) — one narrow, discriminated-union input
 * contract for shot reference repinning. Only the three shot-level repinnable
 * kinds exist; style is intentionally absent (project-level and read-only for
 * VC3). The application boundary constructs the permitted
 * `ShotRepository.update()` patch internally from these fields — callers never
 * pass a raw patch. `characterId`/`propId` identify the existing occurrence by
 * the repository's entity-id identity rule (a repin updates every ref with
 * that id in place); `locationId` must match the shot's current location.
 */
export const repinReferenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('character'),
    projectIdOrSlug: nonEmpty,
    shotId: nonEmpty,
    characterId: nonEmpty,
    versionId: nonEmpty,
  }),
  z.object({
    kind: z.literal('location'),
    projectIdOrSlug: nonEmpty,
    shotId: nonEmpty,
    locationId: nonEmpty,
    versionId: nonEmpty,
  }),
  z.object({
    kind: z.literal('prop'),
    projectIdOrSlug: nonEmpty,
    shotId: nonEmpty,
    propId: nonEmpty,
    versionId: nonEmpty,
  }),
]);
export type RepinReferenceInput = z.infer<typeof repinReferenceSchema>;

export const shotCodeSchema = z.string().regex(SHOT_CODE_PATTERN, 'Expected shot code like EP01_SC01_SH001');

/** TASK-005: reorder shots within one scene. Never renames a shot's code. */
export const reorderShotsSchema = z.object({
  sceneId: nonEmpty,
  shotIds: z.array(nonEmpty).min(1),
});
export type ReorderShotsInput = z.infer<typeof reorderShotsSchema>;

// ---------------------------------------------------------------------------
// Bibles
// ---------------------------------------------------------------------------

export const characterIdentitySchema = z.object({
  ageRange: z.string().default(''),
  species: z.string().default('human'),
  genderPresentation: z.string().default(''),
  height: z.string().default(''),
  bodyType: z.string().default(''),
  faceShape: z.string().default(''),
  skinTone: z.string().default(''),
  hair: z.string().default(''),
  eyes: z.string().default(''),
  distinguishingMarks: z.array(z.string()).default([]),
});
export type CharacterIdentity = z.infer<typeof characterIdentitySchema>;

export const characterVariableSchema = z.object({
  costume: z.string().default(''),
  accessories: z.array(z.string()).default([]),
  personality: z.string().default(''),
  motivation: z.string().default(''),
  weakness: z.string().default(''),
  comedyStyle: z.string().default(''),
  movementStyle: z.string().default(''),
  expressions: z.array(z.string()).default([]),
  poses: z.array(z.string()).default([]),
  costumeVariants: z.array(z.object({ key: z.string(), description: z.string() })).default([]),
});
export type CharacterVariable = z.infer<typeof characterVariableSchema>;

export const characterInputSchema = z.object({
  name: nonEmpty.max(120),
  code: z.string().regex(BIBLE_CODE_PATTERN).optional(),
  role: z.string().max(60).default('supporting'),
  identity: characterIdentitySchema.partial().default({}),
  variable: characterVariableSchema.partial().default({}),
  promptToken: z.string().max(400).default(''),
  negativePrompt: z.string().max(2000).default(''),
  forbiddenChanges: z.array(z.string()).default([]),
  colorPalette: z.array(z.string()).default([]),
  voiceProfileId: z.string().nullable().default(null),
  lockEnabled: z.boolean().default(true),
  status: z.enum(BIBLE_STATUSES).default('draft'),
});
export type CharacterInput = z.infer<typeof characterInputSchema>;

export const locationDetailsSchema = z.object({
  geography: z.string().default(''),
  architecture: z.string().default(''),
  layout: z.string().default(''),
  entrances: z.array(z.string()).default([]),
  exits: z.array(z.string()).default([]),
  lighting: z.string().default(''),
  weather: z.string().default(''),
  timeVariations: z.array(z.string()).default([]),
  keyObjects: z.array(z.string()).default([]),
  cameraPossibilities: z.array(z.string()).default([]),
  ambientSound: z.string().default(''),
});
export type LocationDetails = z.infer<typeof locationDetailsSchema>;

export const locationInputSchema = z.object({
  name: nonEmpty.max(120),
  code: z.string().regex(BIBLE_CODE_PATTERN).optional(),
  type: z.string().max(60).default('interior'),
  era: z.string().max(60).default(''),
  details: locationDetailsSchema.partial().default({}),
  promptBlock: z.string().max(2000).default(''),
  negativePrompt: z.string().max(2000).default(''),
  colorPalette: z.array(z.string()).default([]),
  continuityNotes: z.string().max(2000).default(''),
  status: z.enum(BIBLE_STATUSES).default('draft'),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export const propDetailsSchema = z.object({
  material: z.string().default(''),
  dimensions: z.string().default(''),
  color: z.string().default(''),
  condition: z.string().default(''),
  functionalBehavior: z.string().default(''),
  storyImportance: z.string().default(''),
});
export type PropDetails = z.infer<typeof propDetailsSchema>;

export const propInputSchema = z.object({
  name: nonEmpty.max(120),
  code: z.string().regex(BIBLE_CODE_PATTERN).optional(),
  description: z.string().max(2000).default(''),
  ownerCharacterId: z.string().nullable().default(null),
  details: propDetailsSchema.partial().default({}),
  promptToken: z.string().max(400).default(''),
  continuityConstraints: z.array(z.string()).default([]),
  status: z.enum(BIBLE_STATUSES).default('draft'),
});
export type PropInput = z.infer<typeof propInputSchema>;

export const styleDetailsSchema = z.object({
  medium: z.string().default(''),
  renderingStyle: z.string().default(''),
  lineQuality: z.string().default(''),
  texture: z.string().default(''),
  material: z.string().default(''),
  colorPalette: z.array(z.string()).default([]),
  contrast: z.string().default(''),
  lighting: z.string().default(''),
  cameraLanguage: z.string().default(''),
  lensBehavior: z.string().default(''),
  composition: z.string().default(''),
  characterProportions: z.string().default(''),
  environmentalDetail: z.string().default(''),
  motionStyle: z.string().default(''),
  editingStyle: z.string().default(''),
  transitionStyle: z.string().default(''),
  typography: z.string().default(''),
  subtitle: z.string().default(''),
  soundIdentity: z.string().default(''),
});
export type StyleDetails = z.infer<typeof styleDetailsSchema>;

export const styleInputSchema = z.object({
  name: nonEmpty.max(140),
  code: z.string().regex(BIBLE_CODE_PATTERN).optional(),
  category: z.enum(STYLE_CATEGORIES).default('stylized-3d'),
  details: styleDetailsSchema.partial().default({}),
  promptBlock: z.string().max(3000).default(''),
  negativeStyleRules: z.string().max(3000).default(''),
  status: z.enum(BIBLE_STATUSES).default('draft'),
});
export type StyleInput = z.infer<typeof styleInputSchema>;

export const bibleKindSchema = z.enum(BIBLE_KINDS);

/** TASK-006: Voice Studio. Not bible-versioned — a plain, no-history record. */
export const createVoiceProfileSchema = z.object({
  name: nonEmpty.max(120),
  provider: z.string().max(40).default('mock'),
  language: z.string().min(2).max(12).default('vi-VN'),
  voiceName: z.string().max(120).default(''),
  speed: z.number().min(0.25).max(4).default(1),
  pitch: z.number().min(-20).max(20).default(0),
  emotion: z.string().max(60).default('neutral'),
  style: z.string().max(200).default(''),
  pronunciation: z.record(z.string()).default({}),
});
export type CreateVoiceProfileInput = z.infer<typeof createVoiceProfileSchema>;

/** Queues a voice generation for one shot's dialogue. */
export const enqueueVoiceGenerationSchema = z.object({
  shotId: nonEmpty,
  voiceProfileId: z.string().nullable().default(null),
  language: z.string().min(2).max(12).optional(),
  voiceName: z.string().max(120).optional(),
  speed: z.number().min(0.25).max(4).optional(),
  pitch: z.number().min(-20).max(20).optional(),
  emotion: z.string().max(60).optional(),
});
export type EnqueueVoiceGenerationInput = z.infer<typeof enqueueVoiceGenerationSchema>;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const promptBlocksSchema = z.object({
  subject: z.string().default(''),
  characterIdentity: z.string().default(''),
  action: z.string().default(''),
  expression: z.string().default(''),
  environment: z.string().default(''),
  composition: z.string().default(''),
  shotSize: z.string().default(''),
  cameraAngle: z.string().default(''),
  lens: z.string().default(''),
  cameraMovement: z.string().default(''),
  lighting: z.string().default(''),
  color: z.string().default(''),
  material: z.string().default(''),
  visualStyle: z.string().default(''),
  motion: z.string().default(''),
  physics: z.string().default(''),
  atmosphere: z.string().default(''),
  continuity: z.string().default(''),
  technicalSettings: z.string().default(''),
  negativePrompt: z.string().default(''),
});
export type PromptBlocks = z.infer<typeof promptBlocksSchema>;

export const lockRefSchema = z.object({ id: z.string(), code: z.string().default(''), version: z.number().int().min(1) });
export const lockRefsSchema = z.object({
  characters: z.array(lockRefSchema).default([]),
  style: lockRefSchema.nullable().default(null),
  location: lockRefSchema.nullable().default(null),
  props: z.array(lockRefSchema).default([]),
});
export type LockRefs = z.infer<typeof lockRefsSchema>;

export const buildPromptSchema = z.object({
  shotId: nonEmpty,
  kind: z.enum(['image', 'video']).default('image'),
  blocks: promptBlocksSchema.partial().default({}),
  applyCharacterLock: z.boolean().default(true),
  applyStyleLock: z.boolean().default(true),
  applyLocationLock: z.boolean().default(true),
});
export type BuildPromptInput = z.infer<typeof buildPromptSchema>;

export const lintIssueSchema = z.object({
  rule: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  hint: z.string().default(''),
});
export type LintIssue = z.infer<typeof lintIssueSchema>;

export const lintResultSchema = z.object({
  ok: z.boolean(),
  score: z.number().int().min(0).max(100),
  issues: z.array(lintIssueSchema).default([]),
  characterCount: z.number().int().min(0).default(0),
});
export type LintResult = z.infer<typeof lintResultSchema>;

// ---------------------------------------------------------------------------
// Generations / assets
// ---------------------------------------------------------------------------

export const enqueueGenerationSchema = z.object({
  projectId: nonEmpty,
  shotId: z.string().nullable().default(null),
  promptId: z.string().nullable().default(null),
  kind: z.enum(GENERATION_KINDS),
  provider: z.string().optional(),
  model: z.string().optional(),
  prompt: z.string().max(20_000).optional(),
  negativePrompt: z.string().max(8000).optional(),
  params: z.record(z.unknown()).default({}),
  referenceAssetIds: z.array(z.string()).default([]),
  seed: z.number().int().optional(),
  priority: z.number().int().min(1).max(1000).default(100),
  idempotencyKey: z.string().max(200).optional(),
});
export type EnqueueGenerationInput = z.infer<typeof enqueueGenerationSchema>;

export const prepareImageGenerationSchema = enqueueGenerationSchema.extend({
  kind: z.literal('image'),
});
export type PrepareImageGenerationInput = z.infer<typeof prepareImageGenerationSchema>;

export const confirmImageGenerationSchema = z.object({
  request: prepareImageGenerationSchema,
  confirmationToken: z.string().min(1).max(16_000),
});
export type ConfirmImageGenerationInput = z.infer<typeof confirmImageGenerationSchema>;

export const prepareVideoGenerationSchema = enqueueGenerationSchema.extend({
  kind: z.literal('video'),
});
export type PrepareVideoGenerationInput = z.infer<typeof prepareVideoGenerationSchema>;

export const confirmVideoGenerationSchema = z.object({
  request: prepareVideoGenerationSchema,
  confirmationToken: z.string().min(1).max(16_000),
});
export type ConfirmVideoGenerationInput = z.infer<typeof confirmVideoGenerationSchema>;

export const generationStatusSchema = z.enum(GENERATION_STATUSES);

export const registerAssetSchema = z.object({
  projectId: nonEmpty,
  shotId: z.string().nullable().default(null),
  generationId: z.string().nullable().default(null),
  kind: z.enum(ASSET_KINDS),
  name: nonEmpty.max(200),
  mimeType: z.string().max(120).default('application/octet-stream'),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  parentAssetIds: z.array(z.string()).default([]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
});
export type RegisterAssetInput = z.infer<typeof registerAssetSchema>;

export const approvalInputSchema = z.object({
  targetType: z.enum(APPROVAL_TARGETS),
  targetId: nonEmpty,
  decision: z.enum(APPROVAL_DECISIONS),
  note: z.string().max(2000).default(''),
});
export type ApprovalInput = z.infer<typeof approvalInputSchema>;

const mutationIdentifier = z.string().trim().min(1).max(200);

export const studioUnlockInputSchema = z.object({
  apiKey: z.string().min(1).max(512),
});

export const assetDecisionActionInputSchema = z.object({
  slug: mutationIdentifier,
  assetId: mutationIdentifier,
  decision: z.enum(APPROVAL_DECISIONS),
  note: z.string().max(2000).default(''),
});

export const assetQualityActionInputSchema = z.object({
  slug: mutationIdentifier,
  assetId: mutationIdentifier,
});

export const assetApprovalParamsSchema = z.object({ id: mutationIdentifier });
export const assetApprovalBodySchema = approvalInputSchema.pick({ decision: true, note: true });
export const assetQualityRequestSchema = z.object({ assetId: mutationIdentifier });

export const approvalStateSchema = z.enum(APPROVAL_STATES);

// ---------------------------------------------------------------------------
// Quality / continuity / workflow / export
// ---------------------------------------------------------------------------

export const qualityCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(['image', 'video', 'audio', 'production']),
  severity: z.enum(['blocker', 'major', 'minor']),
  status: z.enum(['pass', 'fail', 'warn', 'manual']),
  detail: z.string().default(''),
});
export type QualityCheck = z.infer<typeof qualityCheckSchema>;

export const continuityFindingSchema = z.object({
  rule: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  classification: z.enum(CONTINUITY_CLASSES).default('unknown'),
  message: z.string(),
  field: z.string().default(''),
  expected: z.string().default(''),
  actual: z.string().default(''),
  sceneCode: z.string().default(''),
  shotCodes: z.array(z.string()).default([]),
});
export type ContinuityFinding = z.infer<typeof continuityFindingSchema>;

export const workflowStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped', 'awaiting-approval']),
  detail: z.string().default(''),
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export const runWorkflowSchema = z.object({
  projectId: nonEmpty,
  episodeId: nonEmpty.optional(),
  workflowKey: z.enum(WORKFLOW_KEYS),
  autoEnqueueGenerations: z.boolean().default(true),
});
export type RunWorkflowInput = z.infer<typeof runWorkflowSchema>;

export const timelineItemSchema = z.object({
  shotId: z.string(),
  shotCode: z.string(),
  order: z.number().int().min(0),
  startSeconds: z.number().min(0),
  durationSeconds: z.number().min(0),
  videoAssetId: z.string().nullable().default(null),
  voiceAssetId: z.string().nullable().default(null),
  musicAssetId: z.string().nullable().default(null),
  soundAssetIds: z.array(z.string()).default([]),
  subtitle: z.string().default(''),
  missing: z.array(z.string()).default([]),
});
export type TimelineItem = z.infer<typeof timelineItemSchema>;

// ---------------------------------------------------------------------------
// Sound Studio
// ---------------------------------------------------------------------------

export const audioTrackLayerSchema = z.enum(AUDIO_TRACK_LAYERS);

export const audioTrackSchema = z.object({
  id: z.string(),
  mixId: z.string(),
  layer: audioTrackLayerSchema,
  assetId: z.string(),
  shotId: z.string().nullable().default(null),
  generationId: z.string().nullable(),
  startTimeSeconds: z.number().min(0).default(0),
  durationSeconds: z.number().positive(),
  gainDb: z.number().default(0),
  muted: z.boolean().default(false),
});
export type AudioTrack = z.infer<typeof audioTrackSchema>;

export const audioMixSchema = z.object({
  id: z.string(),
  episodeId: z.string(),
  tracks: z.array(audioTrackSchema).default([]),
});
export type AudioMix = z.infer<typeof audioMixSchema>;

export const exportRequestSchema = z.object({
  projectId: nonEmpty,
  kind: z.enum(EXPORT_KINDS).default('project-package'),
});
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
export type ExportKindValue = (typeof EXPORT_KINDS)[number];

export const composeVideoSchema = z.object({
  projectId: nonEmpty,
  episodeId: nonEmpty.optional(),
  resolution: z.string().regex(/^\d{3,5}x\d{3,5}$/).default('1920x1080'),
  fps: z.number().int().min(1).max(120).default(24),
});
export type ComposeVideoInput = z.infer<typeof composeVideoSchema>;

export const exportDownloadQuerySchema = z.object({
  disposition: z.enum(['attachment', 'inline']).default('attachment'),
});
export type ExportDownloadQuery = z.infer<typeof exportDownloadQuerySchema>;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Publishing handoff
// ---------------------------------------------------------------------------

export const PUBLISH_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

export const n8nPublishPayloadSchema = z.object({
  projectId: nonEmpty,
  exportId: nonEmpty,
  downloadUrl: z.string().url(),
  metadata: z.record(z.unknown()).default({}),
});
export type N8nPublishPayload = z.infer<typeof n8nPublishPayloadSchema>;

export const publishRequestSchema = z.object({
  projectId: nonEmpty,
  exportId: nonEmpty,
  endpoint: z.string().url().max(2048).superRefine((value, context) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Publishing endpoint must use HTTP or HTTPS.' });
    }
    if (url.username || url.password) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Publishing endpoint must not contain credentials.' });
    }
  }),
});
export type PublishRequestInput = z.infer<typeof publishRequestSchema>;

// ---------------------------------------------------------------------------
// Node graph — constrained orchestration (ADR-007)
// ---------------------------------------------------------------------------

export const NODE_OPERATION_TYPES = [
  'generate-image',
  'generate-voice',
  'generate-video',
  'composite-video',
  'check-continuity',
  'approve-asset',
  'export-package',
] as const;
export type NodeOperationType = (typeof NODE_OPERATION_TYPES)[number];

export const graphNodeSchema = z.object({
  id: nonEmpty.max(100),
  type: z.enum(NODE_OPERATION_TYPES),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  data: z.object({
    label: z.string().trim().min(1).max(120),
    operationType: z.enum(NODE_OPERATION_TYPES),
  }).strict(),
}).strict().superRefine((node, context) => {
  if (node.data.operationType !== node.type) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['data', 'operationType'], message: 'Node operation must match its type.' });
  }
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: nonEmpty.max(100),
  source: nonEmpty.max(100),
  sourceHandle: z.string().max(100).nullable().default(null),
  target: nonEmpty.max(100),
  targetHandle: z.string().max(100).nullable().default(null),
}).strict();
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const nodeGraphSchema = z.object({
  nodes: z.array(graphNodeSchema).max(50).default([]),
  edges: z.array(graphEdgeSchema).max(100).default([]),
}).strict().superRefine((graph, context) => {
  const nodeIds = new Set<string>();
  for (const [index, node] of graph.nodes.entries()) {
    if (nodeIds.has(node.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'id'], message: 'Node ids must be unique.' });
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const [index, edge] of graph.edges.entries()) {
    if (edgeIds.has(edge.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index, 'id'], message: 'Edge ids must be unique.' });
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index], message: 'Every edge endpoint must reference a graph node.' });
    }
    if (edge.source === edge.target) context.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index], message: 'Self-referencing edges are not allowed.' });
  }
});
export type NodeGraph = z.infer<typeof nodeGraphSchema>;

export const NODE_GRAPH_STATUSES = ['draft', 'locked'] as const;
export type NodeGraphStatus = (typeof NODE_GRAPH_STATUSES)[number];
