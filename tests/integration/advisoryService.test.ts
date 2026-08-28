/**
 * Advisory service — M9 initial slice (read/analyze/propose only).
 *
 * Suggestions are derived from real, persisted project signals (continuity
 * findings, cost vs. ceiling, shot readiness) against a real SQLite file and
 * the real mock text provider. Nothing here persists anything — every
 * assertion re-fetches suggestions fresh.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('advisoryService');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createAdvisoryService } = await import('@/application/services/advisoryService');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const advisory = createAdvisoryService(studio);

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

describe('advisory service (M9 initial slice)', () => {
  it('returns no continuity/risk-cost/next-action suggestion for a fresh, signal-free project', async () => {
    const project = await newProject('Advisory — Fresh Project');

    const suggestions = await advisory.getSuggestions(project.slug);

    expect(suggestions.some((s) => s.kind === 'continuity')).toBe(false);
    expect(suggestions.some((s) => s.kind === 'risk-cost')).toBe(false);
    expect(suggestions.some((s) => s.kind === 'next-action')).toBe(false);
    // The two illustrative kinds are always present, proving all 5 kinds flow end to end.
    expect(suggestions.some((s) => s.kind === 'script-scene-shot')).toBe(true);
    expect(suggestions.some((s) => s.kind === 'prompt')).toBe(true);
  });

  it('surfaces a risk-cost suggestion once spend exceeds 80% of the project cost ceiling', async () => {
    const project = await newProject('Advisory — Near Ceiling', 1);

    const generation = await studio.generations.enqueue(
      {
        projectId: project.id,
        shotId: null,
        promptId: null,
        promptVersion: null,
        kind: 'image',
        provider: 'mock',
        model: 'mock-image-v1',
        prompt: 'advisory cost probe',
        negativePrompt: '',
        params: {},
        referenceAssetIds: [],
        seed: 1,
        status: 'pending',
        priority: 100,
        maxAttempts: 1,
        scheduledAt: new Date().toISOString(),
        estimatedCostUsd: 0.85,
        idempotencyKey: `advisory-cost-probe-${project.id}`,
      },
      1,
    );
    await studio.generations.complete(generation.id, { actualCostUsd: 0.85, raw: {} });

    const suggestions = await advisory.getSuggestions(project.slug);
    const riskCost = suggestions.find((s) => s.kind === 'risk-cost');

    expect(riskCost).toBeDefined();
    expect(riskCost?.message).toContain('85%');
  });

  it('rejects a project that does not exist', async () => {
    await expect(advisory.getSuggestions('no-such-project-slug')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
