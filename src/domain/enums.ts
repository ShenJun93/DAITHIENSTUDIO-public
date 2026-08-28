/** Vocabularies shared by the schema, the API and the UI. */
export const PROJECT_FORMATS = [
  'short-film',
  'series',
  'commercial',
  'ugc',
  'motion-comic',
  'explainer',
  'music-video',
  'trailer',
] as const;

export const PRODUCTION_TYPES = [
  'cinematic-short-film',
  'animated-series',
  'silent-comedy',
  'motion-comic',
  'youtube-short',
  'product-ad',
  'documentary',
  'educational-video',
] as const;

export const PROJECT_STATUSES = ['development', 'production', 'review', 'published', 'archived'] as const;
export const PRODUCTION_STRATEGIES = ['hybrid', 'auto'] as const;
export const ASSET_BINDING_TARGETS = ['character', 'location', 'prop', 'style', 'shot'] as const;
export const ASSET_BINDING_ROLES = [
  'identity-anchor',
  'environment-anchor',
  'prop-anchor',
  'style-anchor',
  'storyboard-keyframe',
] as const;

export const AUDIO_TRACK_LAYERS = ['dialogue', 'ambience', 'foley', 'music'] as const;

export const PLATFORMS = ['youtube', 'tiktok', 'shorts', 'reels', 'facebook', 'website', 'tv', 'internal'] as const;

export const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5', '2.39:1', '21:9', '3:2'] as const;

export const RESOLUTIONS: Record<string, { width: number; height: number }> = {
  '1920x1080': { width: 1920, height: 1080 },
  '3840x2160': { width: 3840, height: 2160 },
  '1080x1920': { width: 1080, height: 1920 },
  '1080x1080': { width: 1080, height: 1080 },
  '1080x1350': { width: 1080, height: 1350 },
  '2560x1080': { width: 2560, height: 1080 },
};

export const FRAME_RATES = [24, 25, 30, 60] as const;

export const SHOT_SIZES = [
  'extreme-wide',
  'wide',
  'full',
  'medium',
  'medium-close',
  'close',
  'extreme-close',
  'insert',
  'over-the-shoulder',
  'two-shot',
  'point-of-view',
] as const;

/** Kept as an alias: the master prompt calls this field `shotType`. */
export const SHOT_TYPES = SHOT_SIZES;

export const ESTABLISHING_SHOT_SIZES = ['extreme-wide', 'wide', 'full'] as const;
export const ESTABLISHING_SHOT_TYPES = ESTABLISHING_SHOT_SIZES;

export const CAMERA_ANGLES = [
  'eye-level',
  'low-angle',
  'high-angle',
  'dutch',
  'birds-eye',
  'worms-eye',
  'over-shoulder',
] as const;

/**
 * Camera movement is an object `{ type, speed }` (data contract from the
 * governance spec §2.6) so a "slow push-in" and a "fast push-in" are the same
 * grammar at different speeds rather than two unrelated strings.
 */
export const CAMERA_MOVEMENT_TYPES = [
  'static',
  'push-in',
  'pull-out',
  'pan-left',
  'pan-right',
  'tilt-up',
  'tilt-down',
  'handheld',
  'crane-up',
  'crane-down',
  'dolly-follow',
  'parallax',
  'whip-pan',
  'orbit',
] as const;

export const MOVEMENT_SPEEDS = ['static', 'slow', 'medium', 'fast'] as const;

export const COMPLEX_CAMERA_MOVEMENT_TYPES = ['crane-up', 'crane-down', 'orbit', 'whip-pan', 'dolly-follow'] as const;

/** Screen geography — what makes eyeline and 180-degree checks possible. */
export const SCREEN_POSITIONS = [
  'left',
  'center-left',
  'center',
  'center-right',
  'right',
  'off-screen',
] as const;

export const FACINGS = [
  'screen-left',
  'screen-right',
  'to-camera',
  'away-from-camera',
  'up',
  'down',
] as const;

export const LIGHT_DIRECTIONS = [
  'screen-left',
  'screen-right',
  'front',
  'back',
  'top',
  'ambient',
  'unspecified',
] as const;

export const WEATHER = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'wind', 'unspecified'] as const;

/** How the continuity checker classifies a difference between two shots. */
export const CONTINUITY_CLASSES = [
  'intentional-change',
  'missing-transition',
  'continuity-violation',
  'unknown',
] as const;

export const TIME_OF_DAY = ['dawn', 'day', 'golden-hour', 'dusk', 'night', 'unspecified'] as const;

export const SHOT_STATUSES = [
  'planned',
  'prompted',
  'generating',
  'review',
  'approved',
  'rejected',
  'rendered',
] as const;

export const SCENE_STATUSES = ['draft', 'approved', 'locked'] as const;

export const BIBLE_STATUSES = ['draft', 'approved', 'locked'] as const;

export const BIBLE_KINDS = ['character', 'location', 'prop', 'style'] as const;

export const GENERATION_KINDS = ['image', 'video', 'voice', 'music', 'sound', 'text'] as const;

export const GENERATION_STATUSES = ['pending', 'processing', 'completed', 'failed', 'cancelled'] as const;

export const TERMINAL_GENERATION_STATUSES = ['completed', 'failed', 'cancelled'] as const;

export const ASSET_KINDS = [
  'character',
  'location',
  'prop',
  'style',
  'storyboard',
  'image',
  'video',
  'voice',
  'music',
  'sound',
  'subtitle',
  'prompt',
  'document',
  'export',
] as const;

export const APPROVAL_STATES = ['pending', 'approved', 'rejected'] as const;

export const APPROVAL_DECISIONS = ['approved', 'rejected', 'changes-requested'] as const;

export const APPROVAL_TARGETS = ['shot', 'asset', 'script', 'character', 'style', 'storyboard', 'export', 'prompt'] as const;

export const SCRIPT_TYPES = [
  'screenplay',
  'youtube',
  'tiktok',
  'commercial',
  'voice-over',
  'documentary',
  'dialogue',
  'motion-comic',
  'shot-based',
] as const;

export const WORKFLOW_KEYS = [
  'motion-comic',
  'stylized-3d',
  'photoreal',
  'product',
  'ugc',
  'surreal',
] as const;

export const EXPORT_KINDS = ['project-package', 'edl', 'srt', 'shot-list', 'voice-script', 'video'] as const;

export const STYLE_CATEGORIES = [
  'motion-comic-2.5d',
  'stylized-3d',
  'anime-manga-manhwa',
  'photoreal-cinematic',
  'claymation-stopmotion',
  'surreal-dreamlike',
  'product-commercial',
  'avatar-presenter',
  'motion-graphics',
  'hybrid',
] as const;

export type ProjectFormat = (typeof PROJECT_FORMATS)[number];
export type ProductionType = (typeof PRODUCTION_TYPES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProductionStrategy = (typeof PRODUCTION_STRATEGIES)[number];
export type AssetBindingTarget = (typeof ASSET_BINDING_TARGETS)[number];
export type AssetBindingRole = (typeof ASSET_BINDING_ROLES)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type ShotSize = (typeof SHOT_SIZES)[number];
export type ShotType = ShotSize;
export type CameraAngle = (typeof CAMERA_ANGLES)[number];
export type CameraMovementType = (typeof CAMERA_MOVEMENT_TYPES)[number];
export type MovementSpeed = (typeof MOVEMENT_SPEEDS)[number];
export type ScreenPosition = (typeof SCREEN_POSITIONS)[number];
export type Facing = (typeof FACINGS)[number];
export type LightDirection = (typeof LIGHT_DIRECTIONS)[number];
export type ContinuityClass = (typeof CONTINUITY_CLASSES)[number];
export type ShotStatus = (typeof SHOT_STATUSES)[number];
export type GenerationKind = (typeof GENERATION_KINDS)[number];
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];
export type AssetKind = (typeof ASSET_KINDS)[number];
export type BibleKind = (typeof BIBLE_KINDS)[number];
export type StyleCategory = (typeof STYLE_CATEGORIES)[number];
export type WorkflowKey = (typeof WORKFLOW_KEYS)[number];
export type ExportKind = (typeof EXPORT_KINDS)[number];
export type ApprovalDecisions = (typeof APPROVAL_DECISIONS)[number];
export type ApprovalTarget = (typeof APPROVAL_TARGETS)[number];
export type ScriptType = (typeof SCRIPT_TYPES)[number];
