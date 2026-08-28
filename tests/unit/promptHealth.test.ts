/**
 * IA4 (TASK-SHOT-INSPECTOR-IA4) — focused unit tests for the deterministic
 * prompt-health derivation. These are tab-local health states only; IA2
 * whole-shot readiness is a separate derivation over the same facts.
 */
import { describe, expect, it } from 'vitest';
import {
  deriveKindHealth,
  derivePromptHealth,
  type PromptHealth,
  type PromptKindHealth,
  type PromptKind,
  type ShotRefInputs,
  type PromptReadData,
} from '@/components/shot-inspector/promptHealthUtils';

function makeReqRefs(overrides: Partial<ShotRefInputs> = {}): ShotRefInputs {
  return {
    hasCharacters: false,
    hasLocation: false,
    hasProps: false,
    hasProjectStyle: false,
    ...overrides,
  };
}

function makePromptData(overrides: Partial<PromptReadData> = {}): PromptReadData {
  return {
    compiled: 'Subject: a character\nAction: standing\nEnvironment: a room\n',
    negative: 'ugly, deformed',
    lockRefs: {
      characters: [],
      style: null,
      location: null,
      props: [],
    },
    lint: { ok: true, score: 100, issues: [], characterCount: 71 },
    version: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePromptDataWithChars(): PromptReadData {
  return makePromptData({
    lockRefs: {
      characters: [{ id: 'char1', code: 'CHAR001', version: 1 }],
      style: null,
      location: null,
      props: [],
    },
  });
}

function makePromptDataWithCharsAndStyle(): PromptReadData {
  return makePromptData({
    lockRefs: {
      characters: [{ id: 'char1', code: 'CHAR001', version: 1 }],
      style: { id: 'sty1', code: 'STY001', version: 1 },
      location: null,
      props: [],
    },
  });
}

function makePromptDataFull(overrides: Partial<PromptReadData> = {}): PromptReadData {
  return makePromptData({
    lockRefs: {
      characters: [{ id: 'char1', code: 'CHAR001', version: 1 }],
      style: { id: 'sty1', code: 'STY001', version: 1 },
      location: { id: 'loc1', code: 'LOC001', version: 1 },
      props: [],
    },
    ...overrides,
  });
}

function makePromptDataLintError(kind: PromptKind = 'image'): PromptReadData {
  return makePromptDataFull({
    compiled: kind === 'image'
      ? 'Subject: a character\nAction: standing\nEnvironment: a room\n'
      : 'Subject: a character\nAction: moving\nCamera Movement: pan\nMotion: fast\nEnvironment: a room\n',
    lint: { ok: false, score: 40, issues: [{ rule: 'LINT001', severity: 'error', message: 'Missing required block', hint: '' }], characterCount: 80 },
  });
}

const REQ_CHARS: ShotRefInputs = makeReqRefs({ hasCharacters: true });
const REQ_CHARS_STYLE: ShotRefInputs = makeReqRefs({ hasCharacters: true, hasProjectStyle: true });
const REQ_CHARS_LOC_STYLE: ShotRefInputs = makeReqRefs({ hasCharacters: true, hasLocation: true, hasProjectStyle: true });
const NO_REQS: ShotRefInputs = makeReqRefs();

describe('deriveKindHealth — MISSING', () => {
  it('returns MISSING when prompt data is null', () => {
    const result = deriveKindHealth(null, NO_REQS, 'image');
    expect(result.status).toBe('MISSING');
    expect(result.reason).toContain('image');
  });

  it('returns MISSING when prompt data is null for video', () => {
    const result = deriveKindHealth(null, NO_REQS, 'video');
    expect(result.status).toBe('MISSING');
    expect(result.reason).toContain('video');
  });
});

describe('deriveKindHealth — BLOCKED', () => {
  it('blocks when shot has characters but lockRefs has no character locks', () => {
    const data = makePromptData();
    const result = deriveKindHealth(data, REQ_CHARS, 'image');
    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('character');
  });

  it('blocks when shot has location but lockRefs has no location lock', () => {
    const data = makePromptDataWithChars();
    const reqRefs = makeReqRefs({ hasCharacters: true, hasLocation: true });
    const result = deriveKindHealth(data, reqRefs, 'image');
    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('location');
  });

  it('blocks when project has style but lockRefs has no style lock', () => {
    const data = makePromptDataWithChars();
    const result = deriveKindHealth(data, REQ_CHARS_STYLE, 'image');
    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('style');
  });

  it('blocks with multiple missing categories in reason', () => {
    const data = makePromptData();
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'image');
    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('character');
    expect(result.reason).toContain('location');
    expect(result.reason).toContain('style');
  });

  it('does NOT block when no references are required', () => {
    const data = makePromptData();
    const result = deriveKindHealth(data, NO_REQS, 'image');
    expect(result.status).toBe('READY');
    expect(result.reason).not.toContain('blocked');
  });
});

describe('deriveKindHealth — NEEDS_ATTENTION (malformed lint)', () => {
  it('returns NEEDS_ATTENTION when lint is null', () => {
    const data = makePromptDataFull();
    (data as unknown as Record<string, unknown>).lint = null;
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'image');
    expect(result.status).toBe('NEEDS_ATTENTION');
  });

  it('returns NEEDS_ATTENTION when lint data is malformed', () => {
    const data = makePromptDataFull();
    (data as unknown as Record<string, unknown>).lint = { ok: undefined, score: 0, issues: [], characterCount: 0 };
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'image');
    expect(result.status).toBe('NEEDS_ATTENTION');
  });
});

describe('deriveKindHealth — NEEDS_ATTENTION (lint errors)', () => {
  it('returns NEEDS_ATTENTION when image lint is not ok', () => {
    const data = makePromptDataLintError('image');
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'image');
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.reason).toContain('image');
    expect(result.reason).toContain('lint');
  });

  it('returns NEEDS_ATTENTION when video lint is not ok', () => {
    const data = makePromptDataLintError('video');
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'video');
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.reason).toContain('video');
    expect(result.reason).toContain('lint');
  });
});

describe('deriveKindHealth — READY', () => {
  it('returns READY when all lock refs are present and lint is ok', () => {
    const data = makePromptDataFull();
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'image');
    expect(result.status).toBe('READY');
    expect(result.reason).toContain('valid');
  });
});

describe('deriveKindHealth — scope separation', () => {
  it('image finding identifies image kind', () => {
    const resultMissing = deriveKindHealth(null, NO_REQS, 'image');
    expect(resultMissing.reason).toContain('image');
    expect(resultMissing.reason).not.toContain('video');
  });

  it('video finding identifies video kind', () => {
    const resultMissing = deriveKindHealth(null, NO_REQS, 'video');
    expect(resultMissing.reason).toContain('video');
    expect(resultMissing.reason).not.toContain('image');
  });

  it('image lint error is scoped to image', () => {
    const data = makePromptDataLintError('image');
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'image');
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.reason).toContain('image');
  });

  it('video lint error is scoped to video', () => {
    const data = makePromptDataLintError('video');
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'video');
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.reason).toContain('video');
  });
});

describe('derivePromptHealth — Rule 0: null/malformed data', () => {
  it('returns NEEDS_ATTENTION when imagePrompt is undefined (malformed input)', () => {
    const result = derivePromptHealth(undefined as unknown as PromptReadData | null, makePromptDataFull(), NO_REQS);
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.reason).toBe('Prompt data is unavailable or incomplete');
  });

  it('returns NEEDS_ATTENTION when videoPrompt is undefined (malformed input)', () => {
    const result = derivePromptHealth(makePromptDataFull(), undefined as unknown as PromptReadData | null, NO_REQS);
    expect(result.status).toBe('NEEDS_ATTENTION');
  });

  it('returns NEEDS_ATTENTION when both are undefined', () => {
    const result = derivePromptHealth(undefined as unknown as PromptReadData | null, undefined as unknown as PromptReadData | null, NO_REQS);
    expect(result.status).toBe('NEEDS_ATTENTION');
  });

  it('malformed state can NEVER become READY', () => {
    const result = derivePromptHealth(undefined as unknown as PromptReadData | null, makePromptDataFull(), REQ_CHARS_LOC_STYLE);
    expect(result.status).not.toBe('READY');
  });
});

describe('derivePromptHealth — Rule 1: BLOCKED', () => {
  it('blocked when image prompt is blocked due to missing lock refs', () => {
    const imageData = makePromptData();
    const videoData = makePromptDataFull();
    const result = derivePromptHealth(imageData, videoData, REQ_CHARS_LOC_STYLE);
    expect(result.status).toBe('BLOCKED');
    expect(result.image.status).toBe('BLOCKED');
    expect(result.video.status).toBe('READY');
  });

  it('blocked when video prompt is blocked', () => {
    const imageData = makePromptDataFull();
    const videoData = makePromptData();
    const result = derivePromptHealth(imageData, videoData, REQ_CHARS_LOC_STYLE);
    expect(result.status).toBe('BLOCKED');
    expect(result.image.status).toBe('READY');
    expect(result.video.status).toBe('BLOCKED');
  });

  it('blocked status includes review references action', () => {
    const result = derivePromptHealth(makePromptData(), makePromptDataFull(), REQ_CHARS);
    expect(result.status).toBe('BLOCKED');
    expect(result.tone).toBe('blocked');
    expect(result.actionLabel).toBe('Review references');
    expect(result.actionDestination).toBe('?tab=references');
  });

  it('blocked reason identifies the specific missing input category', () => {
    const result = derivePromptHealth(makePromptData(), makePromptDataFull(), REQ_CHARS);
    expect(result.reason).toContain('character');
  });

  it('lock failure outranks EMPTY', () => {
    const result = derivePromptHealth(makePromptData(), makePromptDataFull(), REQ_CHARS);
    expect(result.status).toBe('BLOCKED');
    expect(result.status).not.toBe('EMPTY');
  });
});

describe('derivePromptHealth — Rule 2: EMPTY', () => {
  it('returns EMPTY when both image and video prompts are null', () => {
    const result = derivePromptHealth(null, null, NO_REQS);
    expect(result.status).toBe('EMPTY');
    expect(result.reason).toBe('No stored prompts exist for this shot');
    expect(result.tone).toBe('info');
  });

  it('returns EMPTY when both are null and no references are required', () => {
    const result = derivePromptHealth(null, null, REQ_CHARS);
    expect(result.status).toBe('EMPTY');
  });

  it('EMPTY has no action', () => {
    const result = derivePromptHealth(null, null, NO_REQS);
    expect(result.actionLabel).toBeNull();
    expect(result.actionDestination).toBeNull();
  });
});

describe('derivePromptHealth — Rule 3: NEEDS_ATTENTION', () => {
  it('returns NEEDS_ATTENTION when only image prompt exists', () => {
    const imageData = makePromptDataFull();
    const result = derivePromptHealth(imageData, null, REQ_CHARS_LOC_STYLE);
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.image.status).toBe('READY');
    expect(result.video.status).toBe('MISSING');
  });

  it('returns NEEDS_ATTENTION when only video prompt exists', () => {
    const videoData = makePromptDataFull();
    const result = derivePromptHealth(null, videoData, REQ_CHARS_LOC_STYLE);
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.image.status).toBe('MISSING');
    expect(result.video.status).toBe('READY');
  });

  it('missing image reason identifies image', () => {
    const result = derivePromptHealth(null, makePromptDataFull(), REQ_CHARS_LOC_STYLE);
    expect(result.reason).toContain('image');
  });

  it('missing video reason identifies video', () => {
    const result = derivePromptHealth(makePromptDataFull(), null, REQ_CHARS_LOC_STYLE);
    expect(result.reason).toContain('video');
  });

  it('returns NEEDS_ATTENTION when image has lint error', () => {
    const imageData = makePromptDataLintError('image');
    const videoData = makePromptDataFull();
    const result = derivePromptHealth(imageData, videoData, REQ_CHARS_LOC_STYLE);
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.image.status).toBe('NEEDS_ATTENTION');
    expect(result.video.status).toBe('READY');
  });

  it('returns NEEDS_ATTENTION when video has lint error', () => {
    const imageData = makePromptDataFull();
    const videoData = makePromptDataLintError('video');
    const result = derivePromptHealth(imageData, videoData, REQ_CHARS_LOC_STYLE);
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.image.status).toBe('READY');
    expect(result.video.status).toBe('NEEDS_ATTENTION');
  });

  it('NEEDS_ATTENTION reason identifies which kind is missing', () => {
    const result = derivePromptHealth(makePromptDataFull(), null, REQ_CHARS_LOC_STYLE);
    expect(result.reason).toContain('video prompt is missing');
    expect(result.reason).not.toContain('image prompt is missing');
  });
});

describe('derivePromptHealth — Rule 4: READY', () => {
  it('returns READY when both prompts exist and lint is ok', () => {
    const imageData = makePromptDataFull();
    const videoData = makePromptDataFull({
      compiled: 'Subject: a character\nAction: running\nCamera Movement: pan\nMotion: fast\nEnvironment: a room\n',
    });
    const result = derivePromptHealth(imageData, videoData, REQ_CHARS_LOC_STYLE);
    expect(result.status).toBe('READY');
    expect(result.reason).toBe('Both image and video prompts pass inspection');
    expect(result.tone).toBe('success');
    expect(result.image.status).toBe('READY');
    expect(result.video.status).toBe('READY');
  });

  it('READY requires BOTH kinds to be valid — no false READY', () => {
    const imageData = makePromptDataFull();
    const result = derivePromptHealth(imageData, null, REQ_CHARS_LOC_STYLE);
    expect(result.status).not.toBe('READY');

    const result2 = derivePromptHealth(null, makePromptDataFull(), REQ_CHARS_LOC_STYLE);
    expect(result2.status).not.toBe('READY');
  });

  it('READY requires both lint states to be ok', () => {
    const imageOk = makePromptDataFull();
    const videoLintError = makePromptDataLintError('video');
    const result = derivePromptHealth(imageOk, videoLintError, REQ_CHARS_LOC_STYLE);
    expect(result.status).not.toBe('READY');
  });
});

describe('derivePromptHealth — deterministic precedence', () => {
  it('null/malformed > BLOCKED', () => {
    const result = derivePromptHealth(undefined as unknown as PromptReadData | null, makePromptData(), REQ_CHARS);
    expect(result.status).toBe('NEEDS_ATTENTION');
  });

  it('BLOCKED > EMPTY', () => {
    const result = derivePromptHealth(makePromptData(), makePromptDataFull(), REQ_CHARS);
    expect(result.status).toBe('BLOCKED');
  });

  it('BLOCKED > NEEDS_ATTENTION', () => {
    const imageData = makePromptData();
    const videoData = makePromptDataFull();
    const result = derivePromptHealth(imageData, videoData, REQ_CHARS);
    expect(result.status).toBe('BLOCKED');
  });

  it('EMPTY > NEEDS_ATTENTION', () => {
    const result = derivePromptHealth(null, null, NO_REQS);
    expect(result.status).toBe('EMPTY');
  });

  it('NEEDS_ATTENTION > READY', () => {
    const imageOk = makePromptDataFull();
    const videoMissing = null;
    const result = derivePromptHealth(imageOk, videoMissing, REQ_CHARS_LOC_STYLE);
    expect(result.status).toBe('NEEDS_ATTENTION');
  });
});

describe('derivePromptHealth — input order does not change result', () => {
  it('same result regardless of parameter order for blocked scenario', () => {
    const result1 = derivePromptHealth(makePromptData(), makePromptDataFull(), REQ_CHARS);
    const result2 = derivePromptHealth(makePromptDataFull(), makePromptData(), REQ_CHARS);
    expect(result1.status).toBe(result2.status);
  });

  it('same result regardless of parameter order for missing scenario', () => {
    const result1 = derivePromptHealth(makePromptDataFull(), null, REQ_CHARS_LOC_STYLE);
    const result2 = derivePromptHealth(null, makePromptDataFull(), REQ_CHARS_LOC_STYLE);
    expect(result1.status).toBe(result2.status);
  });
});

describe('derivePromptHealth — kind health per-field consistency', () => {
  it('image kind health exposed correctly', () => {
    const result = derivePromptHealth(null, makePromptDataFull(), REQ_CHARS_LOC_STYLE);
    expect(result.image.status).toBe('MISSING');
  });

  it('video kind health exposed correctly', () => {
    const result = derivePromptHealth(makePromptDataFull(), null, REQ_CHARS_LOC_STYLE);
    expect(result.video.status).toBe('MISSING');
  });
});

describe('derivePromptHealth — warnings follow lint semantics', () => {
  it('warning-level lint issues cause NEEDS_ATTENTION when lint.ok is false', () => {
    const data = makePromptDataFull({
      lint: { ok: false, score: 70, issues: [{ rule: 'LINT002', severity: 'warning', message: 'Consider adding motion block', hint: '' }], characterCount: 80 },
    });
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'video');
    expect(result.status).toBe('NEEDS_ATTENTION');
  });

  it('warning-level issues with lint.ok=true are READY', () => {
    const data = makePromptDataFull({
      lint: { ok: true, score: 70, issues: [{ rule: 'LINT002', severity: 'warning', message: 'Consider adding motion block', hint: '' }], characterCount: 80 },
    });
    const result = deriveKindHealth(data, REQ_CHARS_LOC_STYLE, 'video');
    expect(result.status).toBe('READY');
  });
});

describe('derivePromptHealth — tone mapping', () => {
  it('BLOCKED → blocked tone', () => {
    const result = derivePromptHealth(makePromptData(), makePromptDataFull(), REQ_CHARS);
    expect(result.tone).toBe('blocked');
  });

  it('EMPTY → info tone', () => {
    const result = derivePromptHealth(null, null, NO_REQS);
    expect(result.tone).toBe('info');
  });

  it('NEEDS_ATTENTION → warning tone', () => {
    const result = derivePromptHealth(makePromptDataFull(), null, REQ_CHARS_LOC_STYLE);
    expect(result.tone).toBe('warning');
  });

  it('READY → success tone', () => {
    const result = derivePromptHealth(makePromptDataFull(), makePromptDataFull(), REQ_CHARS_LOC_STYLE);
    expect(result.tone).toBe('success');
  });
});
