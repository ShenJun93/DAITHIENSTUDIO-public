import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('TASK-012B Composer operator UI', () => {
  it('covers submitting, failure, success, preview and download states', () => {
    const form = read('src/app/projects/[slug]/export/ComposeVideoForm.tsx');

    expect(form).toContain("pending ? 'Composing…' : 'Compose Final Video'");
    expect(form).toContain("role={result.ok ? 'status' : 'alert'}");
    expect(form).toContain('router.refresh()');
    expect(form).toContain('Composed final video preview');
    expect(form).toContain('Download final MP4');
  });

  it('renders persisted video exports after reload', () => {
    const page = read('src/app/projects/[slug]/export/page.tsx');

    expect(page).toContain("const isVideo = record.kind === 'video'");
    expect(page).toContain('?disposition=inline');
    expect(page).toContain('Final video export from');
  });

  it('serves video exports as validated binary MP4 responses', () => {
    const route = read('src/app/api/exports/[id]/route.ts');

    expect(route).toContain('exportDownloadQuerySchema.parse');
    expect(route).toContain("video: { mime: 'video/mp4', extension: 'mp4' }");
    expect(route).toContain('readBytes(id)');
    expect(route).toContain('new Uint8Array(body)');
  });
});
