/**
 * Locks turn a Bible *snapshot* into prompt text.
 *
 * This is what makes a Character Bible more than a document: the moment a
 * prompt is compiled, the character's immutable identity traits, costume,
 * palette and forbidden changes are injected verbatim, together with the
 * concrete version number that was used. A later edit to the bible creates a
 * new version and never rewrites a prompt that already shipped.
 */
import type { CharacterInput, LocationInput, PropInput, StyleInput } from '../schemas';

export interface CharacterSnapshot extends CharacterInput {
  id: string;
  code: string;
  version: number;
}

export interface LocationSnapshot extends LocationInput {
  id: string;
  code: string;
  version: number;
}

export interface PropSnapshot extends PropInput {
  id: string;
  code: string;
  version: number;
}

export interface StyleSnapshot extends StyleInput {
  id: string;
  code: string;
  version: number;
}

function joinParts(parts: (string | undefined)[], separator = ', '): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join(separator);
}

/** Identity text that must appear in every prompt featuring this character. */
export function characterLockText(character: CharacterSnapshot): string {
  const identity = character.identity ?? {};
  const variable = character.variable ?? {};
  const token = character.promptToken.trim() || character.name;

  const face = joinParts([
    identity.faceShape,
    identity.skinTone ? `${identity.skinTone} skin` : undefined,
    identity.hair ? `${identity.hair} hair` : undefined,
    identity.eyes ? `${identity.eyes} eyes` : undefined,
    ...(identity.distinguishingMarks ?? []),
  ]);

  const body = joinParts([
    identity.ageRange,
    identity.genderPresentation,
    identity.bodyType,
    identity.height ? `height ${identity.height}` : undefined,
    identity.species && identity.species !== 'human' ? identity.species : undefined,
  ]);

  const wardrobe = joinParts([variable.costume, ...(variable.accessories ?? [])]);
  const palette = (character.colorPalette ?? []).join(' / ');

  const segments = [
    `${token} (${character.code} v${character.version})`,
    body ? `body: ${body}` : '',
    face ? `face: ${face}` : '',
    wardrobe ? `wardrobe: ${wardrobe}` : '',
    palette ? `palette: ${palette}` : '',
  ].filter(Boolean);

  const forbidden = character.forbiddenChanges ?? [];
  const constraint = forbidden.length > 0 ? ` — keep unchanged: ${forbidden.join('; ')}` : '';

  return `${segments.join('; ')}${constraint}`;
}

export function styleLockText(style: StyleSnapshot): string {
  const details = style.details ?? {};
  const explicit = style.promptBlock.trim();
  if (explicit) return `${explicit} (${style.code} v${style.version})`;

  return joinParts([
    `${style.name} (${style.code} v${style.version})`,
    details.medium,
    details.renderingStyle,
    details.lineQuality,
    details.texture,
    details.lighting,
    details.cameraLanguage,
    details.composition,
    details.characterProportions,
    (details.colorPalette ?? []).length > 0 ? `palette ${(details.colorPalette ?? []).join(' / ')}` : undefined,
  ]);
}

export function locationLockText(location: LocationSnapshot): string {
  const details = location.details ?? {};
  const explicit = location.promptBlock.trim();
  const head = `${location.name} (${location.code} v${location.version})`;
  if (explicit) return `${head}: ${explicit}`;

  return joinParts([
    head,
    location.type,
    location.era,
    details.architecture,
    details.layout,
    details.lighting,
    details.weather,
    (details.keyObjects ?? []).length > 0 ? `key objects ${(details.keyObjects ?? []).join(', ')}` : undefined,
  ]);
}

export function propLockText(prop: PropSnapshot): string {
  const details = prop.details ?? {};
  const token = prop.promptToken.trim() || prop.name;
  return joinParts([
    `${token} (${prop.code} v${prop.version})`,
    details.material,
    details.color,
    details.condition,
    details.dimensions,
  ]);
}

/** Negative rules contributed by every locked entity. */
export function collectNegatives(input: {
  characters?: CharacterSnapshot[];
  style?: StyleSnapshot | null;
  location?: LocationSnapshot | null;
  extra?: string;
}): string {
  const parts: string[] = [];
  for (const character of input.characters ?? []) {
    if (character.negativePrompt.trim()) parts.push(character.negativePrompt.trim());
    for (const forbidden of character.forbiddenChanges ?? []) {
      parts.push(`changed ${forbidden}`);
    }
  }
  if (input.style?.negativeStyleRules.trim()) parts.push(input.style.negativeStyleRules.trim());
  if (input.location?.negativePrompt.trim()) parts.push(input.location.negativePrompt.trim());
  if (input.extra?.trim()) parts.push(input.extra.trim());

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts.flatMap((p) => p.split(',').map((s) => s.trim())).filter(Boolean)) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  return unique.join(', ');
}
