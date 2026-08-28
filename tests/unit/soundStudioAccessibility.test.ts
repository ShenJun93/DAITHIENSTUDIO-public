import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('Sound Studio Accessibility', () => {
  it('scopes Sound Studio shortcuts to the labelled timeline region', async () => {
    const soundStudio = await source('src/components/SoundStudio.tsx');

    expect(soundStudio).toContain('aria-label="Audio mix timeline"');
    expect(soundStudio).toContain('onKeyDown={handleKeyDown}');
    expect(soundStudio).toContain('aria-pressed={isSelected}');
    expect(soundStudio).not.toContain("window.addEventListener('keydown'");
  });
});
