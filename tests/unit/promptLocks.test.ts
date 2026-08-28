import { describe, expect, it } from 'vitest';
import { applyLocks, compileBlocks, emptyBlocks } from '@/domain/prompt/compile';
import { lintPrompt } from '@/domain/prompt/lint';
import type { CharacterSnapshot, LocationSnapshot, StyleSnapshot } from '@/domain/prompt/locks';

const character: CharacterSnapshot = {
  id: 'char_1',
  code: 'CHAR001',
  version: 2,
  name: 'Triệu Ngốc',
  role: 'protagonist',
  identity: { hair: 'messy black', eyes: 'dark brown', bodyType: 'thin', distinguishingMarks: ['dark circles'] },
  variable: { costume: 'faded green robe', accessories: ['wooden sword'] },
  promptToken: 'Trieu Ngoc',
  negativePrompt: 'muscular build',
  forbiddenChanges: ['faded green robe'],
  colorPalette: ['#4F6B4A'],
  voiceProfileId: null,
  lockEnabled: true,
  status: 'approved',
};

const style: StyleSnapshot = {
  id: 'sty_1',
  code: 'STY001',
  version: 1,
  name: 'Stylized 3D Cinematic Comedy',
  category: 'stylized-3d',
  details: {},
  promptBlock: 'stylized cinematic 3D, soft global illumination',
  negativeStyleRules: 'photorealistic pores',
  status: 'approved',
};

const location: LocationSnapshot = {
  id: 'loc_1',
  code: 'LOC001',
  version: 3,
  name: 'Glowing cave',
  type: 'interior',
  era: '',
  details: { lighting: 'blue crystal glow' },
  promptBlock: 'a glowing cultivation cave',
  negativePrompt: 'warm torchlight',
  colorPalette: [],
  continuityNotes: '',
  status: 'approved',
};

const context = {
  kind: 'image' as const,
  characters: [character],
  style,
  location,
  props: [],
  applyCharacterLock: true,
  applyStyleLock: true,
  applyLocationLock: true,
};

describe('prompt locks', () => {
  it('Character Lock injects identity traits and pins the bible version', () => {
    const result = applyLocks({ subject: 'a man', action: 'meditates' }, context);

    expect(result.compiled).toContain('Trieu Ngoc');
    expect(result.compiled).toContain('CHAR001 v2');
    expect(result.compiled).toContain('faded green robe');
    expect(result.compiled).toContain('keep unchanged');
    expect(result.lockRefs.characters[0]).toEqual({ id: 'char_1', code: 'CHAR001', version: 2 });
    expect(result.lockRefs.style).toEqual({ id: 'sty_1', code: 'STY001', version: 1 });
    expect(result.lockRefs.location).toEqual({ id: 'loc_1', code: 'LOC001', version: 3 });
  });

  it('Locks cannot be overridden by a hand-edited block', () => {
    const result = applyLocks({ characterIdentity: 'a completely different person', action: 'stands' }, context);
    expect(result.compiled).toContain('Trieu Ngoc');
    expect(result.compiled).not.toContain('a completely different person');
  });

  it('Negative rules from every locked entity are merged and de-duplicated', () => {
    const result = applyLocks({ negativePrompt: 'muscular build, blurry' }, context);
    const occurrences = result.negative.toLowerCase().split('muscular build').length - 1;
    expect(occurrences).toBe(1);
    expect(result.negative).toContain('photorealistic pores');
    expect(result.negative).toContain('warm torchlight');
  });

  it('Compiling the same blocks twice produces the same prompt', () => {
    const a = applyLocks({ subject: 'x', action: 'y' }, context);
    const b = applyLocks({ subject: 'x', action: 'y' }, context);
    expect(a.compiled).toBe(b.compiled);
  });

  it('A video prompt keeps motion blocks that an image prompt drops', () => {
    const blocks = { ...emptyBlocks(), subject: 'x', action: 'y', motion: 'hair drifts', cameraMovement: 'slow push-in' };
    expect(compileBlocks(blocks, 'image')).not.toContain('hair drifts');
    expect(compileBlocks(blocks, 'video')).toContain('hair drifts');
  });
});

describe('prompt linter', () => {
  const baseContext = {
    kind: 'image' as const,
    hasCharactersInShot: true,
    characterLockApplied: true,
    styleLockApplied: true,
    locationLockApplied: true,
    shotHasLocation: true,
    requiresContinuity: false,
  };

  it('Block a prompt that has no action', () => {
    const blocks = { ...emptyBlocks(), subject: 'a man', shotSize: 'medium', negativePrompt: 'blurry' };
    const result = lintPrompt(blocks, compileBlocks(blocks, 'image'), baseContext);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.rule === 'action-missing')).toBe(true);
  });

  it('Block a prompt that names a protected studio style', () => {
    const blocks = { ...emptyBlocks(), subject: 'a man', action: 'walks', shotSize: 'wide', visualStyle: 'in the style of Pixar' };
    const result = lintPrompt(blocks, compileBlocks(blocks, 'image'), baseContext);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.rule === 'restricted-style-reference')).toBe(true);
  });

  it('Allow soft global illumination without flagging it as a studio name', () => {
    const blocks = {
      ...emptyBlocks(),
      subject: 'a man',
      action: 'walks',
      shotSize: 'wide',
      visualStyle: 'stylized cinematic 3D, soft global illumination',
      negativePrompt: 'blurry',
    };
    const result = lintPrompt(blocks, compileBlocks(blocks, 'image'), baseContext);
    expect(result.issues.some((issue) => issue.rule === 'restricted-style-reference')).toBe(false);
  });

  it('Block a prompt with contradictory instructions', () => {
    const blocks = {
      ...emptyBlocks(),
      subject: 'a man',
      action: 'walks',
      shotSize: 'close-up',
      composition: 'wide shot of the valley',
      negativePrompt: 'blurry',
    };
    const result = lintPrompt(blocks, compileBlocks(blocks, 'image'), baseContext);
    expect(result.issues.some((issue) => issue.rule === 'contradiction')).toBe(true);
  });

  it('Block a video prompt that describes no motion', () => {
    const blocks = { ...emptyBlocks(), subject: 'a man', action: 'stands', shotSize: 'medium', negativePrompt: 'blurry' };
    const result = lintPrompt(blocks, compileBlocks(blocks, 'video'), { ...baseContext, kind: 'video' });
    expect(result.issues.some((issue) => issue.rule === 'motion-missing')).toBe(true);
  });

  it('Block a prompt for a shot with characters when Character Lock was not applied', () => {
    const blocks = { ...emptyBlocks(), subject: 'a man', action: 'walks', shotSize: 'wide', negativePrompt: 'blurry' };
    const result = lintPrompt(blocks, compileBlocks(blocks, 'image'), { ...baseContext, characterLockApplied: false });
    expect(result.issues.some((issue) => issue.rule === 'character-lock-missing')).toBe(true);
  });
});
