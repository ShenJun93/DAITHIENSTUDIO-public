import type { LintResult, LockRefs } from '@/domain/schemas';

export type PromptKind = 'image' | 'video';

export type KindHealthStatus = 'MISSING' | 'BLOCKED' | 'NEEDS_ATTENTION' | 'READY' | 'UNKNOWN';

export type AggregateHealthStatus = 'NEEDS_ATTENTION' | 'BLOCKED' | 'EMPTY' | 'READY';

export interface PromptKindHealth {
  status: KindHealthStatus;
  reason: string;
}

export interface PromptHealth {
  status: AggregateHealthStatus;
  reason: string;
  tone: 'blocked' | 'info' | 'warning' | 'success';
  actionLabel: string | null;
  actionDestination: string | null;
  image: PromptKindHealth;
  video: PromptKindHealth;
}

export interface PromptReadData {
  compiled: string;
  negative: string;
  lockRefs: LockRefs;
  lint: LintResult | null;
  version: number;
  createdAt: string;
}

export interface ShotRefInputs {
  hasCharacters: boolean;
  hasLocation: boolean;
  hasProps: boolean;
  hasProjectStyle: boolean;
}

export function deriveKindHealth(
  prompt: PromptReadData | null,
  requiredRefs: ShotRefInputs,
  kind: PromptKind,
): PromptKindHealth {
  if (!prompt) {
    return { status: 'MISSING', reason: `No stored ${kind} prompt exists` };
  }

  const { lockRefs, lint } = prompt;

  if (!lockRefs || typeof lockRefs !== 'object') {
    return { status: 'NEEDS_ATTENTION', reason: `${kind} prompt lock data is malformed` };
  }

  if (!lint || typeof lint !== 'object' || lint.ok === undefined || lint.ok === null) {
    return { status: 'NEEDS_ATTENTION', reason: `${kind} prompt lint data is unavailable` };
  }

  const missingRefs: string[] = [];

  if (requiredRefs.hasCharacters && (!lockRefs.characters || lockRefs.characters.length === 0)) {
    missingRefs.push('character');
  }
  if (requiredRefs.hasLocation && !lockRefs.location) {
    missingRefs.push('location');
  }
  if (requiredRefs.hasProjectStyle && !lockRefs.style) {
    missingRefs.push('style');
  }

  if (missingRefs.length > 0) {
    const categories = missingRefs.join(', ');
    return {
      status: 'BLOCKED',
      reason: `Prompt compilation is blocked — missing required lock references (${categories})`,
    };
  }

  if (!lint.ok) {
    return { status: 'NEEDS_ATTENTION', reason: `${kind} prompt requires attention — lint issues found` };
  }

  return { status: 'READY', reason: `${kind} prompt is valid and ready` };
}

export function derivePromptHealth(
  imagePrompt: PromptReadData | null,
  videoPrompt: PromptReadData | null,
  requiredRefs: ShotRefInputs,
): PromptHealth {
  if (imagePrompt === undefined || videoPrompt === undefined) {
    return makeNullFallback();
  }

  const imageHealth = deriveKindHealth(imagePrompt, requiredRefs, 'image');
  const videoHealth = deriveKindHealth(videoPrompt, requiredRefs, 'video');

  if (imageHealth.status === 'UNKNOWN' || videoHealth.status === 'UNKNOWN') {
    return makeNullFallback();
  }

  if (imageHealth.status === 'BLOCKED' || videoHealth.status === 'BLOCKED') {
    const failing: string[] = [];
    if (imageHealth.status === 'BLOCKED') failing.push('image');
    if (videoHealth.status === 'BLOCKED') failing.push('video');
    return {
      status: 'BLOCKED',
      reason: imageHealth.status === 'BLOCKED' ? imageHealth.reason : videoHealth.reason,
      tone: 'blocked',
      actionLabel: 'Review references',
      actionDestination: '?tab=references',
      image: imageHealth,
      video: videoHealth,
    };
  }

  if (imageHealth.status === 'MISSING' && videoHealth.status === 'MISSING') {
    return {
      status: 'EMPTY',
      reason: 'No stored prompts exist for this shot',
      tone: 'info',
      actionLabel: null,
      actionDestination: null,
      image: imageHealth,
      video: videoHealth,
    };
  }

  if (
    imageHealth.status === 'MISSING' ||
    videoHealth.status === 'MISSING' ||
    imageHealth.status === 'NEEDS_ATTENTION' ||
    videoHealth.status === 'NEEDS_ATTENTION'
  ) {
    const reasons: string[] = [];
    if (imageHealth.status === 'MISSING') reasons.push('image prompt is missing');
    if (videoHealth.status === 'MISSING') reasons.push('video prompt is missing');
    if (imageHealth.status === 'NEEDS_ATTENTION') reasons.push('image prompt needs attention');
    if (videoHealth.status === 'NEEDS_ATTENTION') reasons.push('video prompt needs attention');
    return {
      status: 'NEEDS_ATTENTION',
      reason: reasons.join('; '),
      tone: 'warning',
      actionLabel: null,
      actionDestination: null,
      image: imageHealth,
      video: videoHealth,
    };
  }

  return {
    status: 'READY',
    reason: 'Both image and video prompts pass inspection',
    tone: 'success',
    actionLabel: null,
    actionDestination: null,
    image: imageHealth,
    video: videoHealth,
  };
}

function makeNullFallback(): PromptHealth {
  return {
    status: 'NEEDS_ATTENTION',
    reason: 'Prompt data is unavailable or incomplete',
    tone: 'warning',
    actionLabel: null,
    actionDestination: null,
    image: { status: 'NEEDS_ATTENTION', reason: 'Prompt data is unavailable or incomplete' },
    video: { status: 'NEEDS_ATTENTION', reason: 'Prompt data is unavailable or incomplete' },
  };
}

export const PROMPT_HEALTH_GLYPHS: Record<AggregateHealthStatus, string> = {
  BLOCKED: '✕',
  EMPTY: '○',
  NEEDS_ATTENTION: '⚠',
  READY: '✓',
};

export const PROMPT_HEALTH_LABELS: Record<AggregateHealthStatus, string> = {
  BLOCKED: 'Blocked',
  EMPTY: 'Empty',
  NEEDS_ATTENTION: 'Needs attention',
  READY: 'Ready',
};

export function formatKindHealthReason(health: PromptKindHealth): string {
  return health.reason;
}
