import { describe, expect, it } from 'vitest';
import { parseScript } from '@/domain/scriptParser';
import { DEMO_SCRIPT } from '../helpers/studio';

describe('script parser', () => {
  it('Parse a Vietnamese script into scenes, characters and dialogue', () => {
    const result = parseScript(DEMO_SCRIPT);

    expect(result.scenes).toHaveLength(3);
    expect(result.scenes[0]?.timeOfDay).toBe('night');
    expect(result.scenes[1]?.timeOfDay).toBe('day');
    expect(result.scenes[0]?.locationName.toLowerCase()).toContain('hang');
    expect(result.characterNames.length).toBeGreaterThanOrEqual(2);

    const firstLine = result.scenes[0]?.dialogue[0];
    expect(firstLine?.characterName.toLowerCase()).toContain('triệu');
    expect(firstLine?.emotion).toBe('bực bội');
    expect(firstLine?.text).toContain('thiên tài');
  });

  it('Parsing the same script twice produces identical output', () => {
    expect(parseScript(DEMO_SCRIPT)).toEqual(parseScript(DEMO_SCRIPT));
  });

  it('Report a warning when the script has no scene heading', () => {
    const result = parseScript('Chỉ là một đoạn văn không có tiêu đề cảnh.');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.scenes).toHaveLength(1);
  });

  it('Support English INT and EXT scene headings', () => {
    const result = parseScript('INT. CAVE - NIGHT\n\nA man sits.\n\nHERO: Hello.\n\nEXT. PATH - DAY\n\nHe walks.');
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes[0]?.timeOfDay).toBe('night');
    expect(result.scenes[1]?.timeOfDay).toBe('day');
  });
});
