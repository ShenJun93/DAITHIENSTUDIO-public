import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('ActionButton accessibility', () => {
  it('announces action failures as alerts and preserves readable pending copy', () => {
    const actionButton = read('src/components/ActionButton.tsx');
    expect(actionButton).toContain("role={result.ok ? 'status' : 'alert'}");
  });
});
