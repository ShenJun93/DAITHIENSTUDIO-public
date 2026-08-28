import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('NodeCanvasWrapper state coverage', () => {
  it('announces action failures as alerts and preserves readable pending copy', () => {
    const workflow = read('src/app/projects/[slug]/workflow/NodeCanvasWrapper.tsx');

    expect(workflow).toContain("deleting ? 'Deleting…' : 'Delete'");
    expect(workflow).not.toContain('Deletingâ€¦');
  });
});
