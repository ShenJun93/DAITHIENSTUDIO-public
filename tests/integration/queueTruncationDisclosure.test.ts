/**
 * Queue page (`/projects/[slug]/queue`) truncation disclosure.
 *
 * The job table is capped to the 200 most recent rows
 * (`studio.generations.listByProject(projectId, { limit: 200 })`), while the
 * status Stat cards render true, uncapped totals from `countByStatus`. Once
 * a project's generation history exceeds 200 rows, those two figures
 * disagree — this must be disclosed to the operator, not silent.
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
    useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined, refresh: () => undefined }),
    usePathname: () => '/projects/test/queue',
    useSearchParams: () => ({ toString: () => '', get: () => null }),
  };
});

const env = useTempStudio('queueTruncationDisclosure');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');

const studio = getStudio();
const projects = createProjectService(studio);

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

function generationInput(projectId: string, seed: number) {
  return {
    projectId,
    shotId: null,
    promptId: null,
    promptVersion: null,
    kind: 'image' as const,
    provider: 'mock',
    model: 'mock-image-v1',
    prompt: `truncation probe ${seed}`,
    negativePrompt: '',
    params: {},
    referenceAssetIds: [],
    seed,
    status: 'completed' as const,
    priority: 100,
    maxAttempts: 1,
    scheduledAt: new Date().toISOString(),
    estimatedCostUsd: 0,
    idempotencyKey: `truncation-probe-${projectId}-${seed}`,
  };
}

async function seedGenerations(projectId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await studio.generations.enqueue(generationInput(projectId, i), 100_000);
  }
}

describe('Queue page truncation disclosure', () => {
  it('shows no truncation notice when total generations is within the 200-row cap', async () => {
    const project = await projects.create({
      title: 'Queue Truncation — Under Cap',
      aspectRatio: '16:9',
      durationTargetSeconds: 60,
      costLimitUsd: 100_000,
    });
    await seedGenerations(project.id, 5);

    const { default: QueuePage } = await import('@/app/projects/[slug]/queue/page');
    const element = await QueuePage({ params: Promise.resolve({ slug: project.slug }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Jobs (5)');
    expect(html).not.toMatch(/most recent .* of \d+ total/i);
  });

  it('discloses truncation with the true total when generations exceed the 200-row cap', async () => {
    const project = await projects.create({
      title: 'Queue Truncation — Over Cap',
      aspectRatio: '16:9',
      durationTargetSeconds: 60,
      costLimitUsd: 100_000,
    });
    await seedGenerations(project.id, 205);

    const { default: QueuePage } = await import('@/app/projects/[slug]/queue/page');
    const element = await QueuePage({ params: Promise.resolve({ slug: project.slug }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Jobs (200)');
    expect(html).toMatch(/200 most recent .* of 205 total/i);
  });
});
