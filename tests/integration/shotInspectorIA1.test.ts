import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_SCRIPT, useTempStudio } from '../helpers/studio';

Object.assign(globalThis, { React });

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined, refresh: () => undefined }),
    usePathname: () => '/projects/test/shots/TEST',
    useSearchParams: () => ({ toString: () => '', get: () => null }),
  };
});
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const env = useTempStudio('shotInspectorIA1');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createPromptService } = await import('@/application/services/promptService');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);
const prompts = createPromptService(studio);

let projectSlug = '';
let shotCode = '';

beforeAll(async () => {
  runMigrations();

  const project = await projects.create({
    title: 'IA1 Test Project',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: 'no-such-preset',
  });
  projectSlug = project.slug;

  await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(projectSlug);
  await scripts.buildShots(projectSlug);

  const sceneShots = await studio.shots.listByProject(project.id);
  expect(sceneShots.length).toBeGreaterThan(0);
  shotCode = sceneShots[0]!.code;
});

afterAll(() => {
  env.cleanup();
});

describe('ShotInspectorIA1 — tab shell', () => {
  it('renders all six tab navigation options', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Overview');
    expect(html).toContain('References');
    expect(html).toContain('Prompts');
    expect(html).toContain('Visual Control');
    expect(html).toContain('Generations');
    expect(html).toContain('Technical');
  });

  it('defaults to Overview tab when no tab param is provided', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('aria-selected="true"');
    const selectedTabs = [...html.matchAll(/aria-selected="true"/g)];
    expect(selectedTabs).toHaveLength(1);
    expect(html).toContain('Shot brief');
    expect(html).toContain('Next action');
  });

  it('selects the valid deep-linked tab', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'prompts' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('role="tab"');
    expect(html).toContain('Image prompt');
  });

  it('falls back to Overview for invalid tab values', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'nonexistent' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Shot brief');
    expect(html).toContain('Next action');
    expect(html).not.toContain('Prompt Studio');
  });

  it('falls back to Overview for empty tab value', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: '' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Shot brief');
    expect(html).toContain('Next action');
  });

  it('supports valid tab selection for all six values', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');

    const validTabs = ['overview', 'references', 'prompts', 'visual-control', 'generations', 'technical'];
    for (const tab of validTabs) {
      const element = await ShotPage({
        params: Promise.resolve({ slug: projectSlug, code: shotCode }),
        searchParams: Promise.resolve({ tab }),
      });
      const html = renderToStaticMarkup(element);
      expect(html).toContain('role="tabpanel"');
    }
  });

  it('does not add any new route', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain('/shots/tab');
    expect(html).not.toContain('/shots/overview');
    expect(html).not.toContain('/shots/references');
    expect(html).not.toContain('/shots/prompts');
  });
});

describe('ShotInspectorIA1 — persistent header', () => {
  it('renders the shot code as the page heading', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(`<h1`);
    expect(html).toContain(shotCode);
  });

  it('renders the header on every tab', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const validTabs = ['overview', 'references', 'prompts', 'visual-control', 'generations', 'technical'];

    for (const tab of validTabs) {
      const element = await ShotPage({
        params: Promise.resolve({ slug: projectSlug, code: shotCode }),
        searchParams: Promise.resolve({ tab }),
      });
      const html = renderToStaticMarkup(element);
      expect(html).toContain(shotCode);
      expect(html).toContain('Shot list');
    }
  });

  it('renders edit and delete actions', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Edit shot');
    expect(html).toContain('Delete shot');
  });

  it('renders previous/next shot navigation', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toMatch(/Prev|Next/);
  });
});

describe('ShotInspectorIA1 — content reachability', () => {
  it('exposes IA2 Shot brief and Next action content under the Overview tab', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'overview' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Shot brief');
    expect(html).not.toContain('Cast, pinned to bible snapshots');
    expect(html).not.toContain('Continuity in');
  });

  it('exposes References content under the References tab', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'references' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('shot-tabpanel-references');
  });

  it('exposes Prompts content under the Prompts tab', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'prompts' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Image prompt');
  });

  it('exposes Visual Control content under the Visual Control tab', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'visual-control' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('shot-tabpanel-visual-control');
  });

  it('exposes Generations content under the Generations tab', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'generations' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Generations');
    expect(html).toContain('Assets');
  });

  it('exposes Technical content under the Technical tab', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'technical' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('shot-tabpanel-technical');
    expect(html).toContain('Continuity environment');
    expect(html).toContain('Continuity findings');
  });
});

describe('ShotInspectorIA1 — no-mutation proof', () => {
  it('does not mutate any persisted record during tab navigation', async () => {
    const project = await projects.get(projectSlug);
    const beforeShots = await studio.shots.listByProject(project.id);
    const beforeAssets = await studio.assets.list(project.id);
    const beforeActivity = await studio.activity.recent(project.id, 100);

    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const validTabs = ['overview', 'references', 'prompts', 'visual-control', 'generations', 'technical'];
    for (const tab of validTabs) {
      const element = await ShotPage({
        params: Promise.resolve({ slug: projectSlug, code: shotCode }),
        searchParams: Promise.resolve({ tab }),
      });
      renderToStaticMarkup(element);
    }

    const afterShots = await studio.shots.listByProject(project.id);
    const afterAssets = await studio.assets.list(project.id);
    const afterActivity = await studio.activity.recent(project.id, 100);

    expect(afterShots).toEqual(beforeShots);
    expect(afterAssets).toEqual(beforeAssets);
    expect(afterActivity).toEqual(beforeActivity);
  });
});

describe('ShotInspectorIA1 — zero-credit proof', () => {
  it('does not enqueue any generation jobs during tab navigation', async () => {
    const project = await projects.get(projectSlug);
    const beforeGenerations = await studio.generations.listByProject(project.id);

    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const validTabs = ['overview', 'references', 'prompts', 'visual-control', 'generations', 'technical'];
    for (const tab of validTabs) {
      const element = await ShotPage({
        params: Promise.resolve({ slug: projectSlug, code: shotCode }),
        searchParams: Promise.resolve({ tab }),
      });
      renderToStaticMarkup(element);
    }

    const afterGenerations = await studio.generations.listByProject(project.id);
    expect(afterGenerations).toEqual(beforeGenerations);
  });
});

describe('ShotInspectorIA1 — accessibility roles', () => {
  it('renders WAI-ARIA tab pattern roles', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected');
    expect(html).toContain('aria-controls');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby');
  });

  it('has stable tab and panel IDs', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    for (const tab of ['overview', 'references', 'prompts', 'visual-control', 'generations', 'technical']) {
      expect(html).toContain(`id="shot-tab-${tab}"`);
      expect(html).toContain(`id="shot-tabpanel-${tab}"`);
    }
  });

  it('selected state is not conveyed by color alone', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('aria-selected="true"');
  });
});
