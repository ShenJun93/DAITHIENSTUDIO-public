import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('TASK-017C Sound Studio operator UI', () => {
  it('exposes persisted add, reorder, trim, gain and mute controls', () => {
    const page = read('src/app/projects/[slug]/sound/page.tsx');
    const studio = read('src/components/SoundStudio.tsx');

    expect(page).toContain('getMixForEpisode(activeEpisode.id)');
    expect(page).toContain('saveAudioMixAction.bind');
    expect(studio).toContain('addTrack(asset)');
    expect(studio).toContain('moveTrack(selectedTrack.id, -1)');
    expect(studio).toContain('durationSeconds');
    expect(studio).toContain('gainDb');
    expect(studio).toContain('muted: !selectedTrack.muted');
  });
});
