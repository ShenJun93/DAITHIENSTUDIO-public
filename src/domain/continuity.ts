/**
 * Continuity checker (spec §24.5, CONTINUITY-SPEC §3.2).
 *
 * The core operation is a boundary comparison:
 *
 *     shot N   .continuity.outgoing
 *                    ↓  compare
 *     shot N+1 .continuity.incoming
 *
 * Every difference is classified, never merely reported:
 *
 *   intentional-change    the later shot lists the field in `intentionalChanges`
 *   continuity-violation  an identity-critical field changed silently
 *   missing-transition    a soft field changed with no note explaining the cut
 *   unknown               one side has no recorded state — cannot be judged
 *
 * Everything here is derived from stored fields, so each finding points at a
 * value the operator can actually edit. Nothing is inferred from pixels.
 */
import { ESTABLISHING_SHOT_SIZES } from './enums';
import type { ContinuityClass } from './enums';
import type {
  CharacterState,
  Continuity,
  ContinuityFinding,
  EnvironmentState,
  ShotCharacterRef,
  ShotPropRef,
} from './schemas';

export interface ContinuityShot {
  code: string;
  sceneCode: string;
  sceneId: string;
  shotNumber: number;
  shotSize: string;
  characters: ShotCharacterRef[];
  props: ShotPropRef[];
  locationId: string | null;
  locationVersionId: string | null;
  lighting: string;
  dialogue: string;
  status: string;
  importance: 'normal' | 'key';
  continuity: Continuity;
  /** Style snapshot frozen into this shot's latest prompt, if any. */
  lockedStyleVersionId: string | null;
  hasReferenceAsset: boolean;
  hasApprovedKeyframe: boolean;
}

/** Fields whose silent change breaks the illusion — always a violation. */
const IDENTITY_CRITICAL_CHARACTER_FIELDS = ['costume', 'injuries', 'heldProps', 'facing'] as const;
/** Fields that drift plausibly between shots — a missing note, not a lie. */
const SOFT_CHARACTER_FIELDS = ['hair', 'position'] as const;

const IDENTITY_CRITICAL_ENVIRONMENT_FIELDS = ['time', 'lightDirection'] as const;
const SOFT_ENVIRONMENT_FIELDS = ['weather', 'damagedObjects'] as const;

function describe(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? '(none)' : value.join(', ');
  const text = String(value ?? '').trim();
  return text.length === 0 ? '(unset)' : text;
}

function isEmptyValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  const text = String(value ?? '').trim();
  return text.length === 0 || text === 'unspecified';
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = [...(Array.isArray(a) ? a : [])].map(String).sort();
    const right = [...(Array.isArray(b) ? b : [])].map(String).sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

function classify(input: {
  field: string;
  critical: boolean;
  intentional: string[];
  noteProvided: boolean;
  eitherSideEmpty: boolean;
}): ContinuityClass {
  if (input.intentional.some((entry) => entry.toLowerCase() === input.field.toLowerCase())) {
    return 'intentional-change';
  }
  if (input.eitherSideEmpty) return 'unknown';
  if (input.critical) return 'continuity-violation';
  return input.noteProvided ? 'intentional-change' : 'missing-transition';
}

const SEVERITY_BY_CLASS: Record<ContinuityClass, ContinuityFinding['severity']> = {
  'intentional-change': 'info',
  'missing-transition': 'warning',
  'continuity-violation': 'error',
  unknown: 'info',
};

/**
 * Compares two adjacent shots and returns one finding per differing field.
 * Exported separately so a single cut can be inspected in the UI.
 */
export function compareBoundary(previous: ContinuityShot, next: ContinuityShot): ContinuityFinding[] {
  const findings: ContinuityFinding[] = [];
  const intentional = next.continuity.intentionalChanges;
  const noteProvided =
    next.continuity.incoming.note.trim().length > 0 || previous.continuity.outgoing.note.trim().length > 0;

  const emit = (
    rule: string,
    field: string,
    before: unknown,
    after: unknown,
    critical: boolean,
    message: string,
  ): void => {
    const classification = classify({
      field,
      critical,
      intentional,
      noteProvided,
      eitherSideEmpty: isEmptyValue(before) || isEmptyValue(after),
    });
    findings.push({
      rule,
      severity: SEVERITY_BY_CLASS[classification],
      classification,
      message,
      field,
      expected: describe(before),
      actual: describe(after),
      sceneCode: next.sceneCode,
      shotCodes: [previous.code, next.code],
    });
  };

  // --- Character state ---------------------------------------------------
  const outgoing = previous.continuity.outgoing.characters;
  const incoming = next.continuity.incoming.characters;
  const sharedCharacterIds = Object.keys(incoming).filter((id) => id in outgoing);

  for (const characterId of sharedCharacterIds) {
    const before = outgoing[characterId] as CharacterState;
    const after = incoming[characterId] as CharacterState;

    for (const field of IDENTITY_CRITICAL_CHARACTER_FIELDS) {
      if (sameValue(before[field], after[field])) continue;
      emit(
        `character-${field}-change`,
        `${characterId}.${field}`,
        before[field],
        after[field],
        true,
        `${characterId} ${field} changes from "${describe(before[field])}" to "${describe(after[field])}" between ${previous.code} and ${next.code}.`,
      );
    }

    for (const field of SOFT_CHARACTER_FIELDS) {
      if (sameValue(before[field], after[field])) continue;
      emit(
        `character-${field}-change`,
        `${characterId}.${field}`,
        before[field],
        after[field],
        false,
        `${characterId} ${field} changes between ${previous.code} and ${next.code} with no transition noted.`,
      );
    }
  }

  // Characters that leave without any exit written down.
  for (const characterId of Object.keys(outgoing)) {
    if (characterId in incoming) continue;
    if (!next.characters.some((ref) => ref.characterId === characterId)) continue;
    findings.push({
      rule: 'character-state-dropped',
      severity: 'warning',
      classification: 'unknown',
      message: `${characterId} appears in ${next.code} but its incoming state was not carried over from ${previous.code}.`,
      field: `${characterId}.state`,
      expected: 'carried-over state',
      actual: '(missing)',
      sceneCode: next.sceneCode,
      shotCodes: [previous.code, next.code],
    });
  }

  // --- Screen direction (the 180-degree rule) ----------------------------
  for (const nextRef of next.characters) {
    const previousRef = previous.characters.find((ref) => ref.characterId === nextRef.characterId);
    if (!previousRef) continue;
    const flipped =
      (previousRef.facing === 'screen-left' && nextRef.facing === 'screen-right') ||
      (previousRef.facing === 'screen-right' && nextRef.facing === 'screen-left');
    if (!flipped) continue;
    emit(
      'screen-direction-flip',
      `${nextRef.characterId}.facing`,
      previousRef.facing,
      nextRef.facing,
      true,
      `${nextRef.characterId} flips screen direction (${previousRef.facing} → ${nextRef.facing}) across the cut ${previous.code} → ${next.code}. This breaks the 180-degree rule unless it is a deliberate reverse.`,
    );
  }

  // --- Environment state -------------------------------------------------
  const beforeEnv = previous.continuity.outgoing.environment;
  const afterEnv = next.continuity.incoming.environment;

  for (const field of IDENTITY_CRITICAL_ENVIRONMENT_FIELDS) {
    if (sameValue(beforeEnv[field], afterEnv[field])) continue;
    emit(
      `environment-${field}-change`,
      `environment.${field}`,
      beforeEnv[field],
      afterEnv[field],
      true,
      `Environment ${field} changes from "${describe(beforeEnv[field])}" to "${describe(afterEnv[field])}" across ${previous.code} → ${next.code}.`,
    );
  }

  for (const field of SOFT_ENVIRONMENT_FIELDS) {
    const beforeValue = beforeEnv[field as keyof EnvironmentState];
    const afterValue = afterEnv[field as keyof EnvironmentState];
    if (sameValue(beforeValue, afterValue)) continue;
    emit(
      `environment-${field}-change`,
      `environment.${field}`,
      beforeValue,
      afterValue,
      false,
      `Environment ${field} changes across ${previous.code} → ${next.code} with no transition noted.`,
    );
  }

  // --- Held props --------------------------------------------------------
  for (const propRef of previous.props) {
    const stillHeld = next.props.find((candidate) => candidate.propId === propRef.propId);
    if (stillHeld) {
      if (propRef.heldBy !== stillHeld.heldBy) {
        emit(
          'prop-handoff',
          `${propRef.propId}.heldBy`,
          propRef.heldBy,
          stillHeld.heldBy,
          true,
          `Prop ${propRef.propId} changes hands (${describe(propRef.heldBy)} → ${describe(stillHeld.heldBy)}) between ${previous.code} and ${next.code}.`,
        );
      }
      if (propRef.state !== stillHeld.state) {
        emit(
          'prop-state-change',
          `${propRef.propId}.state`,
          propRef.state,
          stillHeld.state,
          false,
          `Prop ${propRef.propId} state changes ("${propRef.state}" → "${stillHeld.state}") between ${previous.code} and ${next.code}.`,
        );
      }
    }
  }

  return findings;
}

export function checkContinuity(shots: ContinuityShot[]): ContinuityFinding[] {
  const findings: ContinuityFinding[] = [];
  const ordered = [...shots].sort((a, b) =>
    a.sceneCode === b.sceneCode ? a.shotNumber - b.shotNumber : a.sceneCode.localeCompare(b.sceneCode),
  );

  const byScene = new Map<string, ContinuityShot[]>();
  for (const shot of ordered) {
    const list = byScene.get(shot.sceneId) ?? [];
    list.push(shot);
    byScene.set(shot.sceneId, list);
  }

  for (const [, sceneShots] of byScene) {
    const sceneCode = sceneShots[0]?.sceneCode ?? '';

    // Establishing coverage.
    const first = sceneShots[0];
    if (first && !ESTABLISHING_SHOT_SIZES.includes(first.shotSize as (typeof ESTABLISHING_SHOT_SIZES)[number])) {
      findings.push({
        rule: 'missing-establishing-shot',
        severity: 'warning',
        classification: 'missing-transition',
        message: `Scene ${sceneCode} opens on "${first.shotSize}" without an establishing shot.`,
        field: 'shotSize',
        expected: ESTABLISHING_SHOT_SIZES.join(' | '),
        actual: first.shotSize,
        sceneCode,
        shotCodes: [first.code],
      });
    }

    // Boundary comparisons.
    for (let i = 1; i < sceneShots.length; i += 1) {
      findings.push(...compareBoundary(sceneShots[i - 1]!, sceneShots[i]!));

      const previous = sceneShots[i - 1]!;
      const shot = sceneShots[i]!;
      if (previous.locationId && shot.locationId && previous.locationId !== shot.locationId) {
        findings.push({
          rule: 'location-break',
          severity: 'error',
          classification: 'continuity-violation',
          message: `Scene ${sceneCode} changes location between ${previous.code} and ${shot.code}. Split it into two scenes.`,
          field: 'locationId',
          expected: previous.locationId,
          actual: shot.locationId,
          sceneCode,
          shotCodes: [previous.code, shot.code],
        });
      }
    }

    // Prop appears → disappears → reappears inside one scene.
    const propTimeline = new Map<string, number[]>();
    sceneShots.forEach((shot, index) => {
      for (const propRef of shot.props) {
        const seen = propTimeline.get(propRef.propId) ?? [];
        seen.push(index);
        propTimeline.set(propRef.propId, seen);
      }
    });
    for (const [propId, indices] of propTimeline) {
      if (indices.length < 2) continue;
      const firstIndex = indices[0]!;
      const lastIndex = indices[indices.length - 1]!;
      if (indices.length >= lastIndex - firstIndex + 1) continue;
      const gapShots = sceneShots
        .slice(firstIndex, lastIndex + 1)
        .filter((shot) => !shot.props.some((ref) => ref.propId === propId))
        .map((shot) => shot.code);
      findings.push({
        rule: 'prop-continuity-gap',
        severity: 'warning',
        classification: 'missing-transition',
        message: `Prop ${propId} is present at the start and end of scene ${sceneCode} but missing from ${gapShots.join(', ')}.`,
        field: `${propId}.presence`,
        expected: 'present throughout',
        actual: `missing in ${gapShots.length} shot(s)`,
        sceneCode,
        shotCodes: gapShots,
      });
    }

    const speaking = sceneShots.filter((s) => s.dialogue.trim().length > 0);
    const reaction = sceneShots.filter((s) => s.dialogue.trim().length === 0 && s.characters.length > 0);
    if (speaking.length >= 2 && reaction.length === 0) {
      findings.push({
        rule: 'missing-reaction-shot',
        severity: 'info',
        classification: 'missing-transition',
        message: `Scene ${sceneCode} has ${speaking.length} speaking shots and no reaction shot.`,
        field: 'coverage',
        expected: 'at least one silent reaction shot',
        actual: 'none',
        sceneCode,
        shotCodes: speaking.map((s) => s.code),
      });
    }
  }

  // --- Cross-scene version drift ----------------------------------------
  const characterVersions = new Map<string, Map<string, string[]>>();
  for (const shot of ordered) {
    for (const ref of shot.characters) {
      if (!ref.versionId) continue;
      const perCharacter = characterVersions.get(ref.characterId) ?? new Map<string, string[]>();
      const codes = perCharacter.get(ref.versionId) ?? [];
      codes.push(shot.code);
      perCharacter.set(ref.versionId, codes);
      characterVersions.set(ref.characterId, perCharacter);
    }
  }
  for (const [characterId, versions] of characterVersions) {
    if (versions.size <= 1) continue;
    const summary = [...versions.entries()].map(([version, codes]) => `${version} → ${codes.join(', ')}`).join(' | ');
    findings.push({
      rule: 'character-version-drift',
      severity: 'error',
      classification: 'continuity-violation',
      message: `Character ${characterId} is pinned to different bible snapshots across shots: ${summary}.`,
      field: `${characterId}.versionId`,
      expected: 'one snapshot per episode',
      actual: [...versions.keys()].join(', '),
      sceneCode: '',
      shotCodes: [...versions.values()].flat(),
    });
  }

  const styleVersions = new Set(
    ordered.map((shot) => shot.lockedStyleVersionId).filter((value): value is string => Boolean(value)),
  );
  if (styleVersions.size > 1) {
    findings.push({
      rule: 'style-version-drift',
      severity: 'warning',
      classification: 'continuity-violation',
      message: `Shots are pinned to ${styleVersions.size} different Style Bible snapshots (${[...styleVersions].join(', ')}).`,
      field: 'style.versionId',
      expected: 'one style snapshot',
      actual: [...styleVersions].join(', '),
      sceneCode: '',
      shotCodes: ordered.map((s) => s.code),
    });
  }

  // --- Render readiness --------------------------------------------------
  for (const shot of ordered) {
    const unpinned = shot.characters.filter((ref) => !ref.versionId);
    if (unpinned.length > 0) {
      findings.push({
        rule: 'missing-character-lock',
        severity: 'error',
        classification: 'continuity-violation',
        message: `${shot.code} references ${unpinned.map((r) => r.characterId).join(', ')} without a pinned bible snapshot.`,
        field: 'characters[].versionId',
        expected: 'CHARxxx_Vn',
        actual: '(empty)',
        sceneCode: shot.sceneCode,
        shotCodes: [shot.code],
      });
    }
    if (shot.locationId && !shot.locationVersionId) {
      findings.push({
        rule: 'missing-location-lock',
        severity: 'warning',
        classification: 'continuity-violation',
        message: `${shot.code} has a location but no pinned location snapshot.`,
        field: 'location.versionId',
        expected: 'LOCxxx_Vn',
        actual: '(empty)',
        sceneCode: shot.sceneCode,
        shotCodes: [shot.code],
      });
    }
    if (shot.importance === 'key' && !shot.hasApprovedKeyframe) {
      // Warning, not error: this is a gate on *video* generation, enforced in
      // generationService. Reporting it as blocking here would also block the
      // keyframe image the operator needs in order to approve anything.
      findings.push({
        rule: 'key-shot-without-approved-keyframe',
        severity: 'warning',
        classification: 'continuity-violation',
        message: `${shot.code} is a key shot without an approved keyframe. Video generation will stay blocked until a keyframe is approved.`,
        field: 'approval',
        expected: 'approved keyframe',
        actual: 'none',
        sceneCode: shot.sceneCode,
        shotCodes: [shot.code],
      });
    }
    if (!shot.hasReferenceAsset && shot.status === 'generating') {
      findings.push({
        rule: 'generating-without-reference',
        severity: 'warning',
        classification: 'missing-transition',
        message: `${shot.code} is generating without any reference asset — expect identity drift.`,
        field: 'referenceAssets',
        expected: 'at least one reference',
        actual: 'none',
        sceneCode: shot.sceneCode,
        shotCodes: [shot.code],
      });
    }
  }

  return findings;
}

export function continuitySummary(findings: ContinuityFinding[]): {
  errors: number;
  warnings: number;
  infos: number;
  blocked: boolean;
  byClass: Record<ContinuityClass, number>;
} {
  const byClass: Record<ContinuityClass, number> = {
    'intentional-change': 0,
    'missing-transition': 0,
    'continuity-violation': 0,
    unknown: 0,
  };
  for (const finding of findings) byClass[finding.classification] += 1;

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
  return { errors, warnings, infos, blocked: errors > 0, byClass };
}

/** Findings that must block a paid generation. */
export function blockingFindings(findings: ContinuityFinding[]): ContinuityFinding[] {
  return findings.filter((finding) => finding.severity === 'error');
}
