/**
 * Deterministic prompt compiler.
 *
 * The same shot + same bible versions always produce the same prompt string.
 * That determinism is what makes prompt versioning, A/B comparison and
 * continuity debugging possible.
 */
import { promptBlocksSchema, type LockRefs, type PromptBlocks } from '../schemas';
import {
  characterLockText,
  collectNegatives,
  locationLockText,
  propLockText,
  styleLockText,
  type CharacterSnapshot,
  type LocationSnapshot,
  type PropSnapshot,
  type StyleSnapshot,
} from './locks';

/** Canonical block order. Providers read prompts left to right; identity first. */
export const BLOCK_ORDER = [
  'subject',
  'characterIdentity',
  'action',
  'expression',
  'environment',
  'composition',
  'shotSize',
  'cameraAngle',
  'lens',
  'cameraMovement',
  'lighting',
  'color',
  'material',
  'visualStyle',
  'motion',
  'physics',
  'atmosphere',
  'continuity',
  'technicalSettings',
] as const satisfies readonly (keyof PromptBlocks)[];

export const BLOCK_LABELS: Record<keyof PromptBlocks, string> = {
  subject: 'Subject',
  characterIdentity: 'Character identity',
  action: 'Action',
  expression: 'Expression',
  environment: 'Environment',
  composition: 'Composition',
  shotSize: 'Shot size',
  cameraAngle: 'Camera angle',
  lens: 'Lens',
  cameraMovement: 'Camera movement',
  lighting: 'Lighting',
  color: 'Color',
  material: 'Material',
  visualStyle: 'Visual style',
  motion: 'Motion',
  physics: 'Physics',
  atmosphere: 'Atmosphere',
  continuity: 'Continuity',
  technicalSettings: 'Technical settings',
  negativePrompt: 'Negative prompt',
};

export interface CompileContext {
  kind: 'image' | 'video';
  characters: CharacterSnapshot[];
  style: StyleSnapshot | null;
  location: LocationSnapshot | null;
  props: PropSnapshot[];
  applyCharacterLock: boolean;
  applyStyleLock: boolean;
  applyLocationLock: boolean;
}

export interface CompileResult {
  blocks: PromptBlocks;
  compiled: string;
  negative: string;
  lockRefs: LockRefs;
  appliedLocks: { character: boolean; style: boolean; location: boolean; props: boolean };
}

export function emptyBlocks(): PromptBlocks {
  return promptBlocksSchema.parse({});
}

/**
 * Injects locks into the block set. Lock text always *replaces* the
 * corresponding auto block so a human edit elsewhere can never drop identity.
 */
export function applyLocks(input: Partial<PromptBlocks>, context: CompileContext): CompileResult {
  const blocks = promptBlocksSchema.parse({ ...input });

  const lockedCharacters = context.applyCharacterLock
    ? context.characters.filter((character) => character.lockEnabled !== false)
    : [];

  const characterLock = lockedCharacters.map(characterLockText).join(' || ');
  if (characterLock) {
    blocks.characterIdentity = characterLock;
  }

  if (context.applyStyleLock && context.style) {
    blocks.visualStyle = styleLockText(context.style);
  }

  if (context.applyLocationLock && context.location) {
    const locationText = locationLockText(context.location);
    blocks.environment = blocks.environment.trim()
      ? `${locationText} — ${blocks.environment.trim()}`
      : locationText;
  }

  if (context.props.length > 0) {
    const propText = context.props.map(propLockText).join('; ');
    blocks.material = blocks.material.trim() ? `${blocks.material.trim()}; ${propText}` : propText;
  }

  const negative = collectNegatives({
    characters: lockedCharacters,
    style: context.applyStyleLock ? context.style : null,
    location: context.applyLocationLock ? context.location : null,
    extra: blocks.negativePrompt,
  });
  blocks.negativePrompt = negative;

  const lockRefs: LockRefs = {
    characters: lockedCharacters.map((c) => ({ id: c.id, code: c.code, version: c.version })),
    style: context.applyStyleLock && context.style
      ? { id: context.style.id, code: context.style.code, version: context.style.version }
      : null,
    location: context.applyLocationLock && context.location
      ? { id: context.location.id, code: context.location.code, version: context.location.version }
      : null,
    props: context.props.map((p) => ({ id: p.id, code: p.code, version: p.version })),
  };

  return {
    blocks,
    compiled: compileBlocks(blocks, context.kind),
    negative,
    lockRefs,
    appliedLocks: {
      character: lockedCharacters.length > 0,
      style: Boolean(lockRefs.style),
      location: Boolean(lockRefs.location),
      props: context.props.length > 0,
    },
  };
}

/** Renders blocks into a provider-agnostic prompt string. */
export function compileBlocks(blocks: PromptBlocks, kind: 'image' | 'video'): string {
  const order = kind === 'image'
    ? BLOCK_ORDER.filter((key) => key !== 'motion' && key !== 'cameraMovement' && key !== 'physics')
    : BLOCK_ORDER;

  const segments: string[] = [];
  for (const key of order) {
    const value = blocks[key]?.trim();
    if (!value) continue;
    segments.push(`${BLOCK_LABELS[key]}: ${value}`);
  }
  return segments.join('\n');
}

/** Single-line variant for providers that dislike newlines. */
export function flattenPrompt(compiled: string): string {
  return compiled
    .split('\n')
    .map((line) => line.replace(/^[A-Z][A-Za-z ]*:\s*/, ''))
    .filter(Boolean)
    .join(', ');
}
