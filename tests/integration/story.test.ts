/**
 * Story Development module (TASK-004): premise -> logline / synopsis / theme
 * / tone / hook / cliffhanger / beats, persisted on the project's creative
 * brief, against a real SQLite file and the real mock provider.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('story');

// Imported after the environment is pointed at the temp database.
const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createStoryService } = await import('@/application/services/storyService');
const { STYLE_PRESETS } = await import('@/domain/styles/presets');

const studio = getStudio();
const projects = createProjectService(studio);
const story = createStoryService(studio);

const PREMISE =
  'Một tu sĩ trẻ tự xưng là thiên tài tu tiên nhưng kiếm thuật lại kém cỏi. Cậu quyết tâm luyện lại từ đầu. ' +
  'Sư muội của cậu âm thầm ghi chép từng lần thất bại vào một cuốn sổ.';

async function newProjectSlug(title: string): Promise<string> {
  const project = await projects.create({
    title,
    description: '',
    aspectRatio: '16:9',
    durationTargetSeconds: 120,
    stylePresetKey: STYLE_PRESETS[0]?.key,
  });
  return project.slug;
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  env.cleanup();
});

describe('story development', () => {
  it('Turn a premise into a logline, a synopsis and a beat sheet', async () => {
    const slug = await newProjectSlug('Story Test — Generate');
    const before = await story.get(slug);
    expect(before.brief.logline).toBe('');

    const result = await story.generate(slug, { premise: PREMISE });

    expect(result.brief.logline.length).toBeGreaterThan(0);
    expect(result.brief.synopsis.length).toBeGreaterThan(0);
    expect(result.brief.beats.length).toBeGreaterThanOrEqual(3);
    expect(result.brief.premise).toBe(PREMISE);
    expect(result.skipped).toEqual([]);
  });

  it('The story brief survives a reload', async () => {
    const slug = await newProjectSlug('Story Test — Reload');
    const generated = await story.generate(slug, { premise: PREMISE });

    const reloaded = await story.get(slug);

    expect(reloaded.brief.logline).toBe(generated.brief.logline);
    expect(reloaded.brief.synopsis).toBe(generated.brief.synopsis);
    expect(reloaded.brief.beats).toEqual(generated.brief.beats);
  });

  it('Regenerating one part leaves the accepted parts untouched', async () => {
    const slug = await newProjectSlug('Story Test — Regenerate One Part');
    const generated = await story.generate(slug, { premise: PREMISE });
    const originalLogline = generated.brief.logline;

    await story.accept(slug, { parts: ['logline'] });

    const differentPremise = `${PREMISE} Lần này có thêm một con yêu thú cản đường.`;
    const afterRegenerate = await story.regeneratePart(slug, { part: 'synopsis', premise: differentPremise });

    expect(afterRegenerate.brief.synopsis).not.toBe(generated.brief.synopsis);
    expect(afterRegenerate.brief.logline).toBe(originalLogline);
    expect(afterRegenerate.approvedParts).toEqual(['logline']);
  });

  it('An approved part cannot be silently overwritten', async () => {
    const slug = await newProjectSlug('Story Test — Locked Part');
    const generated = await story.generate(slug, { premise: PREMISE });
    const originalLogline = generated.brief.logline;

    await story.accept(slug, { parts: ['logline'] });

    await expect(story.regeneratePart(slug, { part: 'logline' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(story.save(slug, { logline: 'a silent overwrite attempt' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const after = await story.get(slug);
    expect(after.brief.logline).toBe(originalLogline);
  });

  it('A provider failure leaves the existing brief intact', async () => {
    const slug = await newProjectSlug('Story Test — Provider Failure');
    const generated = await story.generate(slug, { premise: PREMISE });

    const originalProviders = studio.providers;
    const brokenStudio = {
      ...studio,
      providers: {
        descriptors: (...args: Parameters<typeof originalProviders.descriptors>) =>
          originalProviders.descriptors(...args),
        image: (...args: Parameters<typeof originalProviders.image>) => originalProviders.image(...args),
        video: (...args: Parameters<typeof originalProviders.video>) => originalProviders.video(...args),
        voice: (...args: Parameters<typeof originalProviders.voice>) => originalProviders.voice(...args),
        music: (...args: Parameters<typeof originalProviders.music>) => originalProviders.music(...args),
        sound: (...args: Parameters<typeof originalProviders.sound>) => originalProviders.sound(...args),
        text: (): never => {
          throw new Error('simulated provider outage');
        },
        defaultKeyFor: (...args: Parameters<typeof originalProviders.defaultKeyFor>) =>
          originalProviders.defaultKeyFor(...args),
        defaultModelFor: (...args: Parameters<typeof originalProviders.defaultModelFor>) =>
          originalProviders.defaultModelFor(...args),
      },
    };
    const brokenStory = createStoryService(brokenStudio);

    await expect(brokenStory.regeneratePart(slug, { part: 'synopsis' })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });

    const after = await story.get(slug);
    expect(after.brief.logline).toBe(generated.brief.logline);
    expect(after.brief.synopsis).toBe(generated.brief.synopsis);
  });
});
