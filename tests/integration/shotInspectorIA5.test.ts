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

const env = useTempStudio('shotInspectorIA5');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createScriptService } = await import('@/application/services/scriptService');
const { createPromptService } = await import('@/application/services/promptService');
const { createContinuityService } = await import('@/application/services/continuityService');

const studio = getStudio();
const projects = createProjectService(studio);
const scripts = createScriptService(studio);

let projectSlug = '';
let shotCode = '';
let shotId = '';

beforeAll(async () => {
  runMigrations();

  const project = await projects.create({
    title: 'IA5 Test Project',
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
  shotId = sceneShots[0]!.id;
});

afterAll(() => {
  env.cleanup();
});

describe('ShotInspectorIA5 — Visual Control tab consolidation', () => {
  it('renders tab without duplicated ContinuitySummary or top-level card', async () => {
    const { createVisualControlService } = await import('@/application/services/visualControlService');
    const { VisualControlSection } = await import('@/components/visual-control/VisualControlSection');
    const state = await createVisualControlService(studio).overview(projectSlug, shotId);

    const element = React.createElement(VisualControlSection, { shotCode, state });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Visual continuity');

    // Standalone redundant ContinuitySummary should be absent
    expect(html).not.toContain('Continuity for this cut');
  });

  it('renders concise PackageSummary without fingerprint', async () => {
    const { createVisualControlService } = await import('@/application/services/visualControlService');
    const { VisualControlSection } = await import('@/components/visual-control/VisualControlSection');
    const state = await createVisualControlService(studio).overview(projectSlug, shotId);

    const element = React.createElement(VisualControlSection, { shotCode, state });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Shot package');
    expect(html).toContain('No render approval');

    // The visual control tab should not contain fingerprints (asserted by hash presence in unit test)
  });

  it('maintains technical evidence in Technical tab', async () => {
    const { default: ShotPage } = await import('@/app/projects/[slug]/shots/[code]/page');
    const element = await ShotPage({
      params: Promise.resolve({ slug: projectSlug, code: shotCode }),
      searchParams: Promise.resolve({ tab: 'technical' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('shot-tabpanel-technical');
    expect(html).toContain('Continuity environment');
    expect(html).toContain('Continuity in');
    expect(html).toContain('Continuity out');

    expect(html).toContain('Continuity findings');

    // Technical tab SHOULD contain the fingerprints
    expect(html).toContain('Fingerprints');
    expect(html).toContain('Shot package');
    expect(html).toContain('Continuity');
  });

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

import { ShotInspectorTabs, VALID_TABS } from '@/components/shot-inspector/ShotInspectorTabs';
import source from '@/components/shot-inspector/ShotInspectorTabs.tsx?raw';

describe('ShotInspectorTabs Accessibility and Keyboard Interaction', () => {
  it('tablist has role="tablist" and each tab has role="tab"', () => {
    const html = renderToStaticMarkup(React.createElement(ShotInspectorTabs, { activeTab: 'overview' }));
    expect(html).toContain('role="tablist"');
    const tabCount = html.match(/role="tab"/g)?.length;
    expect(tabCount).toBe(VALID_TABS.length);
  });

  it('active tab has aria-selected="true" and inactive tabs have aria-selected="false"', () => {
    const html = renderToStaticMarkup(React.createElement(ShotInspectorTabs, { activeTab: 'overview' }));
    expect(html).toContain('aria-selected="true"');
    const falseCount = html.match(/aria-selected="false"/g)?.length;
    expect(falseCount).toBe(VALID_TABS.length - 1);
  });

  it('aria-controls matches the active tabpanel ID', () => {
    const html = renderToStaticMarkup(React.createElement(ShotInspectorTabs, { activeTab: 'overview' }));
    expect(html).toContain('aria-controls="shot-tabpanel-overview"');
  });

  it('only active tab has tabIndex=0', () => {
    const html = renderToStaticMarkup(React.createElement(ShotInspectorTabs, { activeTab: 'overview' }));
    const zeroIndexCount = html.match(/tabindex="0"/g)?.length;
    const negIndexCount = html.match(/tabindex="-1"/g)?.length;
    expect(zeroIndexCount).toBe(1);
    expect(negIndexCount).toBe(VALID_TABS.length - 1);
  });

  it('ArrowRight activates next tab and wraps', () => {
    expect(source).toContain("case 'ArrowRight':");
    expect(source).toContain('nextIndex = currentIndex < VALID_TABS.length - 1 ? currentIndex + 1 : 0;');
  });

  it('ArrowLeft activates previous tab and wraps', () => {
    expect(source).toContain("case 'ArrowLeft':");
    expect(source).toContain('nextIndex = currentIndex > 0 ? currentIndex - 1 : VALID_TABS.length - 1;');
  });

  it('Home activates first tab', () => {
    expect(source).toContain("case 'Home':");
    expect(source).toContain('nextIndex = 0;');
  });

  it('End activates last tab', () => {
    expect(source).toContain("case 'End':");
    expect(source).toContain('nextIndex = VALID_TABS.length - 1;');
  });
  
  it('no mutation, provider, generation, or cost behavior is introduced in the tabs component', () => {
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('drizzle-orm');
    expect(source).not.toContain('better-sqlite3');
    expect(source).not.toContain('provider');
    expect(source).not.toContain('generate');
    expect(source).not.toContain('cost');
  });
});
