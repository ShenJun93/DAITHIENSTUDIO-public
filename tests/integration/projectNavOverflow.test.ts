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
    usePathname: () => '/projects/test',
    useSearchParams: () => ({ toString: () => '', get: () => null }),
    notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  };
});
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const env = useTempStudio('projectNavOverflow');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);

let projectSlug = '';

beforeAll(async () => {
  runMigrations();

  const project = await projects.create({
    title: 'Nav Overflow Test',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: 'no-such-preset',
  });
  projectSlug = project.slug;

  await scripts.saveScript(projectSlug, { title: 'Main', scriptType: 'motion-comic', raw: DEMO_SCRIPT });
  await scripts.parseIntoScenes(projectSlug);
  await scripts.buildShots(projectSlug);
});

afterAll(() => {
  env.cleanup();
});

describe('TASK-FIX-PROJECT-NAV-OVERFLOW-001 — project layout integration', () => {
  it('renders project layout with every non-Workflow nav destination in Guided Mode', async () => {
    const { default: ProjectLayout } = await import('@/app/projects/[slug]/layout');
    const element = await ProjectLayout({
      children: React.createElement('div', null, 'page content'),
      params: Promise.resolve({ slug: projectSlug }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('aria-label="Project workspace"');
    expect(html).toContain('overflow-x-auto');

    const expectedLinks = [
      'Overview', 'Characters', 'Locations', 'Scenes', 'Storyboard',
      'Story', 'Script', 'Bibles',
      'Shots', 'Assets', 'Production', 'Voice', 'Sound',
      'Continuity', 'Queue', 'Timeline &amp; Export',
    ];
    for (const label of expectedLinks) {
      expect(html, `rendered nav missing "${label}"`).toContain(label);
    }
    expect(html).not.toContain('>Workflow<');
  });

  it('IA1 Shot Inspector route renders under the project layout without regression', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const sceneShots = await studio.shots.listByProject(
      (await projects.get(projectSlug))!.id,
    );
    expect(sceneShots.length).toBeGreaterThan(0);
    const shotCode = sceneShots[0]!.code;

    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('Overview');
    expect(html).toContain('References');
    expect(html).toContain('Prompts');
    expect(html).toContain('Visual Control');
    expect(html).toContain('Generations');
    expect(html).toContain('Technical');
  });

  it('IA2 Overview content renders within the project layout', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const sceneShots = await studio.shots.listByProject(
      (await projects.get(projectSlug))!.id,
    );
    const shotCode = sceneShots[0]!.code;

    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'overview' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Shot brief');
    expect(html).toContain('Next action');
  });

  it('no new route is introduced by the layout', async () => {
    const { default: ProjectLayout } = await import('@/app/projects/[slug]/layout');
    const element = await ProjectLayout({
      children: React.createElement('div', null, 'page content'),
      params: Promise.resolve({ slug: projectSlug }),
    });
    const html = renderToStaticMarkup(element);

    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    const projectHrefs = hrefs.filter((h) => h!.startsWith(`/projects/${projectSlug}`));
    const knownSegments = [
      '', '/workspace/characters', '/workspace/locations', '/workspace/scenes', '/workspace/shots',
      '/story', '/script', '/bibles',
      '/scenes', '/shots', '/assets', '/production', '/voice', '/sound',
      '/continuity', '/advisory', '/queue', '/workflow', '/export',
    ];
    for (const href of projectHrefs) {
      const segment = href!.replace(`/projects/${projectSlug}`, '');
      expect(knownSegments, `unexpected route segment "${segment}"`).toContain(segment);
    }
  });

  it('Shot Inspector tab structure is not modified by this task', async () => {
    const { readFileSync } = await import('node:fs');
    const shotPage = readFileSync('src/app/projects/[slug]/shots/[code]/page.tsx', 'utf8');
    expect(shotPage).toContain('ShotInspectorTabs');
    expect(shotPage).toContain('parseTab');
    expect(shotPage).not.toContain('aria-label="Project workspace"');
  });
});
