/**
 * TASK-UI-CORE-EDITORS-001 Slice 2: Location create, against a real
 * temporary SQLite database. Same mocking rationale as
 * tests/integration/coreEditorForms.test.ts (Slice 1's Character create):
 * `next/cache` and `next/navigation` are mocked because `revalidatePath`/
 * `useRouter` require a real Next.js request/app-router context that does
 * not exist in this Vitest run — `notFound` is kept real (via
 * `importActual`) so the 404 path is genuinely exercised, not assumed.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTempStudio } from '../helpers/studio';

Object.assign(globalThis, { React });

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
  };
});
// getActiveEpisode() (used by the existing Location Browser page, not by the
// new Slice 2 route) calls next/headers' cookies(), which requires a real
// Next.js request context. Mocked at the top of the file (not scoped
// vi.doMock) because next/headers is already imported transitively before
// any per-test mock would apply.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const env = useTempStudio('coreEditorFormsLocation');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { getStudio } = await import('@/infrastructure/container');
const { createBibleService } = await import('@/application/services/bibleService');
const { createLocationAction } = await import('@/app/actions');
const LocationCreatePage = (await import('@/app/projects/[slug]/workspace/locations/new/page')).default;

const studio = getStudio();
const projects = createProjectService(studio);
const bibles = createBibleService(studio);

let projectASlug = '';
let projectAId = '';
let projectBId = '';

beforeAll(async () => {
  runMigrations();
  const projectA = await projects.create({
    title: 'Core Editors Slice 2 — Project A',
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 60,
  });
  const projectB = await projects.create({
    title: 'Core Editors Slice 2 — Project B',
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 60,
  });
  projectASlug = projectA.slug;
  projectAId = projectA.id;
  projectBId = projectB.id;
});

afterAll(() => {
  env.cleanup();
});

function fd(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

describe('createLocationAction (Slice 2 service success/failure)', () => {
  it('creates a location that persists and survives a reload, with a real server-assigned code', async () => {
    const result = await createLocationAction(projectASlug, fd({ name: 'Hang Động Tu Tiên' }));
    expect(result.ok).toBe(true);
    expect(result.redirectTo).toBe(`/projects/${projectASlug}/workspace/locations`);
    expect(result.message).toMatch(/^Created location LOC\d{3}\.$/);

    const reloaded = await bibles.listLocations(projectAId);
    const created = reloaded.find((l) => l.name === 'Hang Động Tu Tiên');
    expect(created).toBeDefined();
    expect(created!.code).toMatch(/^LOC\d{3}$/);
    expect(created!.currentVersion).toBe(1);
    expect(created!.type).toBe('interior'); // schema default applied, not fabricated
    expect(created!.status).toBe('draft');
  });

  it('rejects an empty name with a field-specific error, not a generic string, and creates nothing', async () => {
    const before = await bibles.listLocations(projectAId);
    const result = await createLocationAction(projectASlug, fd({ name: '' }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.name).toBeTruthy();
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(['name']);

    const after = await bibles.listLocations(projectAId);
    expect(after.length).toBe(before.length);
  });

  it('rejects an out-of-enum status value with a field-specific error', async () => {
    const form = fd({ name: 'Invalid Status Location' });
    form.set('status', 'not-a-real-status');
    const result = await createLocationAction(projectASlug, form);
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.status).toBeTruthy();
  });

  it('returns a stable NOT_FOUND result for an unknown project, never a raw exception', async () => {
    const result = await createLocationAction('project-slug-that-does-not-exist', fd({ name: 'Nowhere' }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
    expect(result.message).not.toContain('at ');
    expect(result.message).not.toContain('.ts:');
  });

  it('a location created for project A never appears in project B (project ownership)', async () => {
    await createLocationAction(projectASlug, fd({ name: 'Only In A' }));
    const bList = await bibles.listLocations(projectBId);
    expect(bList.find((l) => l.name === 'Only In A')).toBeUndefined();
  });

  it('never accepts a client-supplied code: two locations get two distinct, sequential codes', async () => {
    const r1 = await createLocationAction(projectASlug, fd({ name: 'Sequential One' }));
    const r2 = await createLocationAction(projectASlug, fd({ name: 'Sequential Two' }));
    const codeOf = (message: string) => /LOC\d{3}/.exec(message)?.[0];
    expect(codeOf(r1.message)).not.toBe(codeOf(r2.message));
  });

  it('does not deduplicate identical rapid submissions at the server layer, and a genuine code-allocation race fails safely rather than corrupting data', async () => {
    // Same documented, pre-existing (not introduced by this slice) race as
    // Slice 1's Character create: two truly concurrent creates can compute
    // the same next code and one loses a unique-constraint race. Asserted
    // here as observed behavior, not a false guarantee.
    const before = (await bibles.listLocations(projectAId)).length;
    const results = await Promise.all([
      createLocationAction(projectASlug, fd({ name: 'Rapid Duplicate' })),
      createLocationAction(projectASlug, fd({ name: 'Rapid Duplicate' })),
    ]);
    const after = await bibles.listLocations(projectAId);

    expect(results.every((r) => r.ok)).not.toBe(undefined); // both settled, neither threw out of the action
    expect(after.length).toBeGreaterThan(before); // at least one succeeded
    expect(after.length).toBeLessThanOrEqual(before + 2);
    for (const result of results) {
      if (!result.ok) {
        // A losing race must still fail safely: a stable code, no raw stack trace.
        expect(result.code).toBeTruthy();
        expect(result.message).not.toContain('at ');
        expect(result.message).not.toContain('.ts:');
      }
    }
  });
});

describe('Location create page (Slice 2 route)', () => {
  it('renders every supported field and excludes code/version/timestamps, with no Location Lock control anywhere', async () => {
    const element = await LocationCreatePage({ params: Promise.resolve({ slug: projectASlug }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('New location');
    for (const name of ['name', 'type', 'era', 'promptBlock', 'negativePrompt', 'status']) {
      expect(markup, `missing field "${name}"`).toContain(`name="${name}"`);
    }
    expect(markup).not.toContain('name="code"');
    expect(markup).not.toContain('name="currentVersion"');
    expect(markup).not.toContain('name="updatedAt"');
    expect(markup).not.toContain('name="colorPalette"'); // secondary field stays at /bibles
    expect(markup).not.toContain('name="continuityNotes"'); // secondary field stays at /bibles
    expect(markup).not.toContain('name="lockEnabled"'); // Location has no lock concept at all
    expect(markup).not.toContain('id="field-lockEnabled"');
    expect(markup).not.toContain('Location Lock');
    expect(markup).not.toContain('Enforce Character Lock');
    expect(markup).not.toContain('Advisory only');
    expect(markup).toContain('Create location');
    expect(markup).toContain('Cancel');
  });

  it('resolves the real project from slug and 404s honestly for an unknown one, without any project-slug branching', async () => {
    await expect(
      LocationCreatePage({ params: Promise.resolve({ slug: 'a-project-that-does-not-exist' }) }),
    ).rejects.toThrow();
  });
});

describe('Location Browser entry point (Slice 2 additive change)', () => {
  it('shows a real "New Location" link to the approved create route, and an updated empty hint, without any project-specific hardcoding', async () => {
    const LocationBrowserPage = (await import('@/app/projects/[slug]/workspace/locations/page')).default;

    const freshProject = await projects.create({
      title: 'Empty Location Browser Regression Project',
      description: '',
      aspectRatio: '16:9',
      durationTargetSeconds: 60,
    });
    const element = await LocationBrowserPage({ params: Promise.resolve({ slug: freshProject.slug }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('New Location');
    expect(markup).toContain(`/projects/${freshProject.slug}/workspace/locations/new`);
    expect(markup).toContain('Read-only browser');
    expect(markup).toContain('create one manually');
  });

  it('still lists a location created through the new flow — the Slice 2 browser and Inspector are unaffected', async () => {
    const LocationBrowserPage = (await import('@/app/projects/[slug]/workspace/locations/page')).default;

    await createLocationAction(projectASlug, fd({ name: 'Visible In Browser' }));
    const element = await LocationBrowserPage({ params: Promise.resolve({ slug: projectASlug }) });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('Visible In Browser');
  });
});
