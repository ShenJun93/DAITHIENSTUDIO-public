import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('Constrained node workflow UI', () => {
  it('announces save/delete state and exposes labelled toolbars', async () => {
    const canvas = await source('src/app/projects/[slug]/workflow/NodeCanvasWrapper.tsx');
    expect(canvas).toContain('aria-label="Add nodes"');
    expect(canvas).toContain('aria-label="Workflow actions"');
    expect(canvas).toContain('aria-busy={saving}');
    expect(canvas).toContain('aria-busy={deleting}');
    expect(canvas).toContain("role={messageIsError ? 'alert' : 'status'}");
    expect(canvas).toContain('aria-label="Add connection without dragging"');
    expect(canvas).toContain('aria-label="Connection source node"');
    expect(canvas).toContain('aria-label="Connection target node"');
  });

  it('renders empty, populated and locked workflow states', async () => {
    const [page, canvas] = await Promise.all([
      source('src/app/projects/[slug]/workflow/page.tsx'),
      source('src/app/projects/[slug]/workflow/NodeCanvasWrapper.tsx'),
    ]);
    expect(page).toContain('title="No workflows yet"');
    expect(page).toContain('graphs.map((graph)');
    expect(page).toContain("graph.status === 'locked'");
    expect(canvas).toContain('{locked &&');
    expect(canvas).toContain('A workflow can contain at most 50 nodes.');
  });
});
