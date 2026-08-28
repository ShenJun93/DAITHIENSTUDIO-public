import { describe, expect, it } from 'vitest';
// Raw source text (Vite's built-in ?raw import) — proves wiring and
// regression-protects existing Overview content without node:fs, which is
// off-limits outside src/infrastructure/**/scripts/**.
import projectOverviewPageSource from '@/app/projects/[slug]/page.tsx?raw';
import projectLayoutSource from '@/app/projects/[slug]/layout.tsx?raw';
import productionJourneyHomeSource from '@/components/creative-workspace/ProductionJourneyHome.tsx?raw';
import productionJourneyFeatureSource from '../../docs/acceptance/production-journey.feature?raw';

describe('production journey home shell — wiring and regression protection', () => {
  it('Project Overview calls/consumes productionJourneyService', () => {
    expect(projectOverviewPageSource).toContain("import { createProductionJourneyService } from '@/application/services/productionJourneyService'");
    expect(projectOverviewPageSource).toMatch(/createProductionJourneyService\(studio\)\.overview\(/);
    expect(projectOverviewPageSource).toContain('<ProductionJourneyHome journey={journey} />');
  });

  it('Existing Overview sections remain present', () => {
    expect(projectOverviewPageSource).toContain('<WorkspaceOverview workspace={workspace} />');
    expect(projectOverviewPageSource).toContain('title="Actions"');
    expect(projectOverviewPageSource).toContain('title="Workflow runs"');
    expect(projectOverviewPageSource).toContain('title="Episodes"');
  });

  it('Existing forms/actions remain discoverable', () => {
    expect(projectOverviewPageSource).toContain('buildPromptsAction.bind(null, slug,');
    expect(projectOverviewPageSource).toContain('runWorkflowAction.bind(null, slug,');
    expect(projectOverviewPageSource).toContain('<EpisodeList');
    expect(projectOverviewPageSource).toContain('<CreateEpisodeForm');
  });

  it('Existing routes remain unchanged: no new project route or second dashboard was added', () => {
    // Same project nav groups/labels as before this slice — no Journey route added.
    for (const label of [
      'Overview', 'Characters', 'Locations',
      'Story', 'Script', 'Bibles',
      'Shots', 'Assets', 'Production', 'Voice', 'Sound',
      'Continuity', 'Queue', 'Workflow', 'Timeline & Export',
    ]) {
      expect(projectLayoutSource, `nav item "${label}" is missing`).toContain(`label: '${label}'`);
    }
    expect(projectLayoutSource).not.toContain("label: 'Journey'");
    expect(projectLayoutSource.match(/aria-label="Project workspace"/g)).toHaveLength(1);
  });

  it('ProductionJourneyHome additively composes the Slice 3 GuidedPhaseView, without removing any Slice 2 section', () => {
    expect(productionJourneyHomeSource).toContain("import { GuidedPhaseView } from './GuidedPhaseView'");
    expect(productionJourneyHomeSource).toContain('<GuidedPhaseView journey={journey} />');
    // Every Slice 2 section still renders, in its original order, before the new Slice 3 section.
    const phaseStripIndex = productionJourneyHomeSource.indexOf('<JourneyPhaseStrip');
    const primaryActionIndex = productionJourneyHomeSource.indexOf('<JourneyPrimaryAction');
    const issueSummaryIndex = productionJourneyHomeSource.indexOf('<JourneyIssueSummary');
    const progressSummaryIndex = productionJourneyHomeSource.indexOf('<JourneyProgressSummary');
    const guidedViewIndex = productionJourneyHomeSource.indexOf('<GuidedPhaseView');
    expect(phaseStripIndex).toBeGreaterThan(-1);
    expect(primaryActionIndex).toBeGreaterThan(phaseStripIndex);
    expect(issueSummaryIndex).toBeGreaterThan(primaryActionIndex);
    expect(progressSummaryIndex).toBeGreaterThan(issueSummaryIndex);
    expect(guidedViewIndex).toBeGreaterThan(progressSummaryIndex);
  });

  it('No duplicate active acceptance scenarios', () => {
    const titles = [...productionJourneyFeatureSource.matchAll(/^\s*Scenario:\s*(.+?)\s*$/gm)].map((match) => match[1]);
    expect(titles.length).toBeGreaterThan(0);
    const counts = new Map<string, number>();
    for (const title of titles) counts.set(title!, (counts.get(title!) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
    expect(duplicates).toEqual([]);
  });
});
