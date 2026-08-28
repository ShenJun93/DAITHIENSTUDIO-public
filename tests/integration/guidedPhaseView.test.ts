import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTempStudio } from '../helpers/studio';

const env = useTempStudio('guided-phase-view');

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

describe('guided phase view — rendered from real persisted data', () => {
  it('renders the guided view for the real current phase of a freshly created project without recomputing it', async () => {
    const project = await projects.create({ title: 'Guided Phase View Render', stylePresetKey: 'no-such-preset' });
    const journey = await journeyService.overview(project.slug);

    const html = renderToStaticMarkup(React.createElement(ProductionJourneyHome, { journey }));

    expect(html).toContain(`Guided view: ${journey.currentPhase.charAt(0).toUpperCase()}${journey.currentPhase.slice(1)}`);
    expect(html).toContain('Completion criteria');
    expect(html).toContain('Open a module');
  });
});
