/**
 * Deterministic script parser.
 *
 * The Story/Script modules can use an LLM (see the TextProvider port), but the
 * pipeline must never *depend* on one: with `AI_TEXT_PROVIDER=mock` the studio
 * still breaks a script into scenes, characters and dialogue offline, for free,
 * and reproducibly. Tests rely on this determinism.
 *
 * Supported scene headings (Vietnamese and English):
 *   CẢNH 1 - HANG ĐỘNG TU TIÊN - ĐÊM
 *   SCENE 2 — MOUNTAIN PATH — DAY
 *   INT. CAVE - NIGHT
 *   EXT. SÂN LUYỆN VÕ - SÁNG
 * Dialogue:
 *   TRIỆU NGỐC: Ta là thiên tài!
 *   TRIỆU NGỐC (bối rối): Ơ...
 *   or an all-caps character line followed by the spoken line.
 */
import { z } from 'zod';
import { TIME_OF_DAY } from './enums';

export const parsedDialogueSchema = z.object({
  characterName: z.string(),
  text: z.string(),
  emotion: z.string().default(''),
  delivery: z.string().default(''),
});

export const parsedSceneSchema = z.object({
  number: z.number().int().min(1),
  title: z.string(),
  locationName: z.string(),
  timeOfDay: z.enum(TIME_OF_DAY),
  action: z.string(),
  summary: z.string(),
  dialogue: z.array(parsedDialogueSchema),
  characterNames: z.array(z.string()),
  estimatedDurationSeconds: z.number().int().min(0),
});

export type ParsedDialogue = z.infer<typeof parsedDialogueSchema>;
export type ParsedScene = z.infer<typeof parsedSceneSchema>;

export interface ParsedScript {
  scenes: ParsedScene[];
  characterNames: string[];
  locationNames: string[];
  warnings: string[];
}

const SCENE_HEADING = new RegExp(
  [
    '^\\s*(?:',
    '(?:c[ảa]nh|scene|sc)\\s*(\\d{1,3})',
    '|',
    '(int|ext|n[ộo]i|ngo[ạa]i)\\.?\\s',
    ')',
  ].join(''),
  'i',
);

/**
 * Time-of-day detection.
 *
 * `\b` is ASCII-only in JavaScript, so `\bđêm\b` never matches — the boundary
 * before `đ` requires an ASCII word character. Unicode lookarounds are used
 * instead so Vietnamese keywords are matched as whole words.
 */
function wholeWord(alternatives: string): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, 'iu');
}

const TIME_TOKENS: [RegExp, (typeof TIME_OF_DAY)[number]][] = [
  [wholeWord('đêm|night|khuya|midnight'), 'night'],
  [wholeWord('rạng sáng|dawn|sunrise|bình minh'), 'dawn'],
  [wholeWord('hoàng hôn|dusk|sunset|chiều tà'), 'dusk'],
  [wholeWord('golden hour|nắng vàng'), 'golden-hour'],
  [wholeWord('ngày|day|sáng|trưa|chiều|morning|afternoon'), 'day'],
];

const DIALOGUE_LINE = /^\s*([\p{Lu}ĐÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ][\p{Lu}\s.'’ĐÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]{1,40})\s*(?:\(([^)]{1,60})\))?\s*:\s*(.+)$/u;

const PARENTHETICAL_ONLY = /^\s*\(([^)]+)\)\s*$/;

function detectTimeOfDay(headingTail: string): (typeof TIME_OF_DAY)[number] {
  for (const [pattern, value] of TIME_TOKENS) {
    if (pattern.test(headingTail)) return value;
  }
  return 'unspecified';
}

function cleanHeading(raw: string): { locationName: string; timeOfDay: (typeof TIME_OF_DAY)[number]; title: string } {
  const withoutPrefix = raw
    .replace(/^\s*(?:c[ảa]nh|scene|sc)\s*\d{1,3}\s*[-–—:.]?\s*/i, '')
    .replace(/^\s*(?:int|ext|n[ộo]i|ngo[ạa]i)\.?\s*[-–—:]?\s*/i, '')
    .trim();

  const parts = withoutPrefix.split(/\s*[-–—]\s*|\s{2,}/).filter(Boolean);
  const timeOfDay = detectTimeOfDay(withoutPrefix);
  const timeIndex = parts.findIndex((part) => detectTimeOfDay(part) !== 'unspecified' && part.split(/\s+/).length <= 3);
  const locationParts = timeIndex >= 0 ? parts.slice(0, timeIndex) : parts;
  const locationName = (locationParts.join(' - ') || withoutPrefix || 'Unspecified location').trim();

  return { locationName, timeOfDay, title: withoutPrefix || locationName };
}

function estimateDuration(action: string, dialogue: ParsedDialogue[]): number {
  const spokenWords = dialogue.reduce((total, line) => total + line.text.split(/\s+/).filter(Boolean).length, 0);
  const actionWords = action.split(/\s+/).filter(Boolean).length;
  // ~2.6 spoken words per second (Vietnamese narration), action beats ~1.2s per 10 words.
  const seconds = spokenWords / 2.6 + (actionWords / 10) * 1.2;
  return Math.max(4, Math.round(seconds));
}

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ')
    .trim();
}

export function parseScript(raw: string): ParsedScript {
  const warnings: string[] = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  interface Draft {
    number: number;
    heading: string;
    actionLines: string[];
    dialogue: ParsedDialogue[];
  }

  const drafts: Draft[] = [];
  let current: Draft | undefined;
  let pendingCharacter: string | null = null;
  let pendingParenthetical = '';

  const startScene = (heading: string, explicitNumber?: number): void => {
    const draft: Draft = {
      number: explicitNumber ?? drafts.length + 1,
      heading,
      actionLines: [],
      dialogue: [],
    };
    current = draft;
    drafts.push(draft);
    pendingCharacter = null;
    pendingParenthetical = '';
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      pendingCharacter = null;
      continue;
    }

    const heading = SCENE_HEADING.exec(line);
    if (heading) {
      const explicit = heading[1] ? Number.parseInt(heading[1], 10) : undefined;
      startScene(line, explicit);
      continue;
    }

    if (!current) {
      // Content before any heading: treat as an implicit first scene.
      startScene('SCENE 1 - Unspecified location');
      warnings.push('Script had content before the first scene heading; an implicit scene 1 was created.');
    }

    const scene = current;
    if (!scene) continue;

    const spoken = DIALOGUE_LINE.exec(line);
    if (spoken) {
      scene.dialogue.push({
        characterName: titleCase(spoken[1]!.trim()),
        text: spoken[3]!.trim(),
        emotion: (spoken[2] ?? '').trim(),
        delivery: '',
      });
      pendingCharacter = null;
      continue;
    }

    const parenthetical = PARENTHETICAL_ONLY.exec(line);
    if (parenthetical && pendingCharacter) {
      pendingParenthetical = parenthetical[1]!.trim();
      continue;
    }

    const isAllCapsName =
      line === line.toUpperCase() &&
      line.length <= 42 &&
      /[\p{Lu}]/u.test(line) &&
      !/[.!?]$/.test(line) &&
      line.split(/\s+/).length <= 5;

    if (isAllCapsName && !pendingCharacter) {
      pendingCharacter = titleCase(line.replace(/[:：]$/, '').trim());
      pendingParenthetical = '';
      continue;
    }

    if (pendingCharacter) {
      scene.dialogue.push({
        characterName: pendingCharacter,
        text: line,
        emotion: pendingParenthetical,
        delivery: '',
      });
      pendingCharacter = null;
      pendingParenthetical = '';
      continue;
    }

    scene.actionLines.push(line);
  }

  const scenes: ParsedScene[] = drafts.map((draft, index) => {
    const { locationName, timeOfDay, title } = cleanHeading(draft.heading);
    const action = draft.actionLines.join(' ');
    const names = [...new Set(draft.dialogue.map((d) => d.characterName))];
    return parsedSceneSchema.parse({
      number: index + 1,
      title: title.slice(0, 200),
      locationName: locationName.slice(0, 120),
      timeOfDay,
      action,
      summary: (action.split(/(?<=[.!?])\s/)[0] ?? action).slice(0, 400),
      dialogue: draft.dialogue,
      characterNames: names,
      estimatedDurationSeconds: estimateDuration(action, draft.dialogue),
    });
  });

  if (scenes.length === 0) {
    warnings.push('No scene headings were found. Use "CẢNH 1 - ĐỊA ĐIỂM - ĐÊM" or "INT. LOCATION - DAY".');
  }

  const characterNames = [...new Set(scenes.flatMap((scene) => scene.characterNames))];
  const locationNames = [...new Set(scenes.map((scene) => scene.locationName))];

  return { scenes, characterNames, locationNames, warnings };
}
