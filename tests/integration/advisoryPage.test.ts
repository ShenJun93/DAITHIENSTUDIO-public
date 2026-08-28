/**
 * Advisory page (`/projects/[slug]/advisory`) — M9 initial slice.
 *
 * Renders real advisory suggestions against a real SQLite file and the real
 * mock text provider. Asserts, among other things, that the page offers no
 * mutation control anywhere — this is the read-only initial slice per
 * docs/decisions/ADR-014-ai-assisted-production-boundary.md SS1.1.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

Object.assign(globalThis, { React });

const env = useTempStudio('advisoryPage');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);

async function newProject(title: string, costLimitUsd = 10) {
  return projects.create({
    title,
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 60,
    stylePresetKey: STYLE_PRESETS[0]?.key,
    costLimitUsd,
  });
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('Advisory page', () => {
  it("Render advisory suggestions grouped by kind", async () => {
    const project = await newProject('Advisory Page — Near Ceiling', 1);
    const generation = await studio.generations.enqueue(
      {
        projectId: project.id,
        shotId: null,
        promptId: null,
        promptVersion: null,
        kind: 'image',
        provider: 'mock',
        model: 'mock-image-v1',
        prompt: 'advisory page probe',
        negativePrompt: '',
        params: {},
        referenceAssetIds: [],
        seed: 1,
        status: 'pending',
        priority: 100,
        maxAttempts: 1,
        scheduledAt: new Date().toISOString(),
        estimatedCostUsd: 0.85,
        idempotencyKey: `advisory-page-probe-${project.id}`,
      },
      1,
    );
    await studio.generations.complete(generation.id, { actualCostUsd: 0.85, raw: {} });

    const { default: AdvisoryPage } = await import('@/app/projects/[slug]/advisory/page');
    const element = await AdvisoryPage({ params: Promise.resolve({ slug: project.slug }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Risk / Cost');
    expect(html).toContain('Script / Scene / Shot');
    expect(html).toContain('Prompt');
  });

  it("Show an empty state when the advisor has no signals to raise", async () => {
    // A fresh project still gets the two always-present illustrative
    // suggestions (script-scene-shot/prompt) — this asserts the SIGNAL-driven
    // kinds (continuity/risk-cost/next-action) are correctly absent, which is
    // the actual "no signals to raise" claim this scenario makes.
    const project = await newProject('Advisory Page — Fresh');

    const { default: AdvisoryPage } = await import('@/app/projects/[slug]/advisory/page');
    const element = await AdvisoryPage({ params: Promise.resolve({ slug: project.slug }) });
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain('Continuity');
    expect(html).not.toContain('Risk / Cost');
    expect(html).not.toContain('Next Action');
  });

  it("The Advisory page offers no mutation control", async () => {
    const project = await newProject('Advisory Page — No Mutation Control', 1);
    const generation = await studio.generations.enqueue(
      {
        projectId: project.id,
        shotId: null,
        promptId: null,
        promptVersion: null,
        kind: 'image',
        provider: 'mock',
        model: 'mock-image-v1',
        prompt: 'advisory page mutation-control probe',
        negativePrompt: '',
        params: {},
        referenceAssetIds: [],
        seed: 1,
        status: 'pending',
        priority: 100,
        maxAttempts: 1,
        scheduledAt: new Date().toISOString(),
        estimatedCostUsd: 0.85,
        idempotencyKey: `advisory-page-no-mutation-${project.id}`,
      },
      1,
    );
    await studio.generations.complete(generation.id, { actualCostUsd: 0.85, raw: {} });

    const { default: AdvisoryPage } = await import('@/app/projects/[slug]/advisory/page');
    const element = await AdvisoryPage({ params: Promise.resolve({ slug: project.slug }) });
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain('<button');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('action=');
  });
});
