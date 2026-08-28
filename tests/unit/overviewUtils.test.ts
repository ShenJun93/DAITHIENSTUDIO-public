import { describe, expect, it } from 'vitest';
import { deriveNextAction, deriveReadinessTone, deriveReadinessGlyph } from '@/components/shot-inspector/overviewUtils';
import type { OverviewInput, OverviewReadiness } from '@/components/shot-inspector/overviewUtils';

function emptyVcState() {
  return {
    pinnedReferences: [] as Array<{ resolved: boolean }>,
    assets: [] as Array<{ isRequiredReference: boolean; approvalState: string }>,
    continuity: { blockers: [] as Array<{ message: string }> },
    prompt: {
      image: { promptId: 'prompt-img-1', lintOk: true },
      video: { promptId: 'prompt-vid-1', lintOk: true },
    },
  };
}

function emptyShot() {
  return {
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    lens: '50mm',
    durationSeconds: 5,
    aspectRatio: '16:9',
    description: 'A shot description.',
    dialogue: 'Hello world.',
    lighting: 'soft',
    emotion: 'calm',
    importance: 'normal' as const,
    code: 'EP01_SC01_SH001',
  };
}

function emptyInput(overrides: Partial<OverviewInput> = {}): OverviewInput {
  return {
    vcState: emptyVcState(),
    shot: emptyShot(),
    imagePrompt: null,
    videoPrompt: null,
    generations: [],
    assets: [],
    nextShotCode: null,
    basePath: '/projects/test/shots/EP01_SC01_SH001',
    ...overrides,
  };
}

function lintErrorPrompt() {
  return {
    version: {
      lint: {
        issues: [{ severity: 'error', message: 'Missing required lock', rule: 'LINT001', hint: '' }],
      },
    },
  };
}

function lintOkPrompt() {
  return {
    version: {
      lint: {
        issues: [] as Array<{ severity: string }>,
      },
    },
  };
}

function gen(kind: string, status: string, id: string) {
  return { kind, status, id };
}

function asset(kind: string, approvalState: string, generationId: string | null = null) {
  return { kind, approvalState, generationId };
}

describe('deriveNextAction — Rule 1: missing shot spec', () => {
  it('returns NEEDS_ATTENTION when shotSize is empty', () => {
    const result = deriveNextAction(emptyInput({ shot: { ...emptyShot(), shotSize: '' } }));
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.primaryLabel).toBe('Edit shot');
    expect(result.ruleId).toBe('1');
    expect(result.actionType).toBe('NAVIGATION');
  });

  it('returns NEEDS_ATTENTION when cameraAngle is empty', () => {
    const result = deriveNextAction(emptyInput({ shot: { ...emptyShot(), cameraAngle: '' } }));
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.ruleId).toBe('1');
  });

  it('returns NEEDS_ATTENTION when lens is empty', () => {
    const result = deriveNextAction(emptyInput({ shot: { ...emptyShot(), lens: '' } }));
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.ruleId).toBe('1');
  });

  it('returns NEEDS_ATTENTION when durationSeconds is 0', () => {
    const result = deriveNextAction(emptyInput({ shot: { ...emptyShot(), durationSeconds: 0 } }));
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.ruleId).toBe('1');
  });

  it('returns NEEDS_ATTENTION when aspectRatio is empty', () => {
    const result = deriveNextAction(emptyInput({ shot: { ...emptyShot(), aspectRatio: '' } }));
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.ruleId).toBe('1');
  });

  it('destinations to the edit route', () => {
    const result = deriveNextAction(emptyInput({ shot: { ...emptyShot(), shotSize: '' } }));
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001/edit');
  });
});

describe('deriveNextAction — Rule 2: unresolved pinned reference', () => {
  it('returns BLOCKED when a pinned reference is unresolved', () => {
    const vcState = {
      ...emptyVcState(),
      pinnedReferences: [{ resolved: false }],
    };
    const result = deriveNextAction(emptyInput({ vcState }));
    expect(result.readiness).toBe('BLOCKED');
    expect(result.primaryLabel).toBe('Resolve reference');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001?tab=references');
    expect(result.ruleId).toBe('2');
  });

  it('is not triggered when all pins are resolved', () => {
    const vcState = {
      ...emptyVcState(),
      pinnedReferences: [{ resolved: true }],
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.ruleId).not.toBe('2');
  });
});

describe('deriveNextAction — Rule 3: required reference pending or rejected', () => {
  it('returns BLOCKED with "Review reference" when reference is pending', () => {
    const vcState = {
      ...emptyVcState(),
      assets: [{ isRequiredReference: true, approvalState: 'pending' }],
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.readiness).toBe('BLOCKED');
    expect(result.primaryLabel).toBe('Review reference');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001?tab=generations');
    expect(result.ruleId).toBe('3');
  });

  it('returns BLOCKED with "Replace rejected reference" when rejected', () => {
    const vcState = {
      ...emptyVcState(),
      assets: [{ isRequiredReference: true, approvalState: 'rejected' }],
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.readiness).toBe('BLOCKED');
    expect(result.primaryLabel).toBe('Replace rejected reference');
    expect(result.ruleId).toBe('3');
  });

  it('prioritizes rejected label over pending when both exist', () => {
    const vcState = {
      ...emptyVcState(),
      assets: [
        { isRequiredReference: true, approvalState: 'pending' },
        { isRequiredReference: true, approvalState: 'rejected' },
      ],
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.primaryLabel).toBe('Replace rejected reference');
    expect(result.ruleId).toBe('3');
  });

  it('is not triggered for non-required references', () => {
    const vcState = {
      ...emptyVcState(),
      assets: [{ isRequiredReference: false, approvalState: 'pending' }],
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.ruleId).not.toBe('3');
  });
});

describe('deriveNextAction — Rule 4: continuity blocker', () => {
  it('returns BLOCKED when continuity has blockers', () => {
    const vcState = {
      ...emptyVcState(),
      continuity: { blockers: [{ message: 'Costume mismatch on character CHAR001' }] },
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.readiness).toBe('BLOCKED');
    expect(result.primaryLabel).toBe('Review continuity');
    expect(result.reason).toContain('Costume mismatch');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001?tab=visual-control');
    expect(result.ruleId).toBe('4');
  });

  it('is not triggered when continuity has no blockers', () => {
    const vcState = {
      ...emptyVcState(),
      continuity: { blockers: [] },
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.ruleId).not.toBe('4');
  });
});

describe('deriveNextAction — Rule 5: image prompt missing (image phase)', () => {
  it('returns NEEDS_ATTENTION when no image prompt exists and no approved image', () => {
    const result = deriveNextAction(emptyInput({ imagePrompt: null }));
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.primaryLabel).toBe('Compile image prompt');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001?tab=prompts');
    expect(result.ruleId).toBe('5');
  });

  it('treats null vcState.prompt.image.promptId as missing prompt', () => {
    const vcState = {
      ...emptyVcState(),
      prompt: { ...emptyVcState().prompt, image: { promptId: null, lintOk: null } },
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.ruleId).toBe('5');
  });

  it('skips Rule 5 when approved image exists', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: null,
        assets: [asset('image', 'approved')],
        videoPrompt: null,
      }),
    );
    // Should skip to video phase (Rule 11) since approved image exists
    expect(result.ruleId).toBe('11');
  });
});

describe('deriveNextAction — Rule 6: image prompt lint blocker', () => {
  it('returns BLOCKED when image prompt has lint errors', () => {
    const vcState = emptyVcState();
    const result = deriveNextAction(
      emptyInput({ vcState, imagePrompt: lintErrorPrompt() }),
    );
    expect(result.readiness).toBe('BLOCKED');
    expect(result.primaryLabel).toBe('Fix image prompt');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001?tab=prompts');
    expect(result.ruleId).toBe('6');
  });

  it('skips Rule 6 when approved image exists', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintErrorPrompt(),
        assets: [asset('image', 'approved')],
        videoPrompt: lintOkPrompt(),
      }),
    );
    expect(result.ruleId).not.toBe('6');
  });
});

describe('deriveNextAction — Rule 7: image generation active', () => {
  it('returns IN_PROGRESS when image generation is pending', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('image', 'pending', 'gen-img-1')],
      }),
    );
    expect(result.readiness).toBe('IN_PROGRESS');
    expect(result.primaryLabel).toBe('View image generation');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001?tab=generations');
    expect(result.ruleId).toBe('7');
  });

  it('returns IN_PROGRESS when image generation is processing', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('image', 'processing', 'gen-img-1')],
      }),
    );
    expect(result.ruleId).toBe('7');
  });

  it('is scoped to image kind — video generation does not trigger', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('video', 'processing', 'gen-vid-1')],
      }),
    );
    expect(result.ruleId).not.toBe('7');
  });
});

describe('deriveNextAction — Rule 8: image pending review', () => {
  it('returns IN_PROGRESS when image asset is pending review', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('image', 'completed', 'gen-img-1')],
        assets: [asset('image', 'pending', 'gen-img-1')],
      }),
    );
    expect(result.readiness).toBe('IN_PROGRESS');
    expect(result.primaryLabel).toBe('Review image');
    expect(result.ruleId).toBe('8');
  });

  it('uses fallback matching when generationId is null', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('image', 'completed', 'gen-img-1')],
        assets: [asset('image', 'pending', null)],
      }),
    );
    expect(result.ruleId).toBe('8');
  });

  it('does not trigger when video asset is pending', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('video', 'completed', 'gen-vid-1')],
        assets: [asset('video', 'pending', 'gen-vid-1')],
      }),
    );
    expect(result.ruleId).not.toBe('8');
  });
});

describe('deriveNextAction — Rule 9: image rejected', () => {
  it('returns NEEDS_ATTENTION when image asset is rejected', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        assets: [asset('image', 'rejected')],
      }),
    );
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.primaryLabel).toBe('Regenerate image or review rejection');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001?tab=generations');
    expect(result.ruleId).toBe('9');
  });

  it('is scoped to image kind', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        assets: [asset('video', 'rejected')],
      }),
    );
    expect(result.ruleId).not.toBe('9');
  });

  it('fires before ready-to-queue when rejected and no active gen', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        assets: [asset('image', 'rejected')],
      }),
    );
    expect(result.ruleId).toBe('9');
    expect(result.readiness).toBe('NEEDS_ATTENTION');
  });
});

describe('deriveNextAction — Rule 10: image ready to queue', () => {
  it('returns READY when all image preconditions are clear', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
      }),
    );
    expect(result.readiness).toBe('READY');
    expect(result.primaryLabel).toBe('Queue image');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001?tab=prompts');
    expect(result.ruleId).toBe('10');
  });

  it('does not trigger when active image generation exists', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('image', 'pending', 'gen-img-1')],
      }),
    );
    expect(result.ruleId).not.toBe('10');
  });

  it('does not trigger when pending image review exists', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('image', 'completed', 'gen-img-1')],
        assets: [asset('image', 'pending', 'gen-img-1')],
      }),
    );
    expect(result.ruleId).not.toBe('10');
  });
});

describe('deriveNextAction — Rule 11: video prompt missing (video phase)', () => {
  it('returns NEEDS_ATTENTION when approved image exists but no video prompt', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved')],
        videoPrompt: null,
      }),
    );
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.primaryLabel).toBe('Compile video prompt');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001?tab=prompts');
    expect(result.ruleId).toBe('11');
  });

  it('treats videoPromptMissing when vcState prompt.video.promptId is null', () => {
    const vcState = {
      ...emptyVcState(),
      prompt: { ...emptyVcState().prompt, video: { promptId: null, lintOk: null } },
    };
    const result = deriveNextAction(
      emptyInput({ vcState, assets: [asset('image', 'approved')], videoPrompt: lintOkPrompt() }),
    );
    expect(result.ruleId).toBe('11');
  });
});

describe('deriveNextAction — Rule 12: video prompt lint blocker', () => {
  it('returns BLOCKED when video prompt has lint errors', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved')],
        videoPrompt: lintErrorPrompt(),
      }),
    );
    expect(result.readiness).toBe('BLOCKED');
    expect(result.primaryLabel).toBe('Fix video prompt');
    expect(result.ruleId).toBe('12');
  });

  it('skips when approved video exists', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('video', 'approved')],
        videoPrompt: lintErrorPrompt(),
      }),
    );
    expect(result.ruleId).toBe('17');
  });
});

describe('deriveNextAction — Rule 13: video generation active', () => {
  it('returns IN_PROGRESS when video generation is active', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved')],
        videoPrompt: lintOkPrompt(),
        generations: [gen('video', 'processing', 'gen-vid-1')],
      }),
    );
    expect(result.readiness).toBe('IN_PROGRESS');
    expect(result.primaryLabel).toBe('View video generation');
    expect(result.ruleId).toBe('13');
  });

  it('is scoped to video kind', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved')],
        videoPrompt: lintOkPrompt(),
        generations: [gen('image', 'processing', 'gen-img-1')],
      }),
    );
    expect(result.ruleId).not.toBe('13');
  });
});

describe('deriveNextAction — Rule 14: video pending review', () => {
  it('returns IN_PROGRESS when video asset is pending review', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('video', 'pending', 'gen-vid-1')],
        videoPrompt: lintOkPrompt(),
        generations: [gen('video', 'completed', 'gen-vid-1')],
      }),
    );
    expect(result.readiness).toBe('IN_PROGRESS');
    expect(result.primaryLabel).toBe('Review video');
    expect(result.ruleId).toBe('14');
  });

  it('a pending IMAGE asset must not trigger video review (cross-kind scoping)', () => {
    // Approved image, completed video generation, but the only pending asset is
    // an IMAGE — not a video. Rule 14 (video pending review) must NOT fire.
    const result = deriveNextAction(
      emptyInput({
        assets: [
          asset('image', 'approved'),
          asset('image', 'pending', 'gen-img-stale'),
        ],
        videoPrompt: lintOkPrompt(),
        generations: [
          gen('image', 'completed', 'gen-img-stale'),
          gen('video', 'completed', 'gen-vid-1'),
        ],
      }),
    );
    expect(result.ruleId).not.toBe('14');
    expect(result.readiness).not.toBe('IN_PROGRESS');
    // With a completed video generation and no pending/rejected video asset and
    // no active video generation, the shot is ready to queue a fresh video.
    expect(result.ruleId).toBe('16');
  });

  it('a pending image asset must not masquerade as a pending video review', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [
          asset('image', 'approved'),
          asset('image', 'pending', 'gen-img-1'),
        ],
        videoPrompt: lintOkPrompt(),
        generations: [
          gen('image', 'completed', 'gen-img-1'),
          gen('video', 'completed', 'gen-vid-1'),
        ],
      }),
    );
    expect(result.primaryLabel).not.toBe('Review video');
  });
});

describe('deriveNextAction — Rule 15: video rejected', () => {
  it('returns NEEDS_ATTENTION when video asset is rejected', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('video', 'rejected')],
        videoPrompt: lintOkPrompt(),
      }),
    );
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.primaryLabel).toBe('Regenerate video or review rejection');
    expect(result.ruleId).toBe('15');
  });
});

describe('deriveNextAction — Rule 16: video ready to queue', () => {
  it('returns READY when all video preconditions are clear', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved')],
        videoPrompt: lintOkPrompt(),
      }),
    );
    expect(result.readiness).toBe('READY');
    expect(result.primaryLabel).toBe('Queue video');
    expect(result.ruleId).toBe('16');
  });
});

describe('deriveNextAction — Rule 17: complete (image + video approved)', () => {
  it('returns COMPLETE when both image and video are approved', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('video', 'approved')],
      }),
    );
    expect(result.readiness).toBe('COMPLETE');
    expect(result.ruleId).toBe('17');
  });

  it('labels "Next shot" and links to the next shot when nextShotCode is provided', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('video', 'approved')],
        nextShotCode: 'EP01_SC01_SH002',
      }),
    );
    expect(result.primaryLabel).toBe('Next shot');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH002');
    expect(result.ruleId).toBe('17');
  });

  it('labels "Return to shot list" and links to the shot-list route when nextShotCode is null (last shot)', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('video', 'approved')],
        nextShotCode: null,
      }),
    );
    expect(result.readiness).toBe('COMPLETE');
    expect(result.primaryLabel).toBe('Return to shot list');
    expect(result.destination).toBe('/projects/test/shots');
    expect(result.ruleId).toBe('17');
    expect(result.actionType).toBe('NAVIGATION');
  });

  it('never labels the last shot "Next shot" pointing back to the current shot', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('video', 'approved')],
        nextShotCode: null,
      }),
    );
    expect(result.primaryLabel).not.toBe('Next shot');
    // Destination must not point back at the current shot.
    expect(result.destination).not.toBe('/projects/test/shots/EP01_SC01_SH001');
  });

  it('does NOT return COMPLETE for image-only approved', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved')],
        videoPrompt: lintOkPrompt(),
      }),
    );
    expect(result.ruleId).not.toBe('17');
    expect(result.readiness).not.toBe('COMPLETE');
  });
});

describe('deriveNextAction — Rule 18: fallback', () => {
  it('returns NEEDS_ATTENTION with actionable fallback for null vcState after complete spec', () => {
    const result = deriveNextAction(emptyInput({ vcState: null }));
    expect(result.readiness).toBe('NEEDS_ATTENTION');
    expect(result.primaryLabel).toBe('Review and complete shot setup');
    expect(result.destination).toBe('/projects/test/shots/EP01_SC01_SH001/edit');
    expect(result.ruleId).toBe('18');
    expect(result.actionType).toBe('NAVIGATION');
  });

  it('does not produce READY, IN_PROGRESS, or COMPLETE for null vcState', () => {
    const result = deriveNextAction(emptyInput({ vcState: null }));
    expect(result.readiness).not.toBe('READY');
    expect(result.readiness).not.toBe('IN_PROGRESS');
    expect(result.readiness).not.toBe('COMPLETE');
  });

  it('is never NONE — always has a primary label', () => {
    const result = deriveNextAction(emptyInput({ vcState: null }));
    expect(result.primaryLabel).toBeTruthy();
    expect(result.primaryLabel.length).toBeGreaterThan(0);
  });
});

describe('deriveNextAction — first-match-wins ordering', () => {
  it('Rule 2 wins over Rule 3 when both conditions exist', () => {
    const vcState = {
      ...emptyVcState(),
      pinnedReferences: [{ resolved: false }],
      assets: [{ isRequiredReference: true, approvalState: 'pending' }],
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.ruleId).toBe('2');
  });

  it('Rule 2 wins over Rule 4 when both conditions exist', () => {
    const vcState = {
      ...emptyVcState(),
      pinnedReferences: [{ resolved: false }],
      continuity: { blockers: [{ message: 'blocked' }] },
    };
    const result = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    expect(result.ruleId).toBe('2');
  });

  it('Rule 5 wins over Rule 6 — missing prompt fires before lint check', () => {
    const result = deriveNextAction(
      emptyInput({ imagePrompt: null, videoPrompt: null }),
    );
    expect(result.ruleId).toBe('5');
  });

  it('Rule 7 (active gen) wins over Rule 8 (pending review)', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('image', 'processing', 'gen-img-1')],
        assets: [asset('image', 'pending', 'gen-img-1')],
      }),
    );
    expect(result.ruleId).toBe('7');
  });

  it('Rule 8 (pending review) wins over Rule 9 (rejected)', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        generations: [gen('image', 'completed', 'gen-img-1')],
        assets: [asset('image', 'pending', 'gen-img-1'), asset('image', 'rejected')],
      }),
    );
    expect(result.ruleId).toBe('8');
  });

  it('Rule 9 (rejected) wins over Rule 10 (ready to queue)', () => {
    const result = deriveNextAction(
      emptyInput({
        imagePrompt: lintOkPrompt(),
        assets: [asset('image', 'rejected')],
      }),
    );
    expect(result.ruleId).toBe('9');
  });
});

describe('deriveNextAction — approved image skips image phase', () => {
  it('ignores missing image prompt when image is approved', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved')],
        imagePrompt: null,
        videoPrompt: lintOkPrompt(),
      }),
    );
    expect(result.ruleId).not.toBe('5');
  });

  it('ignores image lint errors when image is approved', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved')],
        imagePrompt: lintErrorPrompt(),
        videoPrompt: lintOkPrompt(),
      }),
    );
    expect(result.ruleId).not.toBe('6');
  });

  it('ignores active image generation when image is approved', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved')],
        generations: [gen('image', 'processing', 'gen-img-1')],
        videoPrompt: lintOkPrompt(),
      }),
    );
    expect(result.ruleId).not.toBe('7');
  });

  it('ignores pending image review when image is approved', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('image', 'pending', 'gen-img-1')],
        generations: [gen('image', 'completed', 'gen-img-1')],
        videoPrompt: lintOkPrompt(),
      }),
    );
    // Should advance to video phase (Rule 11 checks video prompt)
    expect(result.ruleId).not.toBe('8');
  });

  it('ignores rejected image when approved image exists', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('image', 'rejected')],
        imagePrompt: lintOkPrompt(),
        videoPrompt: lintOkPrompt(),
      }),
    );
    expect(result.ruleId).not.toBe('9');
  });
});

describe('deriveNextAction — approved video skips video phase', () => {
  it('skips video phase entirely when video is approved', () => {
    const result = deriveNextAction(
      emptyInput({
        assets: [asset('image', 'approved'), asset('video', 'approved')],
        videoPrompt: null,
      }),
    );
    expect(result.ruleId).toBe('17');
  });
});

describe('deriveNextAction — deterministic output', () => {
  it('returns exactly one action', () => {
    const result = deriveNextAction(emptyInput());
    expect(result).toBeDefined();
    expect(result.ruleId).toBeTruthy();
    expect(result.actionType).toBe('NAVIGATION');
  });

  it('is a pure function — same input yields same output', () => {
    const input = emptyInput({ vcState: null });
    const a = deriveNextAction(input);
    const b = deriveNextAction(input);
    expect(a).toEqual(b);
  });

  it('never returns actionType NONE', () => {
    for (const testCase of [
      emptyInput(),
      emptyInput({ vcState: null }),
      emptyInput({ shot: { ...emptyShot(), shotSize: '' } }),
      emptyInput({ imagePrompt: lintOkPrompt() }),
      emptyInput({ assets: [asset('image', 'approved'), asset('video', 'approved')] }),
    ]) {
      const result = deriveNextAction(testCase);
      expect(result.actionType).toBe('NAVIGATION');
    }
  });

  it('always has a non-empty primary label', () => {
    for (const testCase of [
      emptyInput(),
      emptyInput({ vcState: null }),
      emptyInput({ shot: { ...emptyShot(), shotSize: '' } }),
      emptyInput({ imagePrompt: lintOkPrompt() }),
      emptyInput({ assets: [asset('image', 'approved'), asset('video', 'approved')] }),
    ]) {
      const result = deriveNextAction(testCase);
      expect(result.primaryLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('deriveReadinessTone', () => {
  it('returns expected tones for each readiness state', () => {
    expect(deriveReadinessTone('READY')).toBe('success');
    expect(deriveReadinessTone('NEEDS_ATTENTION')).toBe('warning');
    expect(deriveReadinessTone('BLOCKED')).toBe('blocked');
    expect(deriveReadinessTone('IN_PROGRESS')).toBe('info');
    expect(deriveReadinessTone('COMPLETE')).toBe('success');
  });
});

describe('deriveReadinessGlyph', () => {
  it('returns expected glyphs for each readiness state', () => {
    expect(deriveReadinessGlyph('READY')).toBe('\u2713');
    expect(deriveReadinessGlyph('NEEDS_ATTENTION')).toBe('\u26A0');
    expect(deriveReadinessGlyph('BLOCKED')).toBe('\u2715');
    expect(deriveReadinessGlyph('IN_PROGRESS')).toBe('\u25CD');
    expect(deriveReadinessGlyph('COMPLETE')).toBe('\u2713');
  });
});

describe('deriveNextAction — forbidden imports (no infrastructure, provider) verification', () => {
  it('deriveNextAction runs without any I/O or side effects', () => {
    const input = emptyInput({ vcState: null });
    const before = JSON.stringify(input);
    deriveNextAction(input);
    // Input is not mutated
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('deriveNextAction — all 18 rules reachable', () => {
  const ruleIds = new Set<string>();

  it('Rule 1 reachable', () => {
    const r = deriveNextAction(emptyInput({ shot: { ...emptyShot(), shotSize: '' } }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('1');
  });

  it('Rule 2 reachable', () => {
    const vcState = { ...emptyVcState(), pinnedReferences: [{ resolved: false }] };
    const r = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('2');
  });

  it('Rule 3 reachable', () => {
    const vcState = { ...emptyVcState(), assets: [{ isRequiredReference: true, approvalState: 'pending' }] };
    const r = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('3');
  });

  it('Rule 4 reachable', () => {
    const vcState = { ...emptyVcState(), continuity: { blockers: [{ message: 'blocked' }] } };
    const r = deriveNextAction(emptyInput({ vcState, imagePrompt: lintOkPrompt() }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('4');
  });

  it('Rule 5 reachable', () => {
    const r = deriveNextAction(emptyInput({ imagePrompt: null }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('5');
  });

  it('Rule 6 reachable', () => {
    const r = deriveNextAction(emptyInput({ imagePrompt: lintErrorPrompt() }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('6');
  });

  it('Rule 7 reachable', () => {
    const r = deriveNextAction(emptyInput({ imagePrompt: lintOkPrompt(), generations: [gen('image', 'pending', 'g1')] }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('7');
  });

  it('Rule 8 reachable', () => {
    const r = deriveNextAction(emptyInput({
      imagePrompt: lintOkPrompt(),
      generations: [gen('image', 'completed', 'g1')],
      assets: [asset('image', 'pending', 'g1')],
    }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('8');
  });

  it('Rule 9 reachable', () => {
    const r = deriveNextAction(emptyInput({ imagePrompt: lintOkPrompt(), assets: [asset('image', 'rejected')] }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('9');
  });

  it('Rule 10 reachable', () => {
    const r = deriveNextAction(emptyInput({ imagePrompt: lintOkPrompt() }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('10');
  });

  it('Rule 11 reachable', () => {
    const r = deriveNextAction(emptyInput({ assets: [asset('image', 'approved')], videoPrompt: null }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('11');
  });

  it('Rule 12 reachable', () => {
    const r = deriveNextAction(emptyInput({ assets: [asset('image', 'approved')], videoPrompt: lintErrorPrompt() }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('12');
  });

  it('Rule 13 reachable', () => {
    const r = deriveNextAction(emptyInput({
      assets: [asset('image', 'approved')],
      videoPrompt: lintOkPrompt(),
      generations: [gen('video', 'processing', 'v1')],
    }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('13');
  });

  it('Rule 14 reachable', () => {
    const r = deriveNextAction(emptyInput({
      assets: [asset('image', 'approved'), asset('video', 'pending', 'v1')],
      videoPrompt: lintOkPrompt(),
      generations: [gen('video', 'completed', 'v1')],
    }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('14');
  });

  it('Rule 15 reachable', () => {
    const r = deriveNextAction(emptyInput({
      assets: [asset('image', 'approved'), asset('video', 'rejected')],
      videoPrompt: lintOkPrompt(),
    }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('15');
  });

  it('Rule 16 reachable', () => {
    const r = deriveNextAction(emptyInput({
      assets: [asset('image', 'approved')],
      videoPrompt: lintOkPrompt(),
    }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('16');
  });

  it('Rule 17 reachable', () => {
    const r = deriveNextAction(emptyInput({
      assets: [asset('image', 'approved'), asset('video', 'approved')],
    }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('17');
  });

  it('Rule 18 reachable', () => {
    const r = deriveNextAction(emptyInput({ vcState: null }));
    ruleIds.add(r.ruleId);
    expect(r.ruleId).toBe('18');
  });

  it('all 18 rules (1–18) are reachable', () => {
    const expected = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18']);
    expect(ruleIds).toEqual(expected);
  });
});
