import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const galleryPage = readFileSync('src/app/dev/design-gallery/page.tsx', 'utf8');
const rootLayout = readFileSync('src/app/layout.tsx', 'utf8');
const projectLayout = readFileSync('src/app/projects/[slug]/layout.tsx', 'utf8');

describe('development-only component gallery', () => {
  it('returns 404 outside development (NODE_ENV=production guard)', () => {
    expect(galleryPage).toContain("process.env.NODE_ENV === 'production'");
    expect(galleryPage).toContain('notFound()');
  });

  it('is marked non-indexable', () => {
    expect(galleryPage).toContain('robots:');
    expect(galleryPage).toContain('index: false');
  });

  it('is not linked from the global navigation', () => {
    expect(rootLayout).not.toContain('/dev/design-gallery');
    expect(rootLayout).not.toContain('Design Gallery');
  });

  it('is not linked from project workspace navigation', () => {
    expect(projectLayout).not.toContain('/dev/design-gallery');
    expect(projectLayout).not.toContain('Design Gallery');
  });

  it('demonstrates every shipped primitive and motion wrapper named in the design docs', () => {
    for (const componentImport of [
      'Skeleton',
      'Separator',
      'AnimatedMetric',
      'LoadingShimmer',
      'ProgressTransition',
      'SectionReveal',
      'StatusPulse',
    ]) {
      expect(galleryPage, `gallery does not reference ${componentImport}`).toContain(componentImport);
    }
  });

  it('renders no production data — only literal example strings and known status keys', () => {
    expect(galleryPage).not.toContain('getStudio(');
    expect(galleryPage).not.toContain('@/infrastructure');
  });
});
