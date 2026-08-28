/**
 * Prompt linter. Runs before a generation is enqueued so the operator does not
 * pay a provider to find out the prompt contradicted itself.
 *
 * `error` issues block enqueueing (unless explicitly overridden), `warning`
 * and `info` are advisory.
 */
import type { LintIssue, LintResult, PromptBlocks } from '../schemas';

const MAX_SOFT_LENGTH = 1400;
const MAX_HARD_LENGTH = 4000;

/**
 * Named studios, franchises and living artists must not be used as a style
 * identifier (spec §4.2 / §13). Describe visual attributes instead.
 *
 * Matched with word boundaries and, where a studio name is also an ordinary
 * craft term, with the disambiguating context required. "soft global
 * illumination" is a lighting description; "Illumination Entertainment" is a
 * studio — only the second is a violation.
 */
const RESTRICTED_STYLE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: 'Pixar', pattern: /\bpixar\b/i },
  { label: 'Disney', pattern: /\bdisney\b/i },
  { label: 'DreamWorks', pattern: /\bdreamworks\b/i },
  { label: 'Studio Ghibli', pattern: /\bghibli\b/i },
  { label: 'Illumination Entertainment', pattern: /\billumination\s+(entertainment|studios?)\b/i },
  { label: 'Marvel', pattern: /\bmarvel(\s+(studios?|comics))\b/i },
  { label: 'DC Comics', pattern: /\bdc\s+comics\b/i },
  { label: 'Netflix original', pattern: /\bnetflix\s+original\b/i },
  { label: 'Greg Rutkowski', pattern: /\bgreg\s+rutkowski\b/i },
  { label: 'Artgerm', pattern: /\bartgerm\b/i },
  { label: 'Makoto Shinkai', pattern: /\bmakoto\s+shinkai\b/i },
  { label: 'Wes Anderson', pattern: /\bwes\s+anderson\b/i },
  { label: 'Studio Trigger', pattern: /\bstudio\s+trigger\b/i },
  { label: 'Kyoto Animation', pattern: /\bkyoto\s+animation\b|\bkyoani\b/i },
];

const CONTRADICTIONS: [RegExp, RegExp, string][] = [
  [/\bnight\b|\bmidnight\b|\bđêm\b/i, /\bbright daylight\b|\bnoon sun\b|\bban ngày\b/i, 'time of day'],
  [/\bclose-?up\b|\bextreme close\b/i, /\bwide shot\b|\bestablishing\b|\bextreme wide\b/i, 'shot size'],
  [/\bstatic camera\b|\blocked-?off\b/i, /\bhandheld\b|\bwhip pan\b|\bfast dolly\b/i, 'camera movement'],
  [/\bphotorealistic\b|\bphoto-?real\b/i, /\bcel-?shad(ed|ing)\b|\bflat 2d\b|\bmanga panel\b/i, 'rendering style'],
  [/\bsilhouette\b/i, /\bvisible facial detail\b|\bdetailed face\b/i, 'lighting vs detail'],
  [/\brain\b|\bmưa\b/i, /\bdry ground\b|\bclear sky\b/i, 'weather'],
  [/\bempty\b|\bdeserted\b/i, /\bcrowd(ed)?\b|\bmany people\b/i, 'population'],
];

export interface LintContext {
  kind: 'image' | 'video';
  hasCharactersInShot: boolean;
  characterLockApplied: boolean;
  styleLockApplied: boolean;
  locationLockApplied: boolean;
  shotHasLocation: boolean;
  requiresContinuity: boolean;
}

export function lintPrompt(blocks: PromptBlocks, compiled: string, context: LintContext): LintResult {
  const issues: LintIssue[] = [];
  const text = compiled.toLowerCase();
  const push = (
    rule: string,
    severity: LintIssue['severity'],
    message: string,
    hint = '',
  ): void => {
    issues.push({ rule, severity, message, hint });
  };

  if (!blocks.subject.trim() && !blocks.characterIdentity.trim()) {
    push('subject-missing', 'error', 'Prompt has no subject and no character identity.', 'Fill the Subject block or attach a character to the shot.');
  }

  if (!blocks.action.trim()) {
    push('action-missing', 'error', 'Prompt has no action.', 'Describe what happens in this shot, not just what it looks like.');
  }

  const cameraDescribed = [blocks.shotSize, blocks.cameraAngle, blocks.composition].some((b) => b.trim());
  if (!cameraDescribed) {
    push('camera-missing', 'error', 'Prompt has no camera information (shot size / angle / composition).', 'Shot size and angle come from the shot record — regenerate the prompt from the shot.');
  }

  if (context.kind === 'video' && !blocks.cameraMovement.trim() && !blocks.motion.trim()) {
    push('motion-missing', 'error', 'Video prompt describes no motion and no camera movement.', 'A video prompt without motion produces a drifting still.');
  }

  if (context.hasCharactersInShot && !context.characterLockApplied) {
    push('character-lock-missing', 'error', 'Shot has characters but Character Lock was not applied.', 'Enable Character Lock so identity traits are injected from the bible snapshot.');
  }

  if (!context.styleLockApplied) {
    push('style-lock-missing', 'warning', 'No Style Lock applied — style will drift between shots.', 'Select a Style Bible for the project.');
  }

  if (context.shotHasLocation && !context.locationLockApplied) {
    push('location-lock-missing', 'warning', 'Shot has a location but Location Lock was not applied.', 'Location Lock keeps architecture and lighting continuous.');
  }

  if (context.requiresContinuity && !blocks.continuity.trim()) {
    push('continuity-missing', 'warning', 'Shot declares continuity requirements but the prompt has no continuity block.', 'Carry the previous shot state into the Continuity block.');
  }

  if (!blocks.negativePrompt.trim()) {
    push('negative-missing', 'warning', 'No negative prompt.', 'Add at least anatomy and text artefacts to the negative prompt.');
  }

  if (compiled.length > MAX_HARD_LENGTH) {
    push('prompt-too-long', 'error', `Prompt is ${compiled.length} characters (hard limit ${MAX_HARD_LENGTH}).`, 'Move detail into references instead of prose.');
  } else if (compiled.length > MAX_SOFT_LENGTH) {
    push('prompt-long', 'warning', `Prompt is ${compiled.length} characters; providers start ignoring tail tokens past ~${MAX_SOFT_LENGTH}.`, 'Trim atmosphere and technical prose.');
  }

  for (const [a, b, label] of CONTRADICTIONS) {
    if (a.test(compiled) && b.test(compiled)) {
      push('contradiction', 'error', `Contradictory ${label} instructions in the same prompt.`, 'Keep one of the two descriptions.');
    }
  }

  for (const { label, pattern } of RESTRICTED_STYLE_PATTERNS) {
    if (pattern.test(compiled)) {
      push(
        'restricted-style-reference',
        'error',
        `Prompt names a protected studio/artist style ("${label}").`,
        'Describe visual attributes instead: stylized cinematic 3D, soft global illumination, rounded forms, expressive facial acting.',
      );
    }
  }

  const words = text.match(/[a-zà-ỹ]{4,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const repeated = [...counts.entries()].filter(([, n]) => n >= 5).map(([w]) => w);
  if (repeated.length > 0) {
    push('repetition', 'info', `Repeated tokens weaken the prompt: ${repeated.slice(0, 5).join(', ')}.`);
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const score = Math.max(0, 100 - errors * 20 - warnings * 7);

  return { ok: errors === 0, score, issues, characterCount: compiled.length };
}

export function blockingIssues(result: LintResult): LintIssue[] {
  return result.issues.filter((issue) => issue.severity === 'error');
}
