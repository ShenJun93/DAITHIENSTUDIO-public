/**
 * Production identifier grammar.
 *
 * Human-facing codes follow the studio convention from the spec:
 *   Episode  EP01
 *   Scene    SC01
 *   Shot     EP01_SC01_SH001   (episode-less projects use SC01_SH001)
 *   Bibles   CHAR001 / LOC001 / PROP001 / STY001
 *
 * Internal primary keys are opaque prefixed ids (`shot_a1b2...`) so codes can
 * be renumbered without rewriting every foreign key.
 */
import { DomainError } from './errors';

export const SHOT_CODE_PATTERN = /^(?:(EP\d{2})_)?(SC\d{2,3})_(SH\d{3})$/;
export const EPISODE_CODE_PATTERN = /^EP\d{2}$/;
export const SCENE_CODE_PATTERN = /^(?:EP\d{2}_)?SC\d{2,3}$/;
export const BIBLE_CODE_PATTERN = /^(CHAR|LOC|PROP|STY)\d{3}$/;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function newId(prefix: string, random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)] ?? '0';
  }
  return `${prefix}_${out}`;
}

export function pad(value: number, width: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(width, '0');
}

export function episodeCode(number: number): string {
  return `EP${pad(number, 2)}`;
}

export function sceneCode(number: number, episodeNumber?: number | null): string {
  const tail = `SC${pad(number, 2)}`;
  return episodeNumber ? `${episodeCode(episodeNumber)}_${tail}` : tail;
}

export function shotCode(sceneNumber: number, shotNumber: number, episodeNumber?: number | null): string {
  return `${sceneCode(sceneNumber, episodeNumber)}_SH${pad(shotNumber, 3)}`;
}

export function bibleCode(kind: 'character' | 'location' | 'prop' | 'style', number: number): string {
  const prefix = { character: 'CHAR', location: 'LOC', prop: 'PROP', style: 'STY' }[kind];
  return `${prefix}${pad(number, 3)}`;
}

export function assertShotCode(code: string): void {
  if (!SHOT_CODE_PATTERN.test(code)) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Invalid shot code "${code}". Expected EP01_SC01_SH001 (episode part optional).`,
    );
  }
}

export function parseShotCode(code: string): { episode: string | null; scene: string; shot: string } {
  const match = SHOT_CODE_PATTERN.exec(code);
  if (!match) {
    throw new DomainError('VALIDATION_FAILED', `Invalid shot code "${code}".`);
  }
  return { episode: match[1] ?? null, scene: match[2] as string, shot: match[3] as string };
}

const VIETNAMESE_MAP: Record<string, string> = {
  à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a', ă: 'a', ằ: 'a', ắ: 'a', ẳ: 'a', ẵ: 'a', ặ: 'a',
  â: 'a', ầ: 'a', ấ: 'a', ẩ: 'a', ẫ: 'a', ậ: 'a',
  è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e', ê: 'e', ề: 'e', ế: 'e', ể: 'e', ễ: 'e', ệ: 'e',
  ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i',
  ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o', ô: 'o', ồ: 'o', ố: 'o', ổ: 'o', ỗ: 'o', ộ: 'o',
  ơ: 'o', ờ: 'o', ớ: 'o', ở: 'o', ỡ: 'o', ợ: 'o',
  ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u', ư: 'u', ừ: 'u', ứ: 'u', ử: 'u', ữ: 'u', ự: 'u',
  ỳ: 'y', ý: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y',
  đ: 'd',
};

export function slugify(input: string): string {
  const lowered = input.toLowerCase().trim();
  let ascii = '';
  for (const char of lowered) {
    ascii += VIETNAMESE_MAP[char] ?? char;
  }
  const slug = ascii
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'project';
}
