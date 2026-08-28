import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('NodeCanvasWrapper accessibility', () => {
  it('announces workflow save and delete outcomes', async () => {
    const workflow = await source('src/app/projects/[slug]/workflow/NodeCanvasWrapper.tsx');

    expect(workflow).toContain('aria-busy={saving}');
    expect(workflow).toContain('aria-busy={deleting}');
    expect(workflow).toContain("role={messageIsError ? 'alert' : 'status'}");
  });
});
