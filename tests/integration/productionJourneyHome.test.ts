import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('production-journey-home');

const { getStudio } = await import('@/infrastructure/container');
const { runMigrations } = await import('@/infrastructure/db/migrate');
const { createProjectService } = await import('@/application/services/projectService');
const { createProductionJourneyService } = await import('@/application/services/productionJourneyService');
const { ProductionJourneyHome } = await import('@/components/creative-workspace/ProductionJourneyHome');

Object.assign(globalThis, { React });

const studio = getStudio();
const projects = createProjectService(studio);
const journeyService = createProductionJourneyService(studio);

beforeAll(() => runMigrations());
afterAll(() => env.cleanup());

describe('production journey home shell — rendered from real persisted data', () => {
  it('renders the real productionJourneyService result for a freshly created project without recomputing it', async () => {
    const project = await projects.create({
      title: 'Journey Home Render',
      stylePresetKey: 'no-such-preset',
      productionType: 'motion-comic',
    });
    const journey = await journeyService.overview(project.slug);

    const html = renderToStaticMarkup(React.createElement(ProductionJourneyHome, { journey }));

    expect(html).toContain('Setup');
    expect(html).toContain('Develop');
    expect(html).toContain('Plan');
    expect(html).toContain('Produce');
    expect(html).toContain('Review');
    expect(html).toContain('Finish');
    expect(html).toContain('Complete'); // Setup is complete: one episode exists.
    expect(html).toContain('Not started'); // Develop/Plan/Produce/Review/Finish have no scenes/shots yet.
    expect(html).toContain(journey.primaryAction!.label);
    expect(html).toContain(`href="${journey.primaryAction!.targetRoute}"`);
  });
});
