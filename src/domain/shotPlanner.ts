/**
 * Shot planning: turns a parsed scene into shot coverage, and audits existing
 * coverage for the risks listed in the spec (§18, §24.3).
 *
 * Coverage grammar used here is deliberately conservative — establishing, then
 * action in medium, then reaction in close, then inserts for props. It is a
 * starting point a human edits, not a final board.
 */
import { COMPLEX_CAMERA_MOVEMENT_TYPES, ESTABLISHING_SHOT_SIZES } from './enums';
import type { CameraAngle, CameraMovementType, Facing, MovementSpeed, ScreenPosition, ShotSize } from './enums';
import type { ParsedScene } from './scriptParser';

export interface PlannedShotCharacter {
  characterName: string;
  screenPosition: ScreenPosition;
  facing: Facing;
  action: string;
  emotion: string;
}

export interface PlannedShot {
  shotNumber: number;
  title: string;
  description: string;
  shotSize: ShotSize;
  cameraAngle: CameraAngle;
  cameraMovement: { type: CameraMovementType; speed: MovementSpeed };
  lens: string;
  durationSeconds: number;
  characters: PlannedShotCharacter[];
  dialogue: string;
  emotion: string;
  incomingNote: string;
  outgoingNote: string;
  importance: 'normal' | 'key';
}

export interface SplitRecommendation {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

const COMBAT_WORDS = /\b(đánh|chiến đấu|combat|fight|kiếm|sword|đấm|punch|nổ|explosion|truy sát|rượt)\b/i;
const HAND_WORDS = /\b(cầm|nắm|trao|đưa tay|handshake|grab|hold|rót|pour|mở nắp|bấm)\b/i;
const ENV_CHANGE_WORDS = /\b(biến thành|morph|sụp|collapse|bốc cháy|catch fire|tan biến|dissolve|đổi cảnh)\b/i;

const LONG_DIALOGUE_CHARS = 140;
const MAX_COMFORTABLE_DURATION = 8;

/** Rules from spec §18 — when a scene must be broken into shorter shots. */
export function recommendSplits(input: {
  characterCount: number;
  dialogue: string;
  action: string;
  propCount: number;
  durationSeconds: number;
  cameraMovement: { type: string; speed: string };
  importance: 'normal' | 'key';
}): SplitRecommendation[] {
  const out: SplitRecommendation[] = [];
  const text = `${input.action} ${input.dialogue}`;

  if (input.characterCount > 2) {
    out.push({
      rule: 'many-characters',
      severity: 'warning',
      message: `${input.characterCount} characters in one shot — identity drift is very likely. Split into singles plus a two-shot.`,
    });
  }
  if (COMBAT_WORDS.test(text)) {
    out.push({
      rule: 'combat',
      severity: 'warning',
      message: 'Combat action detected. Use short impact shots (1–2s) instead of one long take.',
    });
  }
  if (HAND_WORDS.test(text)) {
    out.push({
      rule: 'hand-interaction',
      severity: 'warning',
      message: 'Hand interaction detected — generative video fails hands at wide sizes. Add an insert shot.',
    });
  }
  if (input.propCount > 2) {
    out.push({
      rule: 'complex-props',
      severity: 'info',
      message: `${input.propCount} props tracked in one shot. Consider inserts so each prop stays continuous.`,
    });
  }
  if (input.dialogue.length > LONG_DIALOGUE_CHARS) {
    out.push({
      rule: 'long-dialogue',
      severity: 'warning',
      message: `Dialogue is ${input.dialogue.length} characters. Break across shots and cut to reactions.`,
    });
  }
  const movementType = input.cameraMovement.type;
  const isComplexMove = COMPLEX_CAMERA_MOVEMENT_TYPES.includes(
    movementType as (typeof COMPLEX_CAMERA_MOVEMENT_TYPES)[number],
  );
  if (isComplexMove || input.cameraMovement.speed === 'fast') {
    out.push({
      rule: 'large-camera-change',
      severity: 'info',
      message: `"${input.cameraMovement.speed} ${movementType}" is a large camera change; keep the shot under 5s or generate it as two shots.`,
    });
  }
  if (ENV_CHANGE_WORDS.test(text)) {
    out.push({
      rule: 'environment-transformation',
      severity: 'warning',
      message: 'Environment transformation detected. Generate before/after keyframes and interpolate.',
    });
  }
  if (input.durationSeconds > MAX_COMFORTABLE_DURATION) {
    out.push({
      rule: 'shot-too-long',
      severity: 'warning',
      message: `${input.durationSeconds}s exceeds the ${MAX_COMFORTABLE_DURATION}s comfort limit for a single generation.`,
    });
  }
  if (input.importance === 'key' && input.durationSeconds > 5) {
    out.push({
      rule: 'key-shot-length',
      severity: 'info',
      message: 'Key shot longer than 5s — plan first/last keyframes and human approval before video generation.',
    });
  }

  return out;
}

/** Builds default coverage for a parsed scene. */
export function planSceneCoverage(scene: ParsedScene): PlannedShot[] {
  const shots: PlannedShot[] = [];
  const allNames = scene.characterNames;
  let shotNumber = 1;

  const push = (shot: Omit<PlannedShot, 'shotNumber'>): void => {
    shots.push({ ...shot, shotNumber });
    shotNumber += 1;
  };

  /** Two people face each other; anyone else faces camera. Keeps eyelines legal. */
  const facingFor = (name: string): Facing => {
    const index = allNames.indexOf(name);
    if (allNames.length < 2 || index < 0) return 'to-camera';
    return index % 2 === 0 ? 'screen-right' : 'screen-left';
  };

  const positionFor = (name: string): ScreenPosition => {
    const index = allNames.indexOf(name);
    if (allNames.length < 2 || index < 0) return 'center';
    return index % 2 === 0 ? 'center-left' : 'center-right';
  };

  const cast = (names: string[], action: string, emotion: string): PlannedShotCharacter[] =>
    names.map((characterName) => ({
      characterName,
      screenPosition: positionFor(characterName),
      facing: facingFor(characterName),
      action,
      emotion,
    }));

  // 1. Establishing shot — every scene needs one so the audience is oriented.
  push({
    title: `Establishing — ${scene.locationName}`,
    description: scene.summary || scene.action.slice(0, 240) || `Establish ${scene.locationName}.`,
    shotSize: 'wide',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'push-in', speed: 'slow' },
    lens: '24mm',
    durationSeconds: 4,
    characters: cast(allNames.slice(0, 2), 'in position', scene.timeOfDay === 'night' ? 'wary' : 'neutral'),
    dialogue: '',
    emotion: scene.timeOfDay === 'night' ? 'mysterious' : 'neutral',
    incomingNote: '',
    outgoingNote: `Scene ${scene.number} established: ${scene.locationName}, ${scene.timeOfDay}.`,
    importance: 'normal',
  });

  // 2. Action beat.
  if (scene.action.trim()) {
    push({
      title: 'Action beat',
      description: scene.action.slice(0, 400),
      shotSize: allNames.length > 1 ? 'two-shot' : 'medium',
      cameraAngle: 'eye-level',
      cameraMovement: { type: 'static', speed: 'static' },
      lens: '35mm',
      durationSeconds: 5,
      characters: cast(allNames.slice(0, 2), scene.action.slice(0, 120), scene.dialogue[0]?.emotion ?? ''),
      dialogue: '',
      emotion: scene.dialogue[0]?.emotion ?? '',
      incomingNote: `Continues from the ${scene.locationName} establishing shot.`,
      outgoingNote: 'Characters in position for dialogue.',
      importance: 'normal',
    });
  }

  // 3. One shot per dialogue line, alternating single / reaction.
  scene.dialogue.forEach((line, index) => {
    const isReaction = index > 0 && index % 2 === 1;
    push({
      title: `${line.characterName} — ${isReaction ? 'reaction + line' : 'line'}`,
      description: `${line.characterName} says: "${line.text}"`,
      shotSize: isReaction ? 'medium-close' : 'close',
      cameraAngle: isReaction ? 'over-shoulder' : 'eye-level',
      cameraMovement: { type: 'static', speed: 'static' },
      lens: '50mm',
      durationSeconds: Math.max(2, Math.round(line.text.split(/\s+/).filter(Boolean).length / 2.6)),
      characters: cast([line.characterName], 'speaking', line.emotion),
      dialogue: line.text,
      emotion: line.emotion,
      incomingNote:
        index === 0
          ? 'Dialogue starts.'
          : `Answers ${scene.dialogue[index - 1]?.characterName ?? 'the previous line'}.`,
      outgoingNote: index === scene.dialogue.length - 1 ? 'Dialogue ends.' : 'Hold eyeline for the reply.',
      importance: index === 0 ? 'key' : 'normal',
    });
  });

  // 4. Closing beat so the editor has an out-point.
  push({
    title: 'Scene out',
    description: `Close scene ${scene.number}: hold on ${allNames[0] ?? 'the environment'} then transition.`,
    shotSize: allNames.length > 0 ? 'medium' : 'wide',
    cameraAngle: 'eye-level',
    cameraMovement: { type: 'pull-out', speed: 'slow' },
    lens: '35mm',
    durationSeconds: 3,
    characters: cast(allNames.slice(0, 1), 'holds the beat', ''),
    dialogue: '',
    emotion: '',
    incomingNote: 'After the last line.',
    outgoingNote: `Ready to cut to scene ${scene.number + 1}.`,
    importance: 'normal',
  });

  return shots;
}

/** Coverage audit for shots that already exist. */
export function auditCoverage(
  shots: { code: string; shotSize: string; dialogue: string; characterCount: number; durationSeconds: number }[],
): SplitRecommendation[] {
  const findings: SplitRecommendation[] = [];
  if (shots.length === 0) {
    return [{ rule: 'no-coverage', severity: 'error', message: 'Scene has no shots.' }];
  }

  const first = shots[0]!;
  if (!ESTABLISHING_SHOT_SIZES.includes(first.shotSize as (typeof ESTABLISHING_SHOT_SIZES)[number])) {
    findings.push({
      rule: 'missing-establishing-shot',
      severity: 'warning',
      message: `Scene opens on ${first.shotSize} (${first.code}) — no establishing shot orients the audience.`,
    });
  }

  const speaking = shots.filter((s) => s.dialogue.trim().length > 0);
  const listening = shots.filter((s) => s.dialogue.trim().length === 0 && s.characterCount > 0);
  if (speaking.length >= 2 && listening.length === 0) {
    findings.push({
      rule: 'missing-reaction-shot',
      severity: 'warning',
      message: 'Scene has dialogue but no silent reaction shot — the edit will feel like a talking-head loop.',
    });
  }

  const closeUps = shots.filter((s) => s.shotSize.includes('close')).length;
  if (closeUps === shots.length && shots.length > 2) {
    findings.push({
      rule: 'no-size-variety',
      severity: 'info',
      message: 'Every shot is a close-up. Vary shot size to keep the scene readable.',
    });
  }

  const total = shots.reduce((sum, s) => sum + s.durationSeconds, 0);
  if (total > 0 && shots.length / total < 0.08) {
    findings.push({
      rule: 'few-cuts',
      severity: 'info',
      message: `${shots.length} shots across ${total}s — long average shot length for AI generation.`,
    });
  }

  return findings;
}
